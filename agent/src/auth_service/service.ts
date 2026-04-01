/**
 * Auth service — OAuth / token lifecycle and Yuque manual token.
 *
 * MOCK FEISHU EXCHANGE: `handleFeishuCallback` and `refreshFeishuToken` synthesize tokens
 * from auth_code / refresh material. Real implementation must call Feishu token endpoints
 * and map responses (see README “真实平台接入待替换点”). Phase 2 must not assume these mocks
 * are real API semantics.
 */
import { config } from "../config.js";
import { Repository } from "../storage/repository.js";
import type { Platform, PlatformAuth, PlatformAuthStatus } from "../types.js";
import { decryptToken, encryptToken } from "../utils/crypto.js";
import { makeId } from "../utils/id.js";

interface SaveTokenInput {
  user_id: string;
  session_id?: string;
  token: string;
  expire_at?: string;
}

export class AuthService {
  constructor(private readonly repo: Repository) {}

  getAuthUrl(userId: string, sessionId: string): string {
    const state = encodeURIComponent(`${userId}:${sessionId}`);
    return `https://open.feishu.cn/open-apis/authen/v1/index?state=${state}`;
  }

  handleFeishuCallback(userId: string, sessionId: string, authCode: string): PlatformAuth {
    const accessToken = `feishu_at_${authCode}_${Date.now()}`;
    const refreshToken = `feishu_rt_${authCode}_${Date.now()}`;
    return this.savePlatformAuth("feishu", {
      user_id: userId,
      session_id: sessionId,
      token: accessToken,
      expire_at: new Date(Date.now() + 1000 * 60 * 60).toISOString()
    }, refreshToken);
  }

  refreshFeishuToken(userId: string, sessionId?: string): PlatformAuth | undefined {
    const auth = this.findAuth("feishu", userId, sessionId);
    if (!auth?.refresh_token_encrypted) return undefined;
    const refreshToken = decryptToken(auth.refresh_token_encrypted, config.tokenEncryptionKey);
    const newToken = `feishu_at_refresh_${refreshToken.slice(0, 10)}_${Date.now()}`;
    return this.savePlatformAuth("feishu", {
      user_id: userId,
      session_id: sessionId,
      token: newToken,
      expire_at: new Date(Date.now() + 1000 * 60 * 60).toISOString()
    }, refreshToken);
  }

  verifyYuqueToken(token: string): boolean {
    return token.startsWith("yq_") && token.length >= 16;
  }

  saveYuqueToken(input: SaveTokenInput): PlatformAuth {
    if (!this.verifyYuqueToken(input.token)) {
      throw new Error("token_invalid");
    }
    return this.savePlatformAuth("yuque", input);
  }

  deleteYuqueToken(userId: string, sessionId?: string): void {
    this.repo.mutate((data) => {
      data.platformAuths = data.platformAuths.map((item) => {
        if (item.platform === "yuque" && item.user_id === userId && (!sessionId || item.session_id === sessionId)) {
          return { ...item, auth_status: "revoked", access_token_encrypted: undefined, token_expire_at: undefined, updated_at: new Date().toISOString() };
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
