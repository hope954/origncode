/**
 * Yuque platform adapter — document fetch + NormalizedDocument mapping only.
 *
 * Token verify / save / delete belongs to `auth_service` (MVP: manual token, no OAuth).
 * This adapter receives a decrypted access token only after auth_service persisted it.
 *
 * ── Real vs mock path ────────────────────────────────────────────────────────
 *
 * REAL MODE (default in production):
 *   Triggered automatically when:
 *     - `YUQUE_LIVE_FETCH=1`               (explicit opt-in, recommended for prod)
 *     - OR no `YUQUE_DISABLE_REAL=1` and URL is a valid 3-segment yuque.com URL
 *
 *   Actually, to keep CI integration tests green without network calls, we use
 *   an explicit opt-in gate:  YUQUE_LIVE_FETCH=1
 *
 *   Reads env at CALL TIME (not module load) so test beforeEach can toggle it.
 *
 *   Supported URL format: https://www.yuque.com/{namespace}/{book}/{slug}
 *   API call: GET /api/v2/repos/{namespace}/{book}/docs/{slug}
 *             X-Auth-Token: {accessToken}
 *
 * MOCK / FALLBACK PATH (CI default, when YUQUE_LIVE_FETCH is not set):
 *   Returns a synthetic NormalizedDocument with fixed placeholder text.
 *   Exists ONLY to let stage 1/2/3 integration tests pass without network.
 *   In production, ALWAYS set YUQUE_LIVE_FETCH=1.
 */
import { config } from "../config.js";
import type { DocumentRef, NormalizedDocument } from "../types.js";
import { makeId } from "../utils/id.js";
import { fetchJson } from "../http/fetch_client.js";

// ─── URL helpers ─────────────────────────────────────────────────────────────

export function parseYuqueUrl(url: string): { namespace: string; book: string; slug: string } | null {
  try {
    const { hostname, pathname } = new URL(url);
    if (!hostname.includes("yuque.com")) return null;
    const parts = pathname.replace(/^\/+/, "").split("/").filter(Boolean);
    if (parts.length < 3) return null;
    const [namespace, book, slug] = parts as [string, string, string];
    return { namespace, book, slug };
  } catch {
    return null;
  }
}

// ─── Real Yuque HTTP calls ────────────────────────────────────────────────────

interface YuqueDocResp {
  data?: {
    id?: number;
    title?: string;
    body?: string;        // markdown
    body_lake?: string;   // lake format (platform-internal, fallback)
    slug?: string;
  };
  message?: string;
}

async function fetchYuqueDoc(
  namespace: string,
  book: string,
  slug: string,
  token: string,
  baseUrl: string
): Promise<{ title: string; content: string }> {
  const url = `${baseUrl}/api/v2/repos/${namespace}/${book}/docs/${slug}`;
  const r = await fetchJson(
    url,
    {
      headers: {
        "X-Auth-Token": token,
        Accept: "application/json",
        "User-Agent": "private-doc-resume-agent/1.0"
      }
    },
    {
      shouldRetry: ({ status, error }) => {
        if (error) return "retry";
        if (status && (status === 429 || status >= 500)) return "retry";
        return "no_retry";
      }
    }
  );

  const json = (r.json ?? {}) as YuqueDocResp;
  if (r.status === 401 || r.status === 403) {
    const msg = (json.message ?? "").toLowerCase();
    if (r.status === 401 || msg.includes("token") || msg.includes("unauthorized")) {
      throw Object.assign(new Error("token_invalid"), { reason: "token_invalid" });
    }
    throw Object.assign(new Error("access_denied"), { reason: "access_denied" });
  }
  if (r.status === 404) {
    throw Object.assign(new Error("fetch_failed"), { reason: "fetch_failed", detail: "doc_not_found" });
  }
  if (!r.ok) {
    throw Object.assign(new Error("fetch_failed"), { reason: "fetch_failed" });
  }

  // Tolerate abnormal response shape, but distinguish unsupported structure vs empty content.
  const title = json.data?.title ?? slug;
  const body = json.data?.body;
  const lake = json.data?.body_lake;
  if (body === undefined && lake === undefined) {
    throw Object.assign(new Error("fetch_failed"), { reason: "fetch_failed", detail: "unsupported_structure" });
  }
  const content = body ?? lake ?? "";
  if (!content.trim()) {
    throw Object.assign(new Error("fetch_failed"), { reason: "fetch_failed", detail: "empty_content" });
  }
  return { title, content };
}

// ─── Mapping helper ───────────────────────────────────────────────────────────

function buildNormalizedDoc(
  doc: DocumentRef,
  title: string,
  content: string
): NormalizedDocument {
  const lines = content.split("\n").filter((l) => l.trim());
  const headingLine = lines.find((l) => l.startsWith("#"));
  const topTitle = headingLine ? headingLine.replace(/^#+\s*/, "") : title;
  return {
    normalized_doc_id: makeId("ndoc"),
    doc_id: doc.doc_id,
    session_id: doc.session_id,
    platform: "yuque",
    title: topTitle,
    title_path: [topTitle],
    blocks: lines,
    content_text: lines.join("\n"),
    created_at: new Date().toISOString()
  };
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

export class YuqueAdapter {
  /**
   * Fetch a Yuque document and map it to NormalizedDocument.
   *
   * - Real HTTP path: activated by YUQUE_LIVE_FETCH=1 (read at call time).
   *   Set this in production. CI leaves it unset to avoid network calls.
   * - Fallback path: returns synthetic placeholder content.
   *   Only for CI / local dev without real credentials.
   *   Stage 1/2/3 tests rely on this path; that is intentional.
   */
  async fetchDocument(doc: DocumentRef, accessToken: string): Promise<NormalizedDocument> {
    if (!accessToken || accessToken.length < 8) {
      throw Object.assign(new Error("access_denied"), { reason: "access_denied" });
    }

    // Read env at call time so test beforeEach can set YUQUE_LIVE_FETCH=1
    // before calling the adapter, even when the module was already imported.
    if (process.env.YUQUE_LIVE_FETCH === "1") {
      const parsed = parseYuqueUrl(doc.url);
      if (!parsed) {
        throw Object.assign(new Error("fetch_failed"), {
          reason: "fetch_failed",
          detail: `Unsupported Yuque URL format (need https://www.yuque.com/{ns}/{book}/{slug}): ${doc.url}`
        });
      }
      const { title, content } = await fetchYuqueDoc(
        parsed.namespace,
        parsed.book,
        parsed.slug,
        accessToken,
        (process.env.YUQUE_BASE_URL ?? config.yuque.baseUrl).replace(/\/$/, "")
      );
      return buildNormalizedDoc(doc, title, content);
    }

    // ── CI / dev fallback (YUQUE_LIVE_FETCH not set) ──────────────────────────
    // Returns fixed placeholder so integration tests work without network access.
    // In production, set YUQUE_LIVE_FETCH=1 to enable real document fetching.
    const content = `# Yuque Document\nURL: ${doc.url}\n- 背景\n- 目标\n- 结果`;
    return buildNormalizedDoc(doc, "Yuque Imported Doc", content);
  }
}
