/**
 * Ensures highlight ↔ fact linkage is complete for downstream evidence API.
 * Generation already sets `evidence_fact_ids`; this validates and repairs if needed.
 */
import type { Experience, Highlight } from "../types.js";

export function bindHighlightEvidence(highlight: Highlight, experience: Experience): Highlight {
  const ids = highlight.evidence_fact_ids.length > 0 ? highlight.evidence_fact_ids : experience.fact_ids;
  const valid = ids.filter((id) => experience.fact_ids.includes(id));
  const merged = valid.length > 0 ? valid : experience.fact_ids;
  return {
    ...highlight,
    evidence_fact_ids: [...new Set(merged)],
    experience_id: experience.experience_id
  };
}
