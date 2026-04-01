/**
 * HTTP API — wiring only. Auth vs document fetch boundaries:
 * - Feishu/Yuque document pull + schema mapping: `platform_adapters/*Adapter` (given decrypted token).
 * - OAuth, refresh, Yuque token CRUD: `auth_service`.
 */
import express from "express";
import { z } from "zod";
import { AuthService } from "./auth_service/service.js";
import { AnalysisOrchestrator } from "./analysis_orchestrator/service.js";
import { FeishuAdapter } from "./platform_adapters/feishuAdapter.js";
import { YuqueAdapter } from "./platform_adapters/yuqueAdapter.js";
import { Repository } from "./storage/repository.js";

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

export function createApp() {
  const app = express();
  app.use(express.json());

  const repo = new Repository();
  const authService = new AuthService(repo);
  const orchestrator = new AnalysisOrchestrator(repo, authService, new FeishuAdapter(), new YuqueAdapter());

  app.post("/api/session/create", (req, res) => {
    const parsed = sessionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ code: "invalid_request" });
    const session = orchestrator.createSession(parsed.data);
    return res.json({ code: "ok", data: session });
  });

  app.get("/api/auth/url", (req, res) => {
    const platform = req.query.platform;
    if (platform !== "feishu") return res.status(400).json({ code: "unsupported_platform" });
    const userId = String(req.query.user_id ?? "");
    const sessionId = String(req.query.session_id ?? "");
    return res.json({ code: "ok", data: { auth_url: authService.getAuthUrl(userId, sessionId) } });
  });

  app.post("/api/auth/callback", (req, res) => {
    const body = z.object({ user_id: z.string(), session_id: z.string(), auth_code: z.string() }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ code: "invalid_request" });
    const auth = authService.handleFeishuCallback(body.data.user_id, body.data.session_id, body.data.auth_code);
    return res.json({ code: "ok", data: { platform: auth.platform, auth_status: auth.auth_status } });
  });

  // Feishu only: exchanges refresh_token for new user_access_token. Yuque has no refresh here — use yuque token save/delete.
  app.post("/api/auth/refresh", (req, res) => {
    const body = z
      .object({
        platform: z.enum(["feishu", "yuque"]),
        user_id: z.string(),
        session_id: z.string().optional()
      })
      .safeParse(req.body);
    if (!body.success) return res.status(400).json({ code: "invalid_request" });
    if (body.data.platform !== "feishu") {
      return res.status(400).json({
        code: "unsupported_platform",
        message:
          "POST /api/auth/refresh is defined for Feishu OAuth refresh only. Yuque uses POST /api/auth/yuque/token/save and related endpoints."
      });
    }
    const refreshed = authService.refreshFeishuToken(body.data.user_id, body.data.session_id);
    if (!refreshed) return res.status(400).json({ code: "token_invalid" });
    return res.json({ code: "ok", data: { platform: "feishu", auth_status: refreshed.auth_status } });
  });

  app.post("/api/auth/yuque/token/verify", (req, res) => {
    const body = z.object({ token: z.string() }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ code: "invalid_request" });
    return res.json({ code: "ok", data: { valid: authService.verifyYuqueToken(body.data.token) } });
  });

  app.post("/api/auth/yuque/token/save", (req, res) => {
    const body = z.object({ user_id: z.string(), session_id: z.string().optional(), token: z.string() }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ code: "invalid_request" });
    try {
      const auth = authService.saveYuqueToken(body.data);
      return res.json({ code: "ok", data: { platform: auth.platform, auth_status: auth.auth_status } });
    } catch {
      return res.status(400).json({ code: "token_invalid" });
    }
  });

  app.post("/api/auth/yuque/token/delete", (req, res) => {
    const body = z.object({ user_id: z.string(), session_id: z.string().optional() }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ code: "invalid_request" });
    authService.deleteYuqueToken(body.data.user_id, body.data.session_id);
    return res.json({ code: "ok" });
  });

  app.get("/api/auth/status", (req, res) => {
    const userId = String(req.query.user_id ?? "");
    const sessionId = req.query.session_id ? String(req.query.session_id) : undefined;
    return res.json({ code: "ok", data: authService.getStatus(userId, sessionId) });
  });

  app.post("/api/docs/import", (req, res) => {
    const parsed = importSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ code: "invalid_request" });
    const docs = orchestrator.importDocuments(parsed.data.session_id, parsed.data.docs);
    return res.json({ code: "ok", data: docs });
  });

  app.post("/api/analysis/start", (req, res) => {
    const parsed = analysisSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ code: "invalid_request" });
    const task = orchestrator.startTask(parsed.data.session_id, parsed.data.user_id);
    return res.json({ code: "ok", data: { task_id: task.task_id } });
  });

  app.get("/api/analysis/task", (req, res) => {
    const taskId = String(req.query.task_id ?? "");
    const task = orchestrator.getTask(taskId);
    if (!task) return res.status(404).json({ code: "not_found" });
    return res.json({ code: "ok", data: task });
  });

  app.get("/api/analysis/result", (req, res) => {
    const sessionId = String(req.query.session_id ?? "");
    return res.json({ code: "ok", data: orchestrator.getSessionResult(sessionId) });
  });

  app.get("/api/storage/snapshot", (_req, res) => {
    // Debug-only route; token payload stays encrypted in storage.
    const snapshot = repo.snapshot();
    return res.json({ code: "ok", data: snapshot });
  });

  return app;
}
