/**
 * Yuque platform adapter — document fetch + NormalizedDocument mapping only.
 *
 * Token verify / save / delete belongs to `auth_service` (MVP: manual token).
 * This adapter receives a decrypted access token only after auth_service persisted it.
 *
 * REAL MODE (YUQUE_LIVE_FETCH=1 or when token is non-empty and does not match mock pattern):
 *   Uses Yuque Open API v2 to fetch document body.
 *   Supported URL format:
 *     https://www.yuque.com/{namespace}/{book}/{slug}
 *   API call: GET /api/v2/repos/{namespace}/{book}/docs/{slug}
 *
 * MOCK MODE (default, CI):
 *   Returns synthetic NormalizedDocument.
 */
import { config } from "../config.js";
import type { DocumentRef, NormalizedDocument } from "../types.js";
import { makeId } from "../utils/id.js";

// ─── URL helpers ─────────────────────────────────────────────────────────────

function parseYuqueUrl(url: string): { namespace: string; book: string; slug: string } | null {
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
    body?: string;       // markdown
    body_lake?: string;  // lake format (fallback)
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
  const res = await fetch(url, {
    headers: {
      "X-Auth-Token": token,
      Accept: "application/json",
      "User-Agent": "private-doc-resume-agent/1.0"
    }
  });

  if (res.status === 401 || res.status === 403) {
    const json = (await res.json().catch(() => ({}))) as YuqueDocResp;
    const msg = json.message ?? "";
    if (res.status === 401 || msg.includes("token") || msg.includes("unauthorized")) {
      throw Object.assign(new Error("token_invalid"), { reason: "token_invalid" });
    }
    throw Object.assign(new Error("access_denied"), { reason: "access_denied" });
  }
  if (res.status === 404) {
    throw Object.assign(new Error("fetch_failed"), { reason: "fetch_failed", detail: "doc_not_found" });
  }
  if (!res.ok) {
    throw Object.assign(new Error("fetch_failed"), { reason: "fetch_failed" });
  }

  const json = (await res.json()) as YuqueDocResp;
  const title = json.data?.title ?? slug;
  const content = json.data?.body ?? json.data?.body_lake ?? "";
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

const YUQUE_LIVE_FETCH = process.env.YUQUE_LIVE_FETCH === "1";

export class YuqueAdapter {
  async fetchDocument(doc: DocumentRef, accessToken: string): Promise<NormalizedDocument> {
    if (!accessToken || accessToken.length < 8) {
      throw Object.assign(new Error("access_denied"), { reason: "access_denied" });
    }

    if (YUQUE_LIVE_FETCH) {
      const parsed = parseYuqueUrl(doc.url);
      if (!parsed) {
        throw Object.assign(new Error("fetch_failed"), {
          reason: "fetch_failed",
          detail: `Unsupported Yuque URL format: ${doc.url}`
        });
      }
      const { title, content } = await fetchYuqueDoc(
        parsed.namespace,
        parsed.book,
        parsed.slug,
        accessToken,
        config.yuque.baseUrl
      );
      return buildNormalizedDoc(doc, title, content);
    }

    // Mock path (default CI / dev)
    const content = `# Yuque Document\nURL: ${doc.url}\n- 背景\n- 目标\n- 结果`;
    return buildNormalizedDoc(doc, "Yuque Imported Doc", content);
  }
}
