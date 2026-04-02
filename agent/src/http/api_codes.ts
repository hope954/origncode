/**
 * Numeric API codes — aligned with `docs/master-spec-private-doc-resume-highlights.md` §15.2
 * plus implementation-only extensions documented in `openspec/.../specs/http-api-response.md`.
 */
export const ApiCode = {
  OK: 0,
  INVALID_PARAMS: 4001,
  INVALID_URL: 4002,
  UNSUPPORTED_PLATFORM: 4003,
  AUTH_REQUIRED: 4004,
  ACCESS_DENIED: 4005,
  EMPTY_CONTENT: 4006,
  NOT_FOUND: 4007,
  FETCH_FAILED: 5001,
  PARSE_FAILED: 5002,
  GENERATION_FAILED: 5003,
  INTERNAL_ERROR: 5004
} as const;

export type ApiCodeValue = (typeof ApiCode)[keyof typeof ApiCode];

export function okBody<T>(data: T): { code: number; message: string; data: T } {
  return { code: ApiCode.OK, message: "ok", data };
}

export function errBody(code: ApiCodeValue, message: string, data?: Record<string, unknown>): { code: number; message: string; data?: Record<string, unknown> } {
  if (data !== undefined) return { code, message, data };
  return { code, message };
}
