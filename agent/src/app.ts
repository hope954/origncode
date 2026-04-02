/**
 * HTTP API — wiring only. Auth vs document fetch boundaries:
 * - Feishu/Yuque document pull + schema mapping: `platform_adapters/*Adapter` (given decrypted token).
 * - OAuth, refresh, Yuque token CRUD: `auth_service`.
 *
 * 响应体：`code` 为数字，与 Master Spec §15.1 / §15.2 及 `openspec/.../http-api-response.md` 一致。
 * Routes calling async auth/adapter operations are async; all other routes remain sync.
 */
import express from "express";
import { z } from "zod";
import { AuthService } from "./auth_service/service.js";
import { AnalysisOrchestrator } from "./analysis_orchestrator/service.js";
import { ApiCode, errBody, okBody } from "./http/api_codes.js";
import { feishuConfigured } from "./config.js";
import { FeishuAdapter } from "./platform_adapters/feishuAdapter.js";
import { YuqueAdapter } from "./platform_adapters/yuqueAdapter.js";
import { Repository } from "./storage/repository.js";
import { ResumePipelineService } from "./resume_pipeline/service.js";
import { clearSessionData } from "./session_lifecycle/clear_session.js";
import { makeId } from "./utils/id.js";
import { logEvent } from "./http/logger.js";
import { buildErrorContext, mapErrorReasonToApi } from "./http/error_mapping.js";

const sessionSchema = z.object({
  user_id: z.string().min(1),
  target_job: z.enum(["generic", "engineering", "product", "operations"]),
  styles: z.array(z.enum(["concise", "technical", "business"])).min(1),
  desired_highlight_count: z.number().int().min(3).max(5)
});

const importSchema = z.object({
  session_id: z.string(),
  docs: z.array(z.object({ platform: z.enum(["feishu", "yuque"]), url: z.string().url() })).min(1)
});

const analysisSchema = z.object({
  session_id: z.string(),
  user_id: z.string()
});

const resumeAnalyzeSchema = z.object({
  session_id: z.string(),
  doc_ids: z.array(z.string()).optional(),
  target_job: z.enum(["generic", "engineering", "product", "operations"]).optional(),
  styles: z.array(z.enum(["concise", "technical", "business"])).optional(),
  desired_highlight_count: z.number().int().min(3).max(5).optional()
});

const resumeRewriteSchema = z.object({
  highlight_id: z.string(),
  style: z.enum(["concise", "technical", "business"]),
  target_job: z.enum(["generic", "engineering", "product", "operations"])
});

const resumeHighlightSaveSchema = z.object({
  highlight_id: z.string(),
  final_content: z.string().min(1)
});

const resumeHighlightDeleteSchema = z.object({
  highlight_id: z.string()
});

const sessionClearSchema = z.object({
  session_id: z.string(),
  user_id: z.string().optional()
});

