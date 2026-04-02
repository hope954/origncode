/**
 * Rewrites highlight wording using the same Experience evidence; does not add new facts or metrics.
 */
import type { Experience, Highlight, Session } from "../types.js";
import { generateHighlightFromExperience } from "./highlight_generator.js";

export function rewriteHighlight(
  highlight: Highlight,
  experience: Experience,
  style: Highlight["style"],
  targetJob: Session["target_job"]
): Highlight {
  const next = generateHighlightFromExperience(experience, style, targetJob);
  return {
    ...highlight,
    style,
    target_job: targetJob,
    content: next.content,
    final_content: next.content,
    evidence_fact_ids: [...experience.fact_ids],
    confidence_score: next.confidence_score,
    status: "rewritten",
    original_content: highlight.original_content || highlight.content
  };
}
