type LogLevel = "info" | "warn" | "error";

function safeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") {
    // Avoid leaking tokens, long payloads, or document content.
    const s = value;
    if (s.includes("feishu_at_") || s.includes("feishu_rt_") || s.startsWith("yq_")) return "[REDACTED]";
    if (s.length > 200) return `${s.slice(0, 200)}…[TRUNCATED]`;
    return s;
  }
  if (Array.isArray(value)) return value.slice(0, 20).map(safeValue);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const key = k.toLowerCase();
      if (key.includes("token") || key.includes("secret") || key.includes("authorization")) {
        out[k] = "[REDACTED]";
        continue;
      }
      if (key.includes("content") || key.includes("body") || key.includes("raw") || key.includes("document")) {
        // We still allow small identifiers like doc_id; large text should be redacted by caller.
        out[k] = safeValue(v);
        continue;
      }
      out[k] = safeValue(v);
    }
    return out;
  }
  return String(value);
}

function sanitizeFields(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = safeValue(v);
  }
  return out;
}

/**
 * Structured, machine-friendly logs.
 *
 * Constraints:
 * - Never log access/refresh tokens in plaintext.
 * - Never log full document text.
 */
export function logEvent(level: LogLevel, event: string, fields: Record<string, unknown> = {}): void {
  const safeFields = sanitizeFields(fields);
  const line = {
    ts: new Date().toISOString(),
    level,
    event,
    ...safeFields
  };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(line));
}

