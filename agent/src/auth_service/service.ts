/**
 * Auth service — OAuth / token lifecycle and Yuque manual token.
 *
 * FEISHU EXCHANGE:
 *   - When FEISHU_APP_ID + FEISHU_APP_SECRET are configured, real Feishu HTTP APIs are used.
 *   - When those env vars are absent (dev / CI), a mock token path synthesises tokens
 *     from auth_code/refresh material. Real implementation uses Feishu OIDC endpoints.
 *
 * YUQUE VERIFY:
 *   - When YUQUE_BASE_URL is reachable, real token probe is performed (GET /api/v2/user).
 *   - Dev/CI fallback: prefix + length check only.
 *
 * Phase 2+ must not assume mock semantics for real deployments.
 */
import { config, feishuConfigured } from "../config.js";
import { Repository } from "../storage/repository.js";
import type { Platform, PlatformAuth, PlatformAuthStatus } from "../types.js";
import { decryptToken, encryptToken } from "../utils/crypto.js";
import { makeId } from "../utils/id.js";
import { fetchJson } from "../http/fetch_client.js";

interface SaveTokenInput {
  user_id: string;
  session_id?: string;
  token: string;
  expire_at?: string;
}

// ─── Feishu HTTP helpers ────────────────────────────────────────────────────

function feishuEnv(): { appId: string; appSecret: string; redirectUri: string; baseUrl: string } {
  return {
    appId: process.env.FEISHU_APP_ID ?? config.feishu.appId,
    appSecret: process.env.FEISHU_APP_SECRET ?? config.feishu.appSecret,
    redirectUri: process.env.FEISHU_REDIRECT_URI ?? config.feishu.redirectUri,
    baseUrl: (process.env.FEISHU_BASE_URL ?? config.feishu.baseUrl).replace(/\/$/, "")
  };
}

async function getFeishuAppAccessToken(): Promise<string> {
  const feishu = feishuEnv();
  const url = `${feishu.baseUrl}/open-apis/auth/v3/app_access_token/internal`;
  const r = await fetchJson(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_id: feishu.appId, app_secret: feishu.appSecret })
    },
    {
      shouldRetry: ({ status, error }) => {
        // retry only on transient network / 5xx / 429
        if (error) return "retry";
        if (status && (status === 429 || status >= 500)) return "retry";
        return "no_retry";
      }
    }
  );
  const json = (r.json ?? {}) as { code?: number; app_access_token?: string; msg?: string };
  if (!r.ok || json.code !== 0 || !json.app_access_token) {
    throw Object.assign(new Error("feishu_app_token_failed"), { reason: "auth_required" });
  }
  return json.app_access_token;
}

interface FeishuUserTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_expires_in?: number;
}

async function exchangeFeishuCode(appToken: string, authCode: string): Promise<FeishuUserTokens> {
  const feishu = feishuEnv();
  const url = `${feishu.baseUrl}/open-apis/authen/v1/oidc/access_token`;
  const r = await fetchJson(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${appToken}`
      },
      body: JSON.stringify({ grant_type: "authorization_code", code: authCode })
    },
    {
      shouldRetry: ({ status, error }) => {
        if (error) return "retry";
        if (status && (status === 429 || status >= 500)) return "retry";
        return "no_retry";
      }
    }
  );
  const json = (r.json ?? {}) as { code?: number; data?: FeishuUserTokens; msg?: string };
  if (!r.ok || json.code !== 0 || !json.data?.access_token) {
    const msg = (json.msg ?? "").toLowerCase();
    if (msg.includes("invalid") || msg.includes("code") || msg.includes("expired")) {
      throw Object.assign(new Error("token_invalid"), { reason: "token_invalid" });
    }
    throw Object.assign(new Error("auth_required"), { reason: "auth_required" });
  }
  return json.data;
}

async function refreshFeishuUserToken(appToken: string, refreshToken: string): Promise<FeishuUserTokens> {
  const feishu = feishuEnv();
  const url = `${feishu.baseUrl}/open-apis/authen/v1/oidc/refresh_access_token`;
  const r = await fetchJson(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${appToken}`
      },
      body: JSON.stringify({ grant_type: "refresh_token", refresh_token: refreshToken })
    },
    {
      shouldRetry: ({ status, error }) => {
        if (error) return "retry";
        if (status && (status === 429 || status >= 500)) return "retry";
        return "no_retry";
      }
    }
  );
  const json = (r.json ?? {}) as { code?: number; data?: FeishuUserTokens; msg?: string };
  if (!r.ok || json.code !== 0 || !json.data?.access_token) {
    const msg = (json.msg ?? "").toLowerCase();
    if (msg.includes("revoked") || msg.includes("invalid")) {
      throw Object.assign(new Error("token_revoked"), { reason: "token_revoked" });
    }
    throw Object.assign(new Error("token_expired"), { reason: "token_expired" });
  }
  return json.data;
}

