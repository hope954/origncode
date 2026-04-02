/**
 * Builds highlight text only from Experience fields (which originate from Facts → Chunks).
 * Does not invent metrics: numeric claims only when `merged_metrics` is non-empty from extraction.
 * Quantitative wording is woven into the sentence — not audit-style parentheticals (evidence lives in API).
 */
import type { Experience, Highlight, Session } from "../types.js";
import { makeId } from "../utils/id.js";

function buildBaseClause(exp: Experience): string {
  const actions = exp.merged_actions.slice(0, 3).join("；");
  const tools =
    exp.merged_tool_stack.length > 0 ? `运用 ${exp.merged_tool_stack.slice(0, 5).join("、")}` : "";
  const parts = [actions, tools].filter(Boolean);
  return parts.join("，");
}

/** 将材料中已抽取的指标自然并入一句，不输出“材料中出现…”等审计式括注。 */
function embedMetricsInSentence(
  sentence: string,
  metrics: string[],
  style: Highlight["style"]
): string {
  if (metrics.length === 0) return sentence;
  const [m0, m1] = metrics;
  const trimmed = sentence.replace(/\s*$/u, "").replace(/。?$/u, "");
  if (style === "technical") {
    return `${trimmed}；在工程可观测维度上达到 ${m0}${m1 ? `，并同步体现 ${m1}` : ""}。`;
  }
  if (style === "business") {
    return `${trimmed}，业务侧可量化表现为 ${m0}${m1 ? `、${m1}` : ""}。`;
  }
  return `${trimmed}，关键量化结果约 ${m0}${m1 ? `，并包含 ${m1}` : ""}。`;
}

function applyStyle(
  base: string,
  style: Highlight["style"],
  targetJob: Session["target_job"],
  exp: Experience
): string {
  let body: string;
  if (style === "technical") {
    body = exp.merged_tool_stack.length
      ? `在技术栈 ${exp.merged_tool_stack.slice(0, 4).join("、")} 相关场景下，${base}`
      : `在技术实现层面，${base}`;
    body = body.endsWith("。") ? body : `${body}。`;
  } else if (style === "business") {
    const role = targetJob === "product" ? "业务协同与推进" : "工作推进";
    body = `围绕${exp.summary_theme ?? "项目目标"}，${base}，侧重${role}与可落地执行。`;
  } else {
    body = base.endsWith("。") ? base : `${base}。`;
  }

  return embedMetricsInSentence(body, exp.merged_metrics, style).trim();
}

export function generateHighlightFromExperience(
  exp: Experience,
  style: Highlight["style"],
  targetJob: Session["target_job"]
): Omit<Highlight, "highlight_id" | "session_id" | "status" | "is_edited"> {
  const base = buildBaseClause(exp);
  const content = applyStyle(base, style, targetJob, exp).trim();
  const confBase = exp.confidence_score * (exp.degraded ? 0.82 : 1);
  return {
    experience_id: exp.experience_id,
    style,
    target_job: targetJob,
    title: exp.project_name,
    content,
    evidence_fact_ids: [...exp.fact_ids],
    confidence_score: Number(Math.min(0.99, confBase).toFixed(2)),
    original_content: content,
    final_content: content
  };
}

export function generateHighlightsForSession(
  sessionId: string,
  rankedExperiences: Experience[],
  styles: Session["styles"],
  targetJob: Session["target_job"],
  desiredCount: number
): Highlight[] {
  const primaryStyle = styles[0] ?? "concise";
  const highlights: Highlight[] = [];
  const n = Math.min(desiredCount, rankedExperiences.length);
  for (let i = 0; i < n; i++) {
    const exp = rankedExperiences[i]!;
    const partial = generateHighlightFromExperience(exp, primaryStyle, targetJob);
    highlights.push({
      highlight_id: makeId("hl"),
      session_id: sessionId,
      status: "generated",
      is_edited: false,
      ...partial
    });
  }
  return highlights;
}
