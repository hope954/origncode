import crypto from "node:crypto";

export function makeId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(6).toString("hex")}`;
}
