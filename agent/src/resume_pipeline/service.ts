/**
 * Resume analysis: Chunk → Fact → Experience → Highlight.
 * Depends only on Repository + pure pipeline modules (no platform adapters).
 */
import { extractFactsFromChunk } from "../experience_pipeline/fact_extractor.js";
import { mergeFactsToExperiences } from "../experience_pipeline/experience_merger.js";
import { rankExperiences } from "../experience_pipeline/experience_ranker.js";
import { bindHighlightEvidence } from "../highlight_pipeline/evidence_binder.js";
import { generateHighlightsForSession } from "../highlight_pipeline/highlight_generator.js";
import { rewriteHighlight as applyRewrite } from "../highlight_pipeline/highlight_rewriter.js";
import { Repository } from "../storage/repository.js";
import type { Fact, Highlight, ResumeAnalysisTask, Session } from "../types.js";
import { makeId } from "../utils/id.js";

export interface ResumeAnalyzeInput {
  session_id: string;
  doc_ids?: string[];
  target_job?: Session["target_job"];
  styles?: Session["styles"];
  desired_highlight_count?: number;
}

export class ResumePipelineService {
  constructor(private readonly repo: Repository) {}

  runAnalyze(input: ResumeAnalyzeInput): ResumeAnalysisTask {
    const now = new Date().toISOString();
    const task: ResumeAnalysisTask = {
      task_id: makeId("rtask"),
      session_id: input.session_id,
      status: "extracting",
      created_at: now,
      updated_at: now
    };

    this.repo.mutate((data) => {
      data.resumeAnalysisTasks.push(task);
    });

    const snap = this.repo.snapshot();
    const session = snap.sessions.find((s) => s.session_id === input.session_id);
    if (!session) {
      this.finishTask(task.task_id, "failed");
      return { ...task, status: "failed", updated_at: new Date().toISOString() };
    }

    const targetJob = input.target_job ?? session.target_job;
    const styles = input.styles ?? session.styles;
    const desiredCount = input.desired_highlight_count ?? session.desired_highlight_count;

    this.repo.mutate((data) => {
      const s = data.sessions.find((x) => x.session_id === input.session_id);
      if (s) {
        s.target_job = targetJob;
        s.styles = styles;
        s.desired_highlight_count = desiredCount;
        s.status = "extracting";
        s.updated_at = new Date().toISOString();
      }
    });

    const parsedDocs = snap.documentRefs.filter(
      (d) => d.session_id === input.session_id && d.status === "parsed"
    );
    const effectiveDocIds =
      input.doc_ids && input.doc_ids.length > 0
        ? input.doc_ids
        : parsedDocs.map((d) => d.doc_id);

    const notReady = effectiveDocIds.filter((id) => !parsedDocs.some((d) => d.doc_id === id));
    if (notReady.length > 0) {
      this.finishTask(task.task_id, "failed");
      this.repo.mutate((data) => {
        const s = data.sessions.find((x) => x.session_id === input.session_id);
        if (s) {
          s.status = "failed";
          s.updated_at = new Date().toISOString();
        }
      });
      return { ...task, status: "failed", updated_at: new Date().toISOString() };
    }

    const normIds = snap.normalizedDocuments
      .filter((nd) => nd.session_id === input.session_id && effectiveDocIds.includes(nd.doc_id))
      .map((nd) => nd.normalized_doc_id);

    const chunks = snap.chunks.filter(
      (c) => c.session_id === input.session_id && normIds.includes(c.normalized_doc_id)
    );

    this.repo.mutate((data) => {
      data.facts = data.facts.filter((f) => f.session_id !== input.session_id);
      data.experiences = data.experiences.filter((e) => e.session_id !== input.session_id);
      data.highlights = data.highlights.filter((h) => h.session_id !== input.session_id);
    });

    if (chunks.length === 0) {
      this.finishTask(task.task_id, "failed");
      this.repo.mutate((data) => {
        const s = data.sessions.find((x) => x.session_id === input.session_id);
        if (s) {
          s.status = "failed";
          s.updated_at = new Date().toISOString();
        }
      });
      return { ...task, status: "failed", updated_at: new Date().toISOString() };
    }

    const facts: Fact[] = [];
    for (const ch of chunks) {
      facts.push(...extractFactsFromChunk(input.session_id, ch));
    }

    let factSet = facts;
    if (factSet.length === 0) {
      factSet = chunks.map((c) => ({
        fact_id: makeId("fact"),
        session_id: input.session_id,
        chunk_id: c.chunk_id,
        project_name: c.title_path[0] ?? null,
        background: null,
        user_role: null,
        action: c.text.slice(0, 200),
        tool_stack: [],
        challenge: null,
        solution: null,
        result: null,
        metric: null,
        collaboration: null,
        evidence_text: c.text.slice(0, 400),
        confidence: c.relevance_score * 0.8
      }));
    }

    this.repo.mutate((data) => {
      data.facts.push(...factSet);
      const t = data.resumeAnalysisTasks.find((x) => x.task_id === task.task_id);
      if (t) {
        t.status = "merging";
        t.updated_at = new Date().toISOString();
      }
      const s = data.sessions.find((x) => x.session_id === input.session_id);
      if (s) {
        s.status = "merging";
        s.updated_at = new Date().toISOString();
      }
    });

    const experiences = mergeFactsToExperiences(input.session_id, factSet);

    const ranked = rankExperiences(experiences, targetJob);
    let highlights = generateHighlightsForSession(
      input.session_id,
      ranked,
      styles,
      targetJob,
      desiredCount
    );

    const expById = new Map(ranked.map((e) => [e.experience_id, e]));
    highlights = highlights
      .map((h) => {
        const exp = expById.get(h.experience_id);
        return exp ? bindHighlightEvidence(h, exp) : h;
      })
      .filter((h) => h.evidence_fact_ids.length > 0);

    const docFailures = snap.documentRefs.filter(
      (d) => d.session_id === input.session_id && ["auth_required", "access_denied", "failed"].includes(d.status)
    );
    const sessionDone: Session["status"] =
      docFailures.length > 0 && highlights.length > 0 ? "partial_success" : "completed";

    this.repo.mutate((data) => {
      data.experiences.push(...ranked);
      data.highlights.push(...highlights);
      const t = data.resumeAnalysisTasks.find((x) => x.task_id === task.task_id);
      if (t) {
        t.status = sessionDone === "partial_success" ? "partial_success" : "completed";
        t.updated_at = new Date().toISOString();
      }
      const s = data.sessions.find((x) => x.session_id === input.session_id);
      if (s) {
        s.status = sessionDone;
        s.updated_at = new Date().toISOString();
      }
    });

    return {
      ...task,
      status: sessionDone === "partial_success" ? "partial_success" : "completed",
      updated_at: new Date().toISOString()
    };
  }