export function createApp() {
  const app = express();
  app.use(express.json());

  // request_id / correlation_id middleware (Master Spec §15.1)
  app.use((req, res, next) => {
    const incoming =
      (typeof req.headers["x-request-id"] === "string" && req.headers["x-request-id"]) ||
      (typeof req.headers["x-correlation-id"] === "string" && req.headers["x-correlation-id"]) ||
      undefined;
    const safeIncoming =
      incoming && /^[a-zA-Z0-9._-]{6,80}$/.test(incoming) ? incoming : undefined;
    const requestId = safeIncoming ?? makeId("req");
    res.locals.request_id = requestId;
    res.setHeader("x-request-id", requestId);
    next();
  });

  const repo = new Repository();
  const authService = new AuthService(repo);
  const orchestrator = new AnalysisOrchestrator(repo, authService, new FeishuAdapter(), new YuqueAdapter());
  const resumePipeline = new ResumePipelineService(repo);

  function requestIdFrom(res: express.Response): string {
    return String((res.locals as { request_id?: string }).request_id ?? makeId("req"));
  }

  function sendOk<T>(res: express.Response, data: T) {
    const request_id = requestIdFrom(res);
    return res.json({ ...okBody(data), request_id });
  }

  function sendErr(
    res: express.Response,
    httpStatus: number,
    code: number,
    message: string,
    errorContext?: Record<string, unknown>
  ) {
    const request_id = requestIdFrom(res);
    const ctx = errorContext ? { ...errorContext, request_id } : { request_id };
    const data = { error_context: ctx };
    return res.status(httpStatus).json({ ...errBody(code as never, message, data), request_id });
  }

  app.post("/api/session/create", (req, res) => {
    logEvent("info", "session.create.start", { request_id: requestIdFrom(res) });
    const parsed = sessionSchema.safeParse(req.body);
    if (!parsed.success) {
      logEvent("warn", "session.create.failed", {
        request_id: requestIdFrom(res),
        reason: "invalid_params"
      });
      return sendErr(res, 400, ApiCode.INVALID_PARAMS, "invalid_params", buildErrorContext({ stage: "session_create", reason: "invalid_params" }));
    }
    const session = orchestrator.createSession(parsed.data);
    logEvent("info", "session.create.success", { request_id: requestIdFrom(res), session_id: session.session_id });
    return sendOk(res, session);
  });

  app.post("/api/session/clear", (req, res) => {
    const parsed = sessionClearSchema.safeParse(req.body);
    if (!parsed.success) return sendErr(res, 400, ApiCode.INVALID_PARAMS, "invalid_params", buildErrorContext({ stage: "session_clear", reason: "invalid_params" }));
    const result = clearSessionData(repo, parsed.data.session_id, parsed.data.user_id);
    if (!result.ok && result.reason === "not_found") {
      return sendErr(res, 404, ApiCode.NOT_FOUND, "not_found", buildErrorContext({ stage: "session_clear", reason: "not_found", session_id: parsed.data.session_id }));
    }
    if (!result.ok && result.reason === "forbidden") {
      return sendErr(res, 403, ApiCode.ACCESS_DENIED, "access_denied", buildErrorContext({ stage: "session_clear", reason: "access_denied", session_id: parsed.data.session_id }));
    }
    logEvent("info", "session.clear.success", { request_id: requestIdFrom(res), session_id: parsed.data.session_id });
    return sendOk(res, { session_id: parsed.data.session_id, cleared: true });
  });

  app.get("/api/auth/url", (req, res) => {
    const platform = req.query.platform;
    if (platform !== "feishu") {
      return sendErr(res, 400, ApiCode.UNSUPPORTED_PLATFORM, "unsupported_platform", buildErrorContext({ stage: "auth_url", reason: "unsupported_platform" }));
    }
    const userId = String(req.query.user_id ?? "");
    const sessionId = String(req.query.session_id ?? "");
    logEvent("info", "auth.feishu.url", { request_id: requestIdFrom(res), user_id: userId, session_id: sessionId });
    return sendOk(res, { auth_url: authService.getAuthUrl(userId, sessionId) });
  });

  // async: handleFeishuCallback makes real HTTP when FEISHU_APP_ID is configured
  app.post("/api/auth/callback", async (req, res) => {
    const body = z.object({ user_id: z.string(), session_id: z.string(), auth_code: z.string() }).safeParse(req.body);
    if (!body.success) return sendErr(res, 400, ApiCode.INVALID_PARAMS, "invalid_params", buildErrorContext({ stage: "auth_callback", reason: "invalid_params" }));
    try {
      logEvent("info", "auth.feishu.callback.start", {
        request_id: requestIdFrom(res),
        user_id: body.data.user_id,
        session_id: body.data.session_id
      });
      const auth = await authService.handleFeishuCallback(body.data.user_id, body.data.session_id, body.data.auth_code);
      logEvent("info", "auth.feishu.callback.success", {
        request_id: requestIdFrom(res),
        user_id: body.data.user_id,
        session_id: body.data.session_id,
        auth_status: auth.auth_status
      });
      return sendOk(res, {
        platform: auth.platform,
        auth_status: auth.auth_status,
        auth_mode: feishuConfigured() ? "real" : "fallback"
      });
    } catch (err) {
      const reason = (err as { reason?: string }).reason ?? "auth_required";
      const mapped = mapErrorReasonToApi(reason);
      logEvent("warn", "auth.feishu.callback.failed", {
        request_id: requestIdFrom(res),
        user_id: body.success ? body.data.user_id : undefined,
        session_id: body.success ? body.data.session_id : undefined,
        reason
      });
      return sendErr(
        res,
        400,
        mapped.code,
        mapped.message,
        buildErrorContext({ stage: "auth_callback", platform: "feishu", reason, user_id: body.success ? body.data.user_id : undefined, session_id: body.success ? body.data.session_id : undefined })
      );
    }
  });

  // async: refreshFeishuToken makes real HTTP when FEISHU_APP_ID is configured
  app.post("/api/auth/refresh", async (req, res) => {
    const body = z
      .object({
        platform: z.enum(["feishu", "yuque"]),
        user_id: z.string(),
        session_id: z.string().optional()
      })
      .safeParse(req.body);
    if (!body.success) return sendErr(res, 400, ApiCode.INVALID_PARAMS, "invalid_params", buildErrorContext({ stage: "auth_refresh", reason: "invalid_params" }));
    if (body.data.platform !== "feishu") {
      return sendErr(
        res,
        400,
        ApiCode.UNSUPPORTED_PLATFORM,
        "unsupported_platform",
        buildErrorContext({ stage: "auth_refresh", platform: body.data.platform, reason: "unsupported_platform" })
      );
    }
    try {
      logEvent("info", "auth.feishu.refresh.start", { request_id: requestIdFrom(res), user_id: body.data.user_id, session_id: body.data.session_id });
      const refreshed = await authService.refreshFeishuToken(body.data.user_id, body.data.session_id);
      if (!refreshed) {
        const mapped = mapErrorReasonToApi("token_invalid");
        logEvent("warn", "auth.feishu.refresh.failed", { request_id: requestIdFrom(res), user_id: body.data.user_id, session_id: body.data.session_id, reason: "token_invalid" });
        return sendErr(res, 400, mapped.code, mapped.message, buildErrorContext({ stage: "auth_refresh", platform: "feishu", reason: "token_invalid", user_id: body.data.user_id, session_id: body.data.session_id }));
      }
      logEvent("info", "auth.feishu.refresh.success", { request_id: requestIdFrom(res), user_id: body.data.user_id, session_id: body.data.session_id, auth_status: refreshed.auth_status });
      return sendOk(res, { platform: "feishu", auth_status: refreshed.auth_status, auth_mode: feishuConfigured() ? "real" : "fallback" });
    } catch (err) {
      const reason = (err as { reason?: string }).reason ?? "token_expired";
      const mapped = mapErrorReasonToApi(reason);
      logEvent("warn", "auth.feishu.refresh.failed", { request_id: requestIdFrom(res), user_id: body.data.user_id, session_id: body.data.session_id, reason });
      return sendErr(res, 400, mapped.code, mapped.message, buildErrorContext({ stage: "auth_refresh", platform: "feishu", reason, user_id: body.data.user_id, session_id: body.data.session_id }));
    }
  });

  // async: verifyYuqueToken may probe real API when YUQUE_LIVE_VERIFY=1
  app.post("/api/auth/yuque/token/verify", async (req, res) => {
    const body = z.object({ token: z.string() }).safeParse(req.body);
    if (!body.success) return sendErr(res, 400, ApiCode.INVALID_PARAMS, "invalid_params", buildErrorContext({ stage: "yuque_token_verify", reason: "invalid_params" }));
    logEvent("info", "auth.yuque.verify.start", { request_id: requestIdFrom(res) });
    const valid = await authService.verifyYuqueToken(body.data.token);
    logEvent("info", "auth.yuque.verify.done", { request_id: requestIdFrom(res), valid });
    return sendOk(res, { valid, verify_mode: process.env.YUQUE_LIVE_VERIFY === "1" ? "live" : "structural" });
  });

  // async: saveYuqueToken awaits verifyYuqueToken
  app.post("/api/auth/yuque/token/save", async (req, res) => {
    const body = z.object({ user_id: z.string(), session_id: z.string().optional(), token: z.string() }).safeParse(req.body);
    if (!body.success) return sendErr(res, 400, ApiCode.INVALID_PARAMS, "invalid_params", buildErrorContext({ stage: "yuque_token_save", reason: "invalid_params" }));
    try {
      logEvent("info", "auth.yuque.save.start", { request_id: requestIdFrom(res), user_id: body.data.user_id, session_id: body.data.session_id });
      const auth = await authService.saveYuqueToken(body.data);
      logEvent("info", "auth.yuque.save.success", { request_id: requestIdFrom(res), user_id: body.data.user_id, session_id: body.data.session_id, auth_status: auth.auth_status });
      return sendOk(res, { platform: auth.platform, auth_status: auth.auth_status });
    } catch {
      const mapped = mapErrorReasonToApi("token_invalid");
      logEvent("warn", "auth.yuque.save.failed", { request_id: requestIdFrom(res), user_id: body.success ? body.data.user_id : undefined, session_id: body.success ? body.data.session_id : undefined, reason: "token_invalid" });
      return sendErr(res, 400, mapped.code, mapped.message, buildErrorContext({ stage: "yuque_token_save", platform: "yuque", reason: "token_invalid", user_id: body.success ? body.data.user_id : undefined, session_id: body.success ? body.data.session_id : undefined }));
    }
  });

  app.post("/api/auth/yuque/token/delete", (req, res) => {
    const body = z.object({ user_id: z.string(), session_id: z.string().optional() }).safeParse(req.body);
    if (!body.success) return res.status(400).json(errBody(ApiCode.INVALID_PARAMS, "invalid_params"));
    authService.deleteYuqueToken(body.data.user_id, body.data.session_id);
    return res.json(okBody({}));
  });

  app.get("/api/auth/status", (req, res) => {
    const userId = String(req.query.user_id ?? "");
    const sessionId = req.query.session_id ? String(req.query.session_id) : undefined;
    return sendOk(res, authService.getStatus(userId, sessionId));
  });

  app.post("/api/docs/import", (req, res) => {
    const parsed = importSchema.safeParse(req.body);
    if (!parsed.success) return sendErr(res, 400, ApiCode.INVALID_PARAMS, "invalid_params", buildErrorContext({ stage: "docs_import", reason: "invalid_params" }));
    const docs = orchestrator.importDocuments(parsed.data.session_id, parsed.data.docs);
    logEvent("info", "docs.import", { request_id: requestIdFrom(res), session_id: parsed.data.session_id, docs_count: parsed.data.docs.length });
    return sendOk(res, docs);
  });

  // async: orchestrator.startTask awaits adapter.fetchDocument (real HTTP when configured)
  app.post("/api/analysis/start", async (req, res) => {
    const parsed = analysisSchema.safeParse(req.body);
    if (!parsed.success) return sendErr(res, 400, ApiCode.INVALID_PARAMS, "invalid_params", buildErrorContext({ stage: "analysis_start", reason: "invalid_params" }));
    logEvent("info", "analysis.start", { request_id: requestIdFrom(res), session_id: parsed.data.session_id, user_id: parsed.data.user_id });
    const task = await orchestrator.startTask(parsed.data.session_id, parsed.data.user_id, { request_id: requestIdFrom(res) });
    logEvent("info", "analysis.done", { request_id: requestIdFrom(res), session_id: parsed.data.session_id, task_status: task.status, task_id: task.task_id });
    return sendOk(res, { task_id: task.task_id });
  });

  app.get("/api/analysis/task", (req, res) => {
    const taskId = String(req.query.task_id ?? "");
    const task = orchestrator.getTask(taskId);
    if (!task) return sendErr(res, 404, ApiCode.NOT_FOUND, "not_found", buildErrorContext({ stage: "analysis_task", reason: "not_found", task_id: taskId }));
    return sendOk(res, task);
  });

  app.get("/api/analysis/result", (req, res) => {
    const sessionId = String(req.query.session_id ?? "");
    return sendOk(res, orchestrator.getSessionResult(sessionId));
  });

  app.post("/api/resume/analyze", (req, res) => {
    const parsed = resumeAnalyzeSchema.safeParse(req.body);
    if (!parsed.success) return sendErr(res, 400, ApiCode.INVALID_PARAMS, "invalid_params", buildErrorContext({ stage: "resume_analyze", reason: "invalid_params" }));
    logEvent("info", "resume.analyze.start", { request_id: requestIdFrom(res), session_id: parsed.data.session_id });
    const task = resumePipeline.runAnalyze(parsed.data);
    if (task.status === "failed") {
      logEvent("warn", "resume.analyze.failed", { request_id: requestIdFrom(res), session_id: parsed.data.session_id, reason: "generation_failed" });
      return sendErr(
        res,
        400,
        ApiCode.GENERATION_FAILED,
        "generation_failed",
        buildErrorContext({ stage: "resume_analyze", reason: "generation_failed", session_id: parsed.data.session_id, task_id: task.task_id })
      );
    }
    logEvent("info", "resume.analyze.done", { request_id: requestIdFrom(res), session_id: parsed.data.session_id, status: task.status, task_id: task.task_id });
    return sendOk(res, { task_id: task.task_id, status: task.status });
  });

  app.get("/api/resume/result", (req, res) => {
    const sessionId = String(req.query.session_id ?? "");
    const bundle = resumePipeline.getResult(sessionId);
    const highlights = bundle.highlights.map((h) => ({
      highlight_id: h.highlight_id,
      style: h.style,
      target_job: h.target_job,
      content: h.final_content,
      confidence_score: h.confidence_score,
      is_edited: h.is_edited
    }));
    return sendOk(res, { session_id: bundle.session_id, status: bundle.status, highlights, warnings: bundle.warnings });
  });

  app.get("/api/resume/evidence", (req, res) => {
    const highlightId = String(req.query.highlight_id ?? "");
    const ev = resumePipeline.getEvidence(highlightId);
    if (!ev) return sendErr(res, 404, ApiCode.NOT_FOUND, "not_found", buildErrorContext({ stage: "resume_evidence", reason: "not_found", highlight_id: highlightId }));
    return sendOk(res, ev);
  });

  app.post("/api/resume/rewrite", (req, res) => {
    const parsed = resumeRewriteSchema.safeParse(req.body);
    if (!parsed.success) return sendErr(res, 400, ApiCode.INVALID_PARAMS, "invalid_params", buildErrorContext({ stage: "resume_rewrite", reason: "invalid_params" }));
    const next = resumePipeline.rewriteHighlight(
      parsed.data.highlight_id,
      parsed.data.style,
      parsed.data.target_job
    );
    if (!next) return sendErr(res, 404, ApiCode.NOT_FOUND, "not_found", buildErrorContext({ stage: "resume_rewrite", reason: "not_found", highlight_id: parsed.data.highlight_id }));
    return sendOk(res, { highlight_id: next.highlight_id, rewritten_content: next.final_content });
  });

  app.post("/api/resume/highlight/save", (req, res) => {
    const parsed = resumeHighlightSaveSchema.safeParse(req.body);
    if (!parsed.success) return sendErr(res, 400, ApiCode.INVALID_PARAMS, "invalid_params", buildErrorContext({ stage: "highlight_save", reason: "invalid_params" }));
    const out = resumePipeline.saveHighlightContent(parsed.data.highlight_id, parsed.data.final_content);
    if (!out.ok) {
      if (out.reason === "not_found" || out.reason === "deleted") {
        return sendErr(res, 404, ApiCode.NOT_FOUND, "not_found", buildErrorContext({ stage: "highlight_save", reason: "not_found", highlight_id: parsed.data.highlight_id }));
      }
      if (out.reason === "invalid_content") {
        return sendErr(res, 400, ApiCode.INVALID_PARAMS, "invalid_params", buildErrorContext({ stage: "highlight_save", reason: "invalid_params", highlight_id: parsed.data.highlight_id }));
      }
      return sendErr(res, 400, ApiCode.GENERATION_FAILED, "evidence_incomplete", buildErrorContext({ stage: "highlight_save", reason: "evidence_incomplete", highlight_id: parsed.data.highlight_id }));
    }
    return sendOk(res, {
      highlight_id: out.highlight.highlight_id,
      final_content: out.highlight.final_content,
      original_content: out.highlight.original_content,
      is_edited: out.highlight.is_edited
    });
  });

  app.post("/api/resume/highlight/delete", (req, res) => {
    const parsed = resumeHighlightDeleteSchema.safeParse(req.body);
    if (!parsed.success) return sendErr(res, 400, ApiCode.INVALID_PARAMS, "invalid_params", buildErrorContext({ stage: "highlight_delete", reason: "invalid_params" }));
    const out = resumePipeline.softDeleteHighlight(parsed.data.highlight_id);
    if (!out.ok) {
      if (out.reason === "not_found") return sendErr(res, 404, ApiCode.NOT_FOUND, "not_found", buildErrorContext({ stage: "highlight_delete", reason: "not_found", highlight_id: parsed.data.highlight_id }));
      return sendOk(res, { highlight_id: parsed.data.highlight_id, status: "deleted" as const, idempotent: true });
    }
    return sendOk(res, { highlight_id: out.highlight.highlight_id, status: "deleted" as const, idempotent: false });
  });

  app.get("/api/storage/snapshot", (_req, res) => {
    const snapshot = repo.snapshot();
    return sendOk(res, snapshot);
  });

  return app;
}
