/**
 * Builds highlight text only from Experience fields (which originate from Facts → Chunks).
 * Does not invent metrics: numeric claims only when `merged_metrics` is non-empty from extraction.
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

function applyStyle(
  base: string,
  style: Highlight["style"],
  targetJob: Session["target_job"],
  exp: Experience
): string {
  const metricSuffix =
    exp.merged_metrics.length > 0
      ? `（材料中出现的量化表述：${exp.merged_metrics.join("；")}）`
      : "";

  if (style === "concise") {
    const tail = base.endsWith("。") ? base : `${base}。`;
    return tail + metricSuffix;
  }
  if (style === "technical") {
    const tech = exp.merged_tool_stack.length
      ? `在技术栈 ${exp.merged_tool_stack.slice(0, 4).join("、")} 相关场景下，${base}`
      : `在技术实现层面，${base}`;
    return `${tech}。${metricSuffix}`;
  }
  // business
  const role = targetJob === "product" ? "业务协同与推进" : "工作推进";
  return `围绕${exp.summary_theme ?? "项目目标"}，${base}，侧重${role}与可落地执行。${metricSuffix}`;
}

export function generateHighlightFromExperience(
  exp: Experience,
  style: Highlight["style"],
  targetJob: Session["target_job"]
): Omit<Highlight, "highlight_id" | "session_id" | "status" | "is_edited"> {
  const base = buildBaseClause(exp);
  const content = applyStyle(base, style, targetJob, exp).trim();
  return {
    experience_id: exp.experience_id,
    style,
    target_job: targetJob,
    title: exp.project_name,
    content,
    evidence_fact_ids: [...exp.fact_ids],
    confidence_score: Number(exp.confidence_score.toFixed(2)),
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
