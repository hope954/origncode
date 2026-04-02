/**
 * Groups Facts into Experiences by project/title signal. Purely structural — no platform logic.
 */
import type { Experience, Fact } from "../types.js";
import { makeId } from "../utils/id.js";

function groupKey(f: Fact): string {
  return (f.project_name ?? "default").trim() || "default";
}

export function mergeFactsToExperiences(sessionId: string, facts: Fact[]): Experience[] {
  const buckets = new Map<string, Fact[]>();
  for (const f of facts) {
    const k = groupKey(f);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(f);
  }

  const experiences: Experience[] = [];
  for (const [, group] of buckets) {
    const factIds = group.map((f) => f.fact_id);
    const chunkIds = [...new Set(group.map((f) => f.chunk_id))];
    const actions = [...new Set(group.map((f) => f.action).filter(Boolean))] as string[];
    const tools = [...new Set(group.flatMap((f) => f.tool_stack))];
    const metrics = [...new Set(group.map((f) => f.metric).filter(Boolean))] as string[];
    const projectName = group[0]?.project_name ?? null;

    const avgConf = group.reduce((s, f) => s + f.confidence, 0) / Math.max(1, group.length);

    experiences.push({
      experience_id: makeId("exp"),
      session_id: sessionId,
      project_name: projectName,
      summary_theme: projectName ?? "经历聚合",
      fact_ids: factIds,
      merged_background: null,
      merged_actions: actions,
      merged_tool_stack: tools,
      merged_challenges: [],
      merged_solutions: [],
      merged_results: [],
      merged_metrics: metrics,
      evidence_chunk_ids: chunkIds,
      confidence_score: Number(avgConf.toFixed(3))
    });
  }

  return experiences;
}
