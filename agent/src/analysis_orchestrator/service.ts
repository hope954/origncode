import { chunker } from "../document_pipeline/chunker.js";
import { contentCleaner } from "../document_pipeline/cleaner.js";
import { documentNormalizer } from "../document_pipeline/normalizer.js";
import { FeishuAdapter } from "../platform_adapters/feishuAdapter.js";
import { YuqueAdapter } from "../platform_adapters/yuqueAdapter.js";
import { Repository } from "../storage/repository.js";
import type { AnalysisTask, DocumentRef, Platform, Session, SessionStatus } from "../types.js";
import { makeId } from "../utils/id.js";
import { AuthService } from "../auth_service/service.js";

export class AnalysisOrchestrator {
  constructor(
    private readonly repo: Repository,
    private readonly authService: AuthService,
    private readonly feishuAdapter: FeishuAdapter,
    private readonly yuqueAdapter: YuqueAdapter
  ) {}

  createSession(input: Omit<Session, "session_id" | "status" | "created_at" | "updated_at">): Session {
    const now = new Date().toISOString();
    const session: Session = {
      session_id: makeId("sess"),
      ...input,
      status: "created",
      created_at: now,
      updated_at: now
    };
    this.repo.mutate((data) => {
      data.sessions.push(session);
    });
    return session;
  }

  importDocuments(sessionId: string, docs: Array<{ platform: Platform; url: string }>): DocumentRef[] {
    const now = new Date().toISOString();
    const refs: DocumentRef[] = docs.map((doc) => ({
      doc_id: makeId("doc"),
      session_id: sessionId,
      platform: doc.platform,
      url: doc.url,
      status: "pending",
      created_at: now,
      updated_at: now
    }));
    this.repo.mutate((data) => {
      data.documentRefs.push(...refs);
      const session = data.sessions.find((item) => item.session_id === sessionId);
      if (session) {
        session.status = "importing";
        session.updated_at = now;
      }
    });
    return refs;
  }

  startTask(sessionId: string, userId: string): AnalysisTask {
    const now = new Date().toISOString();
    const task: AnalysisTask = {
      task_id: makeId("task"),
      session_id: sessionId,
      status: "queued",
      failure_reasons: [],
      created_at: now,
      updated_at: now
    };
    this.repo.mutate((data) => data.analysisTasks.push(task));
    this.runTask(task.task_id, userId);
    return task;
  }

  getTask(taskId: string): AnalysisTask | undefined {
    return this.repo.snapshot().analysisTasks.find((item) => item.task_id === taskId);
  }

  getSessionResult(sessionId: string): {
    session_status: SessionStatus;
    docs_total: number;
    docs_parsed: number;
    docs_failed: number;
    partial_success: boolean;
    failures: Array<{ doc_id: string; code?: string }>;
  } {
    const snap = this.repo.snapshot();
    const docs = snap.documentRefs.filter((d) => d.session_id === sessionId);
    const parsed = docs.filter((d) => d.status === "parsed").length;
    const failedDocs = docs.filter((d) => ["failed", "auth_required", "access_denied"].includes(d.status));
    const partial = parsed > 0 && failedDocs.length > 0;
    const status = parsed === 0 && failedDocs.length > 0 ? "failed" : partial ? "partial_success" : "completed";
    return {
      session_status: status,
      docs_total: docs.length,
      docs_parsed: parsed,
      docs_failed: failedDocs.length,
      partial_success: partial,
      failures: failedDocs.map((d) => ({ doc_id: d.doc_id, code: d.error_code }))
    };
  }

  private runTask(taskId: string, userId: string): void {
    this.repo.mutate((data) => {
      const task = data.analysisTasks.find((item) => item.task_id === taskId);
      if (task) task.status = "running";
      const session = data.sessions.find((item) => item.session_id === task?.session_id);
      if (session) session.status = "parsing";
    });
    const snap = this.repo.snapshot();
    const task = snap.analysisTasks.find((item) => item.task_id === taskId);
    if (!task) return;
    const docs = snap.documentRefs.filter((item) => item.session_id === task.session_id);
    const failures: string[] = [];

    for (const doc of docs) {
      try {
        this.repo.mutate((data) => {
          const target = data.documentRefs.find((item) => item.doc_id === doc.doc_id);
          if (target) {
            target.status = "pulling";
            target.updated_at = new Date().toISOString();
          }
        });

        const token = this.authService.getAccessToken(doc.platform, userId, task.session_id);
        if (!token) {
          this.markDoc(doc.doc_id, "auth_required", "auth_required");
          failures.push(`${doc.doc_id}:auth_required`);
          continue;
        }
        const normalized = doc.platform === "feishu"
          ? this.feishuAdapter.fetchDocument(doc, token)
          : this.yuqueAdapter.fetchDocument(doc, token);
        this.markDoc(doc.doc_id, "parsing");
        const normalizedDoc = documentNormalizer(normalized);
        const cleaned = contentCleaner(normalizedDoc.content_text);
        const normalizedCleaned = { ...normalizedDoc, content_text: cleaned, blocks: cleaned.split("\n").filter(Boolean) };
        const chunks = chunker(normalizedCleaned);
        this.repo.mutate((data) => {
          data.normalizedDocuments.push(normalizedCleaned);
          data.chunks.push(...chunks);
        });
        this.markDoc(doc.doc_id, "parsed");
      } catch {
        this.markDoc(doc.doc_id, "access_denied", "access_denied");
        failures.push(`${doc.doc_id}:access_denied`);
      }
    }

    const result = this.getSessionResult(task.session_id);
    this.repo.mutate((data) => {
      const targetTask = data.analysisTasks.find((item) => item.task_id === taskId);
      const targetSession = data.sessions.find((item) => item.session_id === task.session_id);
      if (targetTask) {
        targetTask.status = result.session_status === "partial_success" ? "partial_success" : result.session_status;
        targetTask.failure_reasons = failures;
        targetTask.updated_at = new Date().toISOString();
      }
      if (targetSession) {
        targetSession.status = result.session_status;
        targetSession.updated_at = new Date().toISOString();
      }
    });
  }

  private markDoc(docId: string, status: DocumentRef["status"], code?: string): void {
    this.repo.mutate((data) => {
      const doc = data.documentRefs.find((item) => item.doc_id === docId);
      if (!doc) return;
      doc.status = status;
      doc.error_code = code;
      doc.updated_at = new Date().toISOString();
    });
  }
}
