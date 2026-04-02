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
  return Boolean(config.feishu.appId && config.feishu.appSecret);
}
