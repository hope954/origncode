/**
 * Ranks experiences by coarse keyword overlap with target_job. No external services.
 */
import type { Experience, Session } from "../types.js";

const JOB_KEYWORDS: Record<Session["target_job"], RegExp[]> = {
  engineering: [/开发|实现|接口|系统|性能|架构|代码|前后端|API|技术|工程|部署|自动化/i],
  product: [/需求|用户|流程|方案|优先级|迭代|协作|梳理|推进|落地|产品|业务/i],
  operations: [/运营|数据|指标|协同|活动|增长|转化|执行|复盘|资源/i],
  generic: [/./]
};

export function rankExperiences(experiences: Experience[], targetJob: Session["target_job"]): Experience[] {
  const patterns = JOB_KEYWORDS[targetJob] ?? JOB_KEYWORDS.generic;
  const score = (e: Experience): number => {
    const blob = [
      e.summary_theme,
      ...e.merged_actions,
      ...e.merged_tool_stack,
      ...e.merged_metrics
    ].join(" ");
    let hits = 0;
    for (const p of patterns) {
      if (p.test(blob)) hits += 1;
    }
    let s = e.confidence_score + hits * 0.15;
    if (e.degraded) s -= 1.2;
    return s;
  };

  return [...experiences].sort((a, b) => score(b) - score(a));
}