  private finishTask(taskId: string, status: ResumeAnalysisTask["status"]): void {
    this.repo.mutate((data) => {
      const t = data.resumeAnalysisTasks.find((x) => x.task_id === taskId);
      if (t) {
        t.status = status;
        t.updated_at = new Date().toISOString();
      }
    });
  }

  getResult(sessionId: string): {
    session_id: string;
    status: Session["status"];
    highlights: Highlight[];
    warnings: string[];
  } {
    const data = this.repo.snapshot();
    const session = data.sessions.find((s) => s.session_id === sessionId);
    const highlights = data.highlights.filter((h) => h.session_id === sessionId);
    const warnings: string[] = [];
    const docFails = data.documentRefs.filter(
      (d) => d.session_id === sessionId && ["auth_required", "access_denied", "failed"].includes(d.status)
    );
    if (docFails.length > 0) warnings.push("部分文档读取失败或未授权");
    const anyMetricInFacts = data.facts
      .filter((f) => f.session_id === sessionId)
      .some((f) => f.metric != null);
    if (highlights.length > 0 && !anyMetricInFacts) {
      warnings.push("部分亮点缺少明确量化指标（材料中未抽取到数字时系统不会编造）");
    }

    return {
      session_id: sessionId,
      status: session?.status ?? "failed",
      highlights,
      warnings
    };
  }

  getEvidence(highlightId: string): {
    highlight_id: string;
    source_docs: Array<{ doc_id: string; title: string }>;
    source_chunks: Array<{ chunk_id: string; title_path: string[]; cleaned_text: string }>;
    facts: Array<{
      fact_id: string;
      action: string | null;
      result: string | null;
      metric: string | null;
    }>;
  } | null {
    const data = this.repo.snapshot();
    const highlight = data.highlights.find((h) => h.highlight_id === highlightId);
    if (!highlight) return null;

    const facts = data.facts.filter((f) => highlight.evidence_fact_ids.includes(f.fact_id));
    const chunkIds = [...new Set(facts.map((f) => f.chunk_id))];
    const chunks = data.chunks.filter((c) => chunkIds.includes(c.chunk_id));
    const normIds = [...new Set(chunks.map((c) => c.normalized_doc_id))];
    const norms = data.normalizedDocuments.filter((n) => normIds.includes(n.normalized_doc_id));
    const docIds = [...new Set(norms.map((n) => n.doc_id))];
    const refs = data.documentRefs.filter((d) => docIds.includes(d.doc_id));

    const source_docs = docIds.map((docId) => {
      const nd = norms.find((n) => n.doc_id === docId);
      const ref = refs.find((r) => r.doc_id === docId);
      return { doc_id: docId, title: nd?.title ?? ref?.title ?? docId };
    });

    const source_chunks = chunks.map((c) => ({
      chunk_id: c.chunk_id,
      title_path: c.title_path,
      cleaned_text: c.text
    }));

    return {
      highlight_id: highlightId,
      source_docs,
      source_chunks,
      facts: facts.map((f) => ({
        fact_id: f.fact_id,
        action: f.action,
        result: f.result,
        metric: f.metric
      }))
    };
  }

  rewriteHighlight(
    highlightId: string,
    style: Highlight["style"],
    targetJob: Session["target_job"]
  ): Highlight | null {
    let updated: Highlight | null = null;
    this.repo.mutate((data) => {
      const h = data.highlights.find((x) => x.highlight_id === highlightId);
      const exp = data.experiences.find((e) => e.experience_id === h?.experience_id);
      if (!h || !exp) return;
      updated = applyRewrite(h, exp, style, targetJob);
      const idx = data.highlights.findIndex((x) => x.highlight_id === highlightId);
      if (idx >= 0) data.highlights[idx] = updated!;
    });
    return updated;
  }
}
