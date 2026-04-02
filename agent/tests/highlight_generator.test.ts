import { describe, expect, it } from "vitest";
import { generateHighlightFromExperience } from "../src/highlight_pipeline/highlight_generator.js";
import type { Experience } from "../src/types.js";

function exp(partial: Partial<Experience> & Pick<Experience, "experience_id" | "session_id">): Experience {
  return {
    project_name: "P",
    summary_theme: "主题",
    fact_ids: ["f1"],
    merged_background: null,
    merged_actions: ["负责接口优化与联调"],
    merged_tool_stack: ["TypeScript"],
    merged_challenges: [],
    merged_solutions: [],
    merged_results: [],
    merged_metrics: [],
    evidence_chunk_ids: ["c1"],
    confidence_score: 0.8,
    degraded: false,
    ...partial
  };
}

describe("highlight_generator", () => {
  it("does not use audit-style parentheses for metrics; weaves merged_metrics into sentence", () => {
    const e = exp({
      experience_id: "e1",
      session_id: "s1",
      merged_metrics: ["30%", "QPS 500"]
    });
    const h = generateHighlightFromExperience(e, "technical", "engineering");
    expect(h.content).not.toMatch(/材料/);
    expect(h.content).toMatch(/30%|500/);
  });

  it("does not invent numeric claims when merged_metrics is empty", () => {
    const e = exp({
      experience_id: "e2",
      session_id: "s1",
      merged_metrics: [],
      merged_actions: ["负责需求梳理"]
    });
    const h = generateHighlightFromExperience(e, "concise", "product");
    expect(h.content).not.toMatch(/\d+%/);
    expect(h.content).not.toMatch(/量化表现为/);
  });
});
