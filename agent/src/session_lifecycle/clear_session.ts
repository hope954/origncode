/**
 * Session-scoped data purge for `POST /api/session/clear`.
 *
 * Boundary (important):
 * - **Session data**: documents, chunks, facts, experiences, highlights, tasks tied to `session_id` — **removed**.
 * - **PlatformAuth**: only rows with `platformAuths.session_id === sessionId` are removed. Rows where
 *   `session_id` is **undefined** (e.g. user-wide Yuque token not tied to a session) are **preserved** so
 *   long-lived credentials are not cleared when a single session ends.
 *
 * This module only mutates the JSON store; it does not call platform APIs or auth_service (boundary preserved).
 */
import type { Repository } from "../storage/repository.js";

export type ClearSessionResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "forbidden" };

/**
 * Removes the session row and all structured artifacts for that session.
 * Optional `requestUserId` must match `session.user_id` when provided (defense in depth).
 */
export function clearSessionData(
  repo: Repository,
  sessionId: string,
  requestUserId?: string
): ClearSessionResult {
  const snap = repo.snapshot();
  const session = snap.sessions.find((s) => s.session_id === sessionId);
  if (!session) return { ok: false, reason: "not_found" };
  if (requestUserId !== undefined && session.user_id !== requestUserId) {
    return { ok: false, reason: "forbidden" };
  }

  repo.mutate((data) => {
    data.sessions = data.sessions.filter((s) => s.session_id !== sessionId);
    data.documentRefs = data.documentRefs.filter((d) => d.session_id !== sessionId);
    data.normalizedDocuments = data.normalizedDocuments.filter((n) => n.session_id !== sessionId);
    data.chunks = data.chunks.filter((c) => c.session_id !== sessionId);
    data.analysisTasks = data.analysisTasks.filter((t) => t.session_id !== sessionId);
    data.facts = data.facts.filter((f) => f.session_id !== sessionId);
    data.experiences = data.experiences.filter((e) => e.session_id !== sessionId);
    data.highlights = data.highlights.filter((h) => h.session_id !== sessionId);
    data.resumeAnalysisTasks = data.resumeAnalysisTasks.filter((t) => t.session_id !== sessionId);
    data.platformAuths = data.platformAuths.filter((a) => a.session_id !== sessionId);
  });

  return { ok: true };
}
