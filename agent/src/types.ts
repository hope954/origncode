export type Platform = "feishu" | "yuque";

export type DocStatus =
  | "pending"
  | "auth_required"
  | "access_denied"
  | "pulling"
  | "parsing"
  | "parsed"
  | "failed"
  | "skipped";

export type SessionStatus =
  | "created"
  | "importing"
  | "parsing"
  | "extracting"
  | "merging"
  | "generating"
  | "completed"
  | "partial_success"
  | "failed";

export type HighlightStatus = "generated" | "rewritten" | "edited" | "saved" | "deleted";

export type PlatformAuthStatus =
  | "not_connected"
  | "connecting"
  | "connected"
  | "expired"
  | "invalid"
  | "revoked";

export interface Session {
  session_id: string;
  user_id: string;
  target_job: "generic" | "engineering" | "product" | "operations";
  styles: Array<"concise" | "technical" | "business">;
  desired_highlight_count: number;
  status: SessionStatus;
  created_at: string;
  updated_at: string;
}

export interface PlatformAuth {
  auth_id: string;
  user_id: string;
  session_id?: string;
  platform: Platform;
  auth_status: PlatformAuthStatus;
  access_token_encrypted?: string;
  refresh_token_encrypted?: string;
  token_expire_at?: string;
  last_verified_at?: string;
  created_at: string;
  updated_at: string;
}

export interface DocumentRef {
  doc_id: string;
  session_id: string;
  platform: Platform;
  url: string;
  title?: string;
  status: DocStatus;
  error_code?: string;
  created_at: string;
  updated_at: string;
}

export interface NormalizedDocument {
  normalized_doc_id: string;
  doc_id: string;
  session_id: string;
  platform: Platform;
  title: string;
  title_path: string[];
  blocks: string[];
  content_text: string;
  created_at: string;
}

export interface Chunk {
  chunk_id: string;
  normalized_doc_id: string;
  session_id: string;
  text: string;
  title_path: string[];
  relevance_score: number;
  created_at: string;
}

/** Extracted from chunk text only — no platform API coupling. */
export interface Fact {
  fact_id: string;
  /** `rule`: 规则抽取；`synthetic_fallback`: 规则未命中时由 chunk 合成的降级事实（不得与规则事实同权竞争排序）。 */
  extraction_tier: "rule" | "synthetic_fallback";
  session_id: string;
  chunk_id: string;
  project_name: string | null;
  background: string | null;
  user_role: string | null;
  action: string | null;
  tool_stack: string[];
  challenge: string | null;
  solution: string | null;
  result: string | null;
  metric: string | null;
  collaboration: string | null;
  evidence_text: string;
  confidence: number;
}

export interface Experience {
  experience_id: string;
  session_id: string;
  /** 当且仅当聚合内全部 fact 均为 synthetic_fallback 时为 true。 */
  degraded: boolean;
  project_name: string | null;
  summary_theme: string;
  fact_ids: string[];
  merged_background: string | null;
  merged_actions: string[];
  merged_tool_stack: string[];
  merged_challenges: string[];
  merged_solutions: string[];
  merged_results: string[];
  merged_metrics: string[];
  evidence_chunk_ids: string[];
  confidence_score: number;
}

export interface Highlight {
  highlight_id: string;
  session_id: string;
  experience_id: string;
  style: "concise" | "technical" | "business";
  target_job: Session["target_job"];
  title: string | null;
  content: string;
  evidence_fact_ids: string[];
  confidence_score: number;
  status: HighlightStatus;
  is_edited: boolean;
  original_content: string;
  final_content: string;
}

export interface AnalysisTask {
  task_id: string;
  session_id: string;
  status: "queued" | "running" | "completed" | "partial_success" | "failed";
  failure_reasons: string[];
  created_at: string;
  updated_at: string;
}

export interface ResumeAnalysisTask {
  task_id: string;
  session_id: string;
  status: "extracting" | "merging" | "generating" | "completed" | "failed" | "partial_success";
  created_at: string;
  updated_at: string;
}

export interface DataStore {
  sessions: Session[];
  platformAuths: PlatformAuth[];
  documentRefs: DocumentRef[];
  normalizedDocuments: NormalizedDocument[];
  chunks: Chunk[];
  analysisTasks: AnalysisTask[];
  facts: Fact[];
  experiences: Experience[];
  highlights: Highlight[];
  resumeAnalysisTasks: ResumeAnalysisTask[];
}
