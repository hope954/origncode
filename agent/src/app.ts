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
import { FeishuAdapter } from "./platform_adapters/feishuAdapter.js";
import { YuqueAdapter } from "./platform_adapters/yuqueAdapter.js";
import { Repository } from "./storage/repository.js";
import { ResumePipelineService } from "./resume_pipeline/service.js";
import { clearSessionData } from "./session_lifecycle/clear_session.js";

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

  const repo = new Repository();
  const authService = new AuthService(repo);
  const orchestrator = new AnalysisOrchestrator(repo, authService, new FeishuAdapter(), new YuqueAdapter());
  const resumePipeline = new ResumePipelineService(repo);

  app.post("/api/session/create", (req, res) => {
    const parsed = sessionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(errBody(ApiCode.INVALID_PARAMS, "invalid_params"));
    const session = orchestrator.createSession(parsed.data);
    return res.json(okBody(session));
  });

  app.post("/api/session/clear", (req, res) => {
    const parsed = sessionClearSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(errBody(ApiCode.INVALID_PARAMS, "invalid_params"));
    const result = clearSessionData(repo, parsed.data.session_id, parsed.data.user_id);
    if (!result.ok && result.reason === "not_found") {
      return res.status(404).json(errBody(ApiCode.NOT_FOUND, "not_found"));
    }
    if (!result.ok && result.reason === "forbidden") {
      return res.status(403).json(errBody(ApiCode.ACCESS_DENIED, "access_denied"));
    }
    return res.json(okBody({ session_id: parsed.data.session_id, cleared: true }));
  });

  app.get("/api/auth/url", (req, res) => {
    const platform = req.query.platform;
    if (platform !== "feishu") return res.status(400).json(errBody(ApiCode.UNSUPPORTED_PLATFORM, "unsupported_platform"));
    const userId = String(req.query.user_id ?? "");
    const sessionId = String(req.query.session_id ?? "");
    return res.json(okBody({ auth_url: authService.getAuthUrl(userId, sessionId) }));
  });

  // async: handleFeishuCallback makes real HTTP when FEISHU_APP_ID is configured
  app.post("/api/auth/callback", async (req, res) => {
    const body = z.object({ user_id: z.string(), session_id: z.string(), auth_code: z.string() }).safeParse(req.body);
    if (!body.success) return res.status(400).json(errBody(ApiCode.INVALID_PARAMS, "invalid_params"));
    try {
      const auth = await authService.handleFeishuCallback(body.data.user_id, body.data.session_id, body.data.auth_code);
      return res.json(okBody({ platform: auth.platform, auth_status: auth.auth_status }));
    } catch (err) {
      const reason = (err as { reason?: string }).reason ?? "auth_required";
      if (reason === "token_invalid") return res.status(400).json(errBody(ApiCode.INVALID_PARAMS, "token_invalid"));
      return res.status(400).json(errBody(ApiCode.AUTH_REQUIRED, "auth_required"));
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
    if (!body.success) return res.status(400).json(errBody(ApiCode.INVALID_PARAMS, "invalid_params"));
    if (body.data.platform !== "feishu") {
      return res.status(400).json(
        errBody(ApiCode.UNSUPPORTED_PLATFORM, "unsupported_platform", {
          detail:
            "POST /api/auth/refresh is defined for Feishu OAuth refresh only. Yuque uses POST /api/auth/yuque/token/save and related endpoints."
        })
      );
    }
    try {
      const refreshed = await authService.refreshFeishuToken(body.data.user_id, body.data.session_id);
      if (!refreshed) return res.status(400).json(errBody(ApiCode.INVALID_PARAMS, "token_invalid"));
      return res.json(okBody({ platform: "feishu", auth_status: refreshed.auth_status }));
    } catch (err) {
      const reason = (err as { reason?: string }).reason ?? "token_expired";
      if (reason === "token_revoked") return res.status(400).json(errBody(ApiCode.INVALID_PARAMS, "token_revoked"));
      return res.status(400).json(errBody(ApiCode.INVALID_PARAMS, "token_expired"));
    }
  });

  // async: verifyYuqueToken may probe real API when YUQUE_LIVE_VERIFY=1
  app.post("/api/auth/yuque/token/verify", async (req, res) => {
    const body = z.object({ token: z.string() }).safeParse(req.body);
    if (!body.success) return res.status(400).json(errBody(ApiCode.INVALID_PARAMS, "invalid_params"));
    const valid = await authService.verifyYuqueToken(body.data.token);
    return res.json(okBody({ valid }));
  });

  // async: saveYuqueToken awaits verifyYuqueToken
  app.post("/api/auth/yuque/token/save", async (req, res) => {
    const body = z.object({ user_id: z.string(), session_id: z.string().optional(), token: z.string() }).safeParse(req.body);
    if (!body.success) return res.status(400).json(errBody(ApiCode.INVALID_PARAMS, "invalid_params"));
    try {
      const auth = await authService.saveYuqueToken(body.data);
      return res.json(okBody({ platform: auth.platform, auth_status: auth.auth_status }));
    } catch {
      return res.status(400).json(errBody(ApiCode.INVALID_PARAMS, "token_invalid"));
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
    return res.json(okBody(authService.getStatus(userId, sessionId)));
  });

  app.post("/api/docs/import", (req, res) => {
    const parsed = importSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(errBody(ApiCode.INVALID_PARAMS, "invalid_params"));
    const docs = orchestrator.importDocuments(parsed.data.session_id, parsed.data.docs);
    return res.json(okBody(docs));
  });

  // async: orchestrator.startTask awaits adapter.fetchDocument (real HTTP when configured)
  app.post("/api/analysis/start", async (req, res) => {
    const parsed = analysisSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(errBody(ApiCode.INVALID_PARAMS, "invalid_params"));
    const task = await orchestrator.startTask(parsed.data.session_id, parsed.data.user_id);
    return res.json(okBody({ task_id: task.task_id }));
  });

  app.get("/api/analysis/task", (req, res) => {
    const taskId = String(req.query.task_id ?? "");
    const task = orchestrator.getTask(taskId);
    if (!task) return res.status(404).json(errBody(ApiCode.NOT_FOUND, "not_found"));
    return res.json(okBody(task));
  });

  app.get("/api/analysis/result", (req, res) => {
    const sessionId = String(req.query.session_id ?? "");
    return res.json(okBody(orchestrator.getSessionResult(sessionId)));
  });

  app.post("/api/resume/analyze", (req, res) => {
    const parsed = resumeAnalyzeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(errBody(ApiCode.INVALID_PARAMS, "invalid_params"));
    const task = resumePipeline.runAnalyze(parsed.data);
    if (task.status === "failed") {
      return res.status(400).json(
        errBody(ApiCode.GENERATION_FAILED, "generation_failed", {
          task_id: task.task_id,
          status: task.status
        })
      );
    }
    return res.json(
      okBody({
        task_id: task.task_id,
        status: task.status
      })
    );
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
    return res.json(
      okBody({
        session_id: bundle.session_id,
        status: bundle.status,
        highlights,
        warnings: bundle.warnings
      })
    );
  });

  app.get("/api/resume/evidence", (req, res) => {
    const highlightId = String(req.query.highlight_id ?? "");
    const ev = resumePipeline.getEvidence(highlightId);
    if (!ev) return res.status(404).json(errBody(ApiCode.NOT_FOUND, "not_found"));
    return res.json(okBody(ev));
  });

  app.post("/api/resume/rewrite", (req, res) => {
    const parsed = resumeRewriteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(errBody(ApiCode.INVALID_PARAMS, "invalid_params"));
    const next = resumePipeline.rewriteHighlight(
      parsed.data.highlight_id,
      parsed.data.style,
      parsed.data.target_job
    );
    if (!next) return res.status(404).json(errBody(ApiCode.NOT_FOUND, "not_found"));
    return res.json(
      okBody({
        highlight_id: next.highlight_id,
        rewritten_content: next.final_content
      })
    );
  });

  app.post("/api/resume/highlight/save", (req, res) => {
    const parsed = resumeHighlightSaveSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(errBody(ApiCode.INVALID_PARAMS, "invalid_params"));
    const out = resumePipeline.saveHighlightContent(parsed.data.highlight_id, parsed.data.final_content);
    if (!out.ok) {
      if (out.reason === "not_found" || out.reason === "deleted") {
        return res.status(404).json(errBody(ApiCode.NOT_FOUND, "not_found"));
      }
      if (out.reason === "invalid_content") {
        return res.status(400).json(errBody(ApiCode.INVALID_PARAMS, "invalid_params"));
      }
      return res.status(400).json(errBody(ApiCode.GENERATION_FAILED, "evidence_incomplete"));
    }
    return res.json(
      okBody({
        highlight_id: out.highlight.highlight_id,
        final_content: out.highlight.final_content,
        original_content: out.highlight.original_content,
        is_edited: out.highlight.is_edited
      })
    );
  });

  app.post("/api/resume/highlight/delete", (req, res) => {
    const parsed = resumeHighlightDeleteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(errBody(ApiCode.INVALID_PARAMS, "invalid_params"));
    const out = resumePipeline.softDeleteHighlight(parsed.data.highlight_id);
    if (!out.ok) {
      if (out.reason === "not_found") return res.status(404).json(errBody(ApiCode.NOT_FOUND, "not_found"));
      return res.json(
        okBody({
          highlight_id: parsed.data.highlight_id,
          status: "deleted" as const,
          idempotent: true
        })
      );
    }
    return res.json(
      okBody({
        highlight_id: out.highlight.highlight_id,
        status: "deleted" as const,
        idempotent: false
      })
    );
  });

  app.get("/api/storage/snapshot", (_req, res) => {
    const snapshot = repo.snapshot();
    return res.json(okBody(snapshot));
  });

  return app;
}
