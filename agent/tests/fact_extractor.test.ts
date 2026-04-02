import { describe, expect, it } from "vitest";
import { extractFactsFromChunk } from "../src/experience_pipeline/fact_extractor.js";
import type { Chunk } from "../src/types.js";

function chunk(partial: Partial<Chunk> & Pick<Chunk, "chunk_id" | "session_id" | "text">): Chunk {
  return {
    normalized_doc_id: "nd_1",
    title_path: ["项目A"],
    relevance_score: 0.8,
    created_at: new Date().toISOString(),
    ...partial
  };
}

describe("fact_extractor", () => {
  it("extracts metric only when digits appear in source line", () => {
    const withMetric = extractFactsFromChunk(
      "sess_1",
      chunk({
        chunk_id: "c1",
        session_id: "sess_1",
        text: "负责优化接口性能，提升 30%，并降低错误率。"
      })
    );
    expect(withMetric.length).toBeGreaterThan(0);
    expect(withMetric.some((f) => f.metric != null)).toBe(true);
  });

  it("does not attach metric when line has action but no numeric token", () => {
    const noMetric = extractFactsFromChunk(
      "sess_1",
      chunk({
        chunk_id: "c2",
        session_id: "sess_1",
        text: "负责梳理需求并推进跨团队评审。"
      })
    );
    expect(noMetric.length).toBeGreaterThan(0);
    expect(noMetric.every((f) => f.metric == null)).toBe(true);
  });

  it("ignores lines without action-like verbs", () => {
    const empty = extractFactsFromChunk(
      "sess_1",
      chunk({
        chunk_id: "c3",
        session_id: "sess_1",
        text: "这是一个没有任何动词匹配的段落内容。"
      })
    );
    expect(empty.length).toBe(0);
  });
});