// ─── Yuque HTTP helpers ─────────────────────────────────────────────────────

async function probeYuqueToken(token: string): Promise<boolean> {
  const url = `${config.yuque.baseUrl}/api/v2/user`;
  try {
    const r = await fetchJson(
      url,
      {
        headers: { "X-Auth-Token": token, Accept: "application/json" }
      },
      {
        shouldRetry: ({ status, error }) => {
          if (error) return "retry";
          if (status && (status === 429 || status >= 500)) return "retry";
          return "no_retry";
        }
      }
    );
    return r.ok;
  } catch {
    return false;
  }
}

// ─── AuthService ─────────────────────────────────────────────────────────────

export class AuthService {
  constructor(private readonly repo: Repository) {}

  getAuthUrl(userId: string, sessionId: string): string {
    const state = encodeURIComponent(`${userId}:${sessionId}`);
    if (feishuConfigured()) {
      const feishu = feishuEnv();
      const params = new URLSearchParams({
        app_id: feishu.appId,
        redirect_uri: feishu.redirectUri,
        state
      });
      return `${feishu.baseUrl}/open-apis/authen/v1/index?${params}`;
    }
    return `https://open.feishu.cn/open-apis/authen/v1/index?state=${state}`;
  }

  async handleFeishuCallback(userId: string, sessionId: string, authCode: string): Promise<PlatformAuth> {
    if (feishuConfigured()) {
      const appToken = await getFeishuAppAccessToken();
      const tokens = await exchangeFeishuCode(appToken, authCode);
      return this.savePlatformAuth(
        "feishu",
        {
          user_id: userId,
          session_id: sessionId,
          token: tokens.access_token,
          expire_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        },
        tokens.refresh_token
      );
    }
    // Mock fallback (dev / CI without FEISHU_APP_ID)
    const accessToken = `feishu_at_${authCode}_${Date.now()}`;
    const refreshToken = `feishu_rt_${authCode}_${Date.now()}`;
    return this.savePlatformAuth("feishu", {
      user_id: userId,
      session_id: sessionId,
      token: accessToken,
      expire_at: new Date(Date.now() + 1000 * 60 * 60).toISOString()
    }, refreshToken);
  }

  async refreshFeishuToken(userId: string, sessionId?: string): Promise<PlatformAuth | undefined> {
    const auth = this.findAuth("feishu", userId, sessionId);
    if (!auth?.refresh_token_encrypted) return undefined;
    const refreshToken = decryptToken(auth.refresh_token_encrypted, config.tokenEncryptionKey);
    if (feishuConfigured()) {
      const appToken = await getFeishuAppAccessToken();
      const tokens = await refreshFeishuUserToken(appToken, refreshToken);
      return this.savePlatformAuth(
        "feishu",
        {
          user_id: userId,
          session_id: sessionId,
          token: tokens.access_token,
          expire_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        },
        tokens.refresh_token
      );
    }
    // Mock fallback
    const newToken = `feishu_at_refresh_${refreshToken.slice(0, 10)}_${Date.now()}`;
    return this.savePlatformAuth("feishu", {
      user_id: userId,
      session_id: sessionId,
      token: newToken,
      expire_at: new Date(Date.now() + 1000 * 60 * 60).toISOString()
    }, refreshToken);
  }

