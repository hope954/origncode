import { ApiCode } from "./api_codes.js";

export type ErrorReason =
  | "token_expired"
  | "token_invalid"
  | "token_revoked"
  | "access_denied"
  | "fetch_failed"
  | "auth_required"
  | "unsupported_platform"
  | "invalid_params"
  | "not_found"
  | "generation_failed"
  | "internal_error"
  | string;

export function mapErrorReasonToApi(reason: ErrorReason): { code: number; message: string } {
  switch (reason) {
    case "token_expired":
      return { code: ApiCode.INVALID_PARAMS, message: "token_expired" };
    case "token_invalid":
      return { code: ApiCode.INVALID_PARAMS, message: "token_invalid" };
    // 收口：不扩展新语义到 API 契约；revoked 统一按 invalid 处理。
    case "token_revoked":
      return { code: ApiCode.INVALID_PARAMS, message: "token_invalid" };
    case "access_denied":
      return { code: ApiCode.ACCESS_DENIED, message: "access_denied" };
    case "fetch_failed":
      return { code: ApiCode.FETCH_FAILED, message: "fetch_failed" };
    case "auth_required":
      return { code: ApiCode.AUTH_REQUIRED, message: "auth_required" };
    case "unsupported_platform":
      return { code: ApiCode.UNSUPPORTED_PLATFORM, message: "unsupported_platform" };
    case "invalid_params":
      return { code: ApiCode.INVALID_PARAMS, message: "invalid_params" };
    case "not_found":
      return { code: ApiCode.NOT_FOUND, message: "not_found" };
    case "generation_failed":
      return { code: ApiCode.GENERATION_FAILED, message: "generation_failed" };
    case "internal_error":
      return { code: ApiCode.INTERNAL_ERROR, message: "internal_error" };
    default:
      return { code: ApiCode.INTERNAL_ERROR, message: "internal_error" };
  }
}

/**
 * Machine-readable error context (safe fields only; no token, no full document text).
 */
export function buildErrorContext(input: {
  stage: string;
  reason: ErrorReason;
  platform?: string;
  session_id?: string;
  user_id?: string;
  doc_id?: string;
  highlight_id?: string;
  task_id?: string;
}): Record<string, unknown> {
  const out: Record<string, unknown> = {
    stage: input.stage,
    reason: input.reason
  };
  if (input.platform) out.platform = input.platform;
  if (input.session_id) out.session_id = input.session_id;
  if (input.user_id) out.user_id = input.user_id;
  if (input.doc_id) out.doc_id = input.doc_id;
  if (input.highlight_id) out.highlight_id = input.highlight_id;
  if (input.task_id) out.task_id = input.task_id;
  return out;
}

