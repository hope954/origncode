/**
 * Fact extraction from Chunk text only. No Feishu/Yuque or adapter imports.
 * Conservative: skips lines without action-like patterns; metric only when digits appear in the same line.
 */
import type { Chunk, Fact } from "../types.js";
import { makeId } from "../utils/id.js";

const ACTION_PATTERN = /(负责|实现|设计|完成|优化|推进|开发|使用|基于|搭建|参与|梳理|协调|交付|支持)/;

/** Explicit numeric / percent-like token in source — never invent metrics elsewhere. */
const METRIC_TOKEN = /(\d+(?:\.\d+)?\s*%|\d+(?:\.\d+)?\s*(?:万|亿|k|K|ms|s|人|次|个)|提升\s*\d+|降低\s*\d+|QPS\s*\d+)/;

const TECH_LEXICON = [
  "React",
  "Vue",
  "TypeScript",
  "JavaScript",
  "Node",
  "Python",
  "Java",
  "Go",
  "HTTP",
  "REST",
  "API",
  "SQL",
  "Redis",
  "Kafka",
  "Docker",
  "Kubernetes",
  "AWS",
  "Git",
  "CI/CD",
  "前端",
  "后端",
  "微服务"
];

function pickTools(line: string): string[] {
  const found = new Set<string>();
  for (const t of TECH_LEXICON) {
    if (line.includes(t)) found.add(t);
  }
  return [...found];
}

function extractMetric(line: string): string | null {
  const m = line.match(METRIC_TOKEN);
  return m ? m[0].trim() : null;
}

function firstSentence(line: string): string {
  const s = line.split(/[。；;]/)[0]?.trim() ?? line;
  return s.slice(0, 400);
}

export function extractFactsFromChunk(sessionId: string, chunk: Chunk): Fact[] {
  const facts: Fact[] = [];
  const segments = chunk.text.split(/\n+/).map((s) => s.trim()).filter(Boolean);

  for (const line of segments) {
    if (line.length < 8) continue;
    if (!ACTION_PATTERN.test(line)) continue;

    const metric = extractMetric(line);
    const tools = pickTools(line);
    const evidence = firstSentence(line);
    const projectName = chunk.title_path[0] ?? null;

    facts.push({
      fact_id: makeId("fact"),
      session_id: sessionId,
      chunk_id: chunk.chunk_id,
      project_name: projectName,
      background: null,
      user_role: null,
      action: evidence,
      tool_stack: tools,
      challenge: null,
      solution: null,
      result: null,
      metric,
      collaboration: null,
      evidence_text: evidence,
      confidence: Math.min(0.95, 0.45 + chunk.relevance_score * 0.4)
    });
  }

  return facts;
}