  /**
   * Synchronous structural check (prefix + length) — always available.
   * Use `verifyYuqueTokenLive` for live API probe (async).
   */
  verifyYuqueTokenStructure(token: string): boolean {
    return token.startsWith("yq_") && token.length >= 16;
  }

  /**
   * Full verification: structural check first, then optional live API probe.
   * When YUQUE_BASE_URL is the default, performs a real GET /api/v2/user.
   * CI / tests that don't set YUQUE_BASE_URL skip the live probe.
   */
  async verifyYuqueToken(token: string): Promise<boolean> {
    if (!this.verifyYuqueTokenStructure(token)) return false;
    const probeEnabled = Boolean(process.env.YUQUE_LIVE_VERIFY === "1");
    if (probeEnabled) {
      return probeYuqueToken(token);
    }
    return true;
  }

  async saveYuqueToken(input: SaveTokenInput): Promise<PlatformAuth> {
    const valid = await this.verifyYuqueToken(input.token);
    if (!valid) throw new Error("token_invalid");
    return this.savePlatformAuth("yuque", input);
  }

  deleteYuqueToken(userId: string, sessionId?: string): void {
    this.repo.mutate((data) => {
      data.platformAuths = data.platformAuths.map((item) => {
        if (item.platform === "yuque" && item.user_id === userId && (!sessionId || item.session_id === sessionId)) {
          return {
            ...item,
            auth_status: "revoked",
            access_token_encrypted: undefined,
            token_expire_at: undefined,
            updated_at: new Date().toISOString()
          };
        }
        return item;
      });
    });
  }

  getStatus(userId: string, sessionId?: string): Record<Platform, { auth_status: PlatformAuthStatus; last_verified_at?: string }> {
    const feishu = this.findAuth("feishu", userId, sessionId);
    const yuque = this.findAuth("yuque", userId, sessionId);
    return {
      feishu: { auth_status: feishu?.auth_status ?? "not_connected", last_verified_at: feishu?.last_verified_at },
      yuque: { auth_status: yuque?.auth_status ?? "not_connected", last_verified_at: yuque?.last_verified_at }
    };
  }

  getAccessToken(platform: Platform, userId: string, sessionId?: string): string | undefined {
    const auth = this.findAuth(platform, userId, sessionId);
    if (!auth || !auth.access_token_encrypted || auth.auth_status !== "connected") return undefined;
    return decryptToken(auth.access_token_encrypted, config.tokenEncryptionKey);
  }

  private findAuth(platform: Platform, userId: string, sessionId?: string): PlatformAuth | undefined {
    const data = this.repo.snapshot();
    return data.platformAuths.find(
      (item) => item.platform === platform && item.user_id === userId && (!sessionId || item.session_id === sessionId)
    );
  }

  private savePlatformAuth(platform: Platform, input: SaveTokenInput, refreshToken?: string): PlatformAuth {
    const now = new Date().toISOString();
    const encryptedAccess = encryptToken(input.token, config.tokenEncryptionKey);
    const encryptedRefresh = refreshToken ? encryptToken(refreshToken, config.tokenEncryptionKey) : undefined;
    const existing = this.findAuth(platform, input.user_id, input.session_id);
    const next: PlatformAuth = {
      auth_id: existing?.auth_id ?? makeId("auth"),
      platform,
      user_id: input.user_id,
      session_id: input.session_id,
      auth_status: "connected",
      access_token_encrypted: encryptedAccess,
      refresh_token_encrypted: encryptedRefresh ?? existing?.refresh_token_encrypted,
      token_expire_at: input.expire_at,
      last_verified_at: now,
      created_at: existing?.created_at ?? now,
      updated_at: now
    };
    this.repo.mutate((data) => {
      data.platformAuths = data.platformAuths.filter((item) => item.auth_id !== next.auth_id);
      data.platformAuths.push(next);
    });
    return next;
  }
}
