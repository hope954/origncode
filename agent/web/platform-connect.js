/**
 * @typedef {"auth_required" | "token_invalid" | "token_expired" | "access_denied" | "fetch_failed" | "unknown"} FrontendErrorKind
 */

/**
 * @typedef {{
 *   stage?: string;
 *   reason?: string;
 *   platform?: "feishu" | "yuque";
 *   session_id?: string;
 *   doc_id?: string;
 *   request_id?: string;
 * }} ErrorContext
 */

/**
 * @typedef {{
 *   code: number;
 *   message: string;
 *   data?: any;
 *   request_id?: string;
 * }} ApiEnvelope
 */

/**
 * @typedef {"not_connected" | "connecting" | "connected" | "expired" | "invalid" | "revoked"} AuthStatus
 */

/**
 * @typedef {{
 *   auth_status: AuthStatus;
 *   last_verified_at?: string | null;
 * }} PlatformConnectionState
 */

/**
 * @typedef {{
 *   requestId: string;
 *   lastErrorKind?: FrontendErrorKind;
 *   lastErrorContext?: ErrorContext;
 * }} RequestMetaState
 */

class AppApiError extends Error {
  /**
   * @param {string} message
   * @param {{
   *   kind: FrontendErrorKind;
   *   code: number;
   *   requestId: string;
   *   errorContext?: ErrorContext;
   * }} details
   */
  constructor(message, details) {
    super(message);
    this.name = "AppApiError";
    this.details = details;
  }
}

/**
 * @param {string} message
 * @param {ErrorContext | undefined} errorContext
 * @returns {FrontendErrorKind}
 */
function classifyError(message, errorContext) {
  const reason = String(errorContext?.reason || message || "").trim();
  if (
    reason === "auth_required" ||
    reason === "token_invalid" ||
    reason === "token_expired" ||
    reason === "access_denied" ||
    reason === "fetch_failed"
  ) {
    return reason;
  }
  return "unknown";
}

/**
 * 统一 API client：
 * - 解析 code/message/data/request_id/error_context
 * - 对后端错误抛出结构化异常
 * @template T
 * @param {string} method
 * @param {string} path
 * @param {unknown} [body]
 * @returns {Promise<{ envelope: ApiEnvelope; data: T; requestId: string; errorContext?: ErrorContext }>}
 */
async function apiRequest(method, path, body) {
  const reqId = `req_front_${Date.now()}`;
  const headers = {
    "Content-Type": "application/json",
    "x-request-id": reqId
  };

  const res = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  /** @type {ApiEnvelope} */
  const envelope = await res.json();
  const requestId = String(
    envelope.request_id ||
      res.headers.get("x-request-id") ||
      reqId
  );
  const errorContext = envelope?.data?.error_context;

  if (typeof envelope.code !== "number") {
    throw new AppApiError("invalid_api_contract", {
      kind: "unknown",
      code: -1,
      requestId,
      errorContext
    });
  }

  if (envelope.code !== 0) {
    throw new AppApiError(envelope.message || "api_error", {
      kind: classifyError(envelope.message, errorContext),
      code: envelope.code,
      requestId,
      errorContext
    });
  }

  return {
    envelope,
    data: /** @type {T} */ (envelope.data),
    requestId,
    errorContext
  };
}

/** @type {RequestMetaState} */
const metaState = { requestId: "-" };

const statusBox = document.getElementById("statusBox");
const debugBox = document.getElementById("debugBox");
const feishuInfo = document.getElementById("feishuInfo");
const yuqueInfo = document.getElementById("yuqueInfo");

/** @returns {{ userId: string; sessionId: string }} */
function getContext() {
  const userId = String(document.getElementById("userId").value || "").trim();
  const sessionId = String(document.getElementById("sessionId").value || "").trim();
  return { userId, sessionId };
}

function setText(el, value) {
  if (!el) return;
  el.textContent = value;
}

function updateDebug(extra) {
  setText(
    debugBox,
    JSON.stringify(
      {
        request_id: metaState.requestId,
        last_error_kind: metaState.lastErrorKind || null,
        error_context: metaState.lastErrorContext || null,
        extra
      },
      null,
      2
    )
  );
}

/**
 * @param {any} err
 */
function handleUiError(err) {
  if (err instanceof AppApiError) {
    metaState.requestId = err.details.requestId;
    metaState.lastErrorKind = err.details.kind;
    metaState.lastErrorContext = err.details.errorContext;
    updateDebug({
      code: err.details.code,
      message: err.message
    });
    return;
  }
  updateDebug({ message: String(err) });
}

