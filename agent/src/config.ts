import crypto from "node:crypto";

function ensureKey(input: string): Buffer {
  const raw = Buffer.from(input, "base64");
  if (raw.length === 32) return raw;
  return crypto.createHash("sha256").update(input).digest();
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  dataFile: process.env.DATA_FILE ?? "./data/store.json",
  tokenEncryptionKey: ensureKey(process.env.TOKEN_ENCRYPTION_KEY ?? "dev-only-change-this-key"),
  http: {
    timeoutMs: Number(process.env.HTTP_TIMEOUT_MS ?? 8000),
    retryMax: Number(process.env.HTTP_RETRY_MAX ?? 2),
    retryBaseDelayMs: Number(process.env.HTTP_RETRY_BASE_DELAY_MS ?? 200)
  },
  feishu: {
    appId: process.env.FEISHU_APP_ID ?? "",
    appSecret: process.env.FEISHU_APP_SECRET ?? "",
    redirectUri: process.env.FEISHU_REDIRECT_URI ?? "",
    baseUrl: (process.env.FEISHU_BASE_URL ?? "https://open.feishu.cn").replace(/\/$/, "")
  },
  yuque: {
    baseUrl: (process.env.YUQUE_BASE_URL ?? "https://www.yuque.com").replace(/\/$/, "")
  }
};

/**
 * True when FEISHU_APP_ID + FEISHU_APP_SECRET are both non-empty.
 * Used by auth_service and feishuAdapter to gate real vs. mock code paths.
 */
export function feishuConfigured(): boolean {
  // Read from process.env at call time so tests can toggle without re-import.
  // In production, env vars are set before process start, so this remains stable.
  return Boolean((process.env.FEISHU_APP_ID ?? config.feishu.appId) && (process.env.FEISHU_APP_SECRET ?? config.feishu.appSecret));
}
