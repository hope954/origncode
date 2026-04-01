import crypto from "node:crypto";

function ensureKey(input: string): Buffer {
  const raw = Buffer.from(input, "base64");
  if (raw.length === 32) return raw;
  return crypto.createHash("sha256").update(input).digest();
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  dataFile: process.env.DATA_FILE ?? "./data/store.json",
  tokenEncryptionKey: ensureKey(process.env.TOKEN_ENCRYPTION_KEY ?? "dev-only-change-this-key")
};