async function loadStatus() {
  try {
    const { userId, sessionId } = getContext();
    const query = new URLSearchParams({ user_id: userId });
    if (sessionId) query.set("session_id", sessionId);
    const { data, requestId } = await apiRequest(
      "GET",
      `/api/auth/status?${query.toString()}`
    );
    metaState.requestId = requestId;
    metaState.lastErrorKind = undefined;
    metaState.lastErrorContext = undefined;

    /** @type {{ feishu: PlatformConnectionState; yuque: PlatformConnectionState }} */
    const typedData = data;
    setText(statusBox, JSON.stringify(typedData, null, 2));
    updateDebug({ action: "load_status" });
  } catch (err) {
    handleUiError(err);
  }
}

async function createSession() {
  try {
    const { userId } = getContext();
    const { data, requestId } = await apiRequest("POST", "/api/session/create", {
      user_id: userId || "u_frontend",
      target_job: "engineering",
      styles: ["technical"],
      desired_highlight_count: 3
    });
    document.getElementById("sessionId").value = String(data.session_id || "");
    metaState.requestId = requestId;
    updateDebug({ action: "create_session", session_id: data.session_id });
    await loadStatus();
  } catch (err) {
    handleUiError(err);
  }
}

async function getFeishuAuthUrl() {
  try {
    const { userId, sessionId } = getContext();
    const query = new URLSearchParams({
      platform: "feishu",
      user_id: userId,
      session_id: sessionId
    });
    const { data, requestId } = await apiRequest(
      "GET",
      `/api/auth/url?${query.toString()}`
    );
    metaState.requestId = requestId;
    setText(feishuInfo, JSON.stringify(data, null, 2));
    updateDebug({ action: "feishu_auth_url" });
  } catch (err) {
    handleUiError(err);
  }
}

async function feishuCallback() {
  try {
    const { userId, sessionId } = getContext();
    const authCode = String(document.getElementById("feishuCode").value || "").trim();
    const { data, requestId } = await apiRequest("POST", "/api/auth/callback", {
      user_id: userId,
      session_id: sessionId,
      auth_code: authCode
    });
    metaState.requestId = requestId;
    setText(feishuInfo, JSON.stringify(data, null, 2));
    updateDebug({ action: "feishu_callback" });
    await loadStatus();
  } catch (err) {
    handleUiError(err);
  }
}

async function feishuRefresh() {
  try {
    const { userId, sessionId } = getContext();
    const { data, requestId } = await apiRequest("POST", "/api/auth/refresh", {
      platform: "feishu",
      user_id: userId,
      session_id: sessionId || undefined
    });
    metaState.requestId = requestId;
    setText(feishuInfo, JSON.stringify(data, null, 2));
    updateDebug({ action: "feishu_refresh" });
    await loadStatus();
  } catch (err) {
    handleUiError(err);
  }
}

async function yuqueVerify() {
  try {
    const token = String(document.getElementById("yuqueToken").value || "").trim();
    const { data, requestId } = await apiRequest("POST", "/api/auth/yuque/token/verify", {
      token
    });
    metaState.requestId = requestId;
    setText(yuqueInfo, JSON.stringify(data, null, 2));
    updateDebug({ action: "yuque_verify" });
  } catch (err) {
    handleUiError(err);
  }
}

async function yuqueSave() {
  try {
    const { userId, sessionId } = getContext();
    const token = String(document.getElementById("yuqueToken").value || "").trim();
    const { data, requestId } = await apiRequest("POST", "/api/auth/yuque/token/save", {
      user_id: userId,
      session_id: sessionId || undefined,
      token
    });
    metaState.requestId = requestId;
    setText(yuqueInfo, JSON.stringify(data, null, 2));
    updateDebug({ action: "yuque_save" });
    await loadStatus();
  } catch (err) {
    handleUiError(err);
  }
}

async function yuqueDelete() {
  try {
    const { userId, sessionId } = getContext();
    const { data, requestId } = await apiRequest("POST", "/api/auth/yuque/token/delete", {
      user_id: userId,
      session_id: sessionId || undefined
    });
    metaState.requestId = requestId;
    setText(yuqueInfo, JSON.stringify(data, null, 2));
    updateDebug({ action: "yuque_delete" });
    await loadStatus();
  } catch (err) {
    handleUiError(err);
  }
}

document.getElementById("createSessionBtn")?.addEventListener("click", createSession);
document.getElementById("loadStatusBtn")?.addEventListener("click", loadStatus);
document.getElementById("getFeishuUrlBtn")?.addEventListener("click", getFeishuAuthUrl);
document.getElementById("feishuCallbackBtn")?.addEventListener("click", feishuCallback);
document.getElementById("feishuRefreshBtn")?.addEventListener("click", feishuRefresh);
document.getElementById("yuqueVerifyBtn")?.addEventListener("click", yuqueVerify);
document.getElementById("yuqueSaveBtn")?.addEventListener("click", yuqueSave);
document.getElementById("yuqueDeleteBtn")?.addEventListener("click", yuqueDelete);

updateDebug({ boot: true });
