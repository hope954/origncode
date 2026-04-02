import { describe, expect, it } from "vitest";
import { rankExperiences } from "../src/experience_pipeline/experience_ranker.js";
import type { Experience } from "../src/types.js";

function baseExp(id: string, degraded: boolean, actions: string[]): Experience {
  return {
    experience_id: id,
    session_id: "s1",
    degraded,
    project_name: "P",
    summary_theme: "T",
    fact_ids: [],
    merged_background: null,
    merged_actions: actions,
    merged_tool_stack: [],
    merged_challenges: [],
    merged_solutions: [],
    merged_results: [],
    merged_metrics: [],
    evidence_chunk_ids: [],
    confidence_score: degraded ? 0.05 : 0.85
  };
}

describe("experience_ranker synthetic downrank", () => {
  it("sorts non-degraded experiences before degraded-only synthetic buckets at equal theme", () => {
    const a = baseExp("e_rule", false, ["开发后端接口与系统优化"]);
    const b = baseExp("e_syn", true, ["开发后端接口与系统优化"]);
    const ranked = rankExperiences([b, a], "engineering");
    expect(ranked[0]!.experience_id).toBe("e_rule");
    expect(ranked[1]!.experience_id).toBe("e_syn");
  });
});
