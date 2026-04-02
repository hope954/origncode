/**
 * Feishu platform adapter — document fetch + NormalizedDocument mapping only.
 *
 * Auth (OAuth URL, auth_code exchange, refresh) lives in `auth_service`, not here.
 *
 * REAL MODE (FEISHU_APP_ID configured):
 *   Uses Feishu Docs API to fetch document content.
 *   Supported URL formats:
 *     - https://[tenant].feishu.cn/docx/[DOCUMENT_ID]   (new docs format)
 *     - https://[tenant].feishu.cn/docs/[DOCUMENT_ID]   (legacy format)
 *   Raw content fetched via: GET /open-apis/docx/v1/documents/{id}/raw_content
 *
 * MOCK MODE (FEISHU_APP_ID not configured):
 *   Returns synthetic NormalizedDocument — used in CI / dev.
 */
import { config, feishuConfigured } from "../config.js";
import type { DocumentRef, NormalizedDocument } from "../types.js";
import { makeId } from "../utils/id.js";
import { fetchJson } from "../http/fetch_client.js";

// ─── URL helpers ─────────────────────────────────────────────────────────────

/**
 * Extract Feishu document ID from URL.
 * Handles: /docx/XXXX  /docs/XXXX  /wiki/XXXX
 * Returns { type, id } or null for unrecognised patterns.
 */
function parseFeishuUrl(url: string): { type: "docx" | "doc" | "wiki"; id: string } | null {
  try {
    const { pathname } = new URL(url);
    const parts = pathname.replace(/^\/+/, "").split("/");
    if (parts.length < 2) return null;
    const [segment, id] = parts as [string, string];
    if (!id) return null;
    if (segment === "docx") return { type: "docx", id };
    if (segment === "docs") return { type: "doc", id };
    if (segment === "wiki") return { type: "wiki", id };
    return null;
  } catch {
    return null;
  }
}

// ─── Real Feishu HTTP calls ───────────────────────────────────────────────────

interface FeishuRawContentResp {
  code?: number;
  data?: { content?: string; revision?: number };
  msg?: string;
}

interface FeishuDocInfoResp {
  code?: number;
  data?: { document?: { title?: string; document_id?: string } };
  msg?: string;
}

async function fetchDocxRawContent(
  documentId: string,
  userAccessToken: string,
  baseUrl: string
): Promise<{ title: string; content: string }> {
  const infoUrl = `${baseUrl}/open-apis/docx/v1/documents/${documentId}`;
  const rawUrl = `${baseUrl}/open-apis/docx/v1/documents/${documentId}/raw_content`;
  const headers = { Authorization: `Bearer ${userAccessToken}`, Accept: "application/json" };

  const [infoR, rawR] = await Promise.all([
    fetchJson(infoUrl, { headers }, { shouldRetry: ({ status, error }) => (error || (status && (status === 429 || status >= 500)) ? "retry" : "no_retry") }),
    fetchJson(rawUrl, { headers }, { shouldRetry: ({ status, error }) => (error || (status && (status === 429 || status >= 500)) ? "retry" : "no_retry") })
  ]);

  const infoJson = (infoR.json ?? {}) as FeishuDocInfoResp;
  const rawJson = (rawR.json ?? {}) as FeishuRawContentResp;

  if (rawR.status === 403 || rawJson.code === 403100 || rawJson.code === 403001) {
    throw Object.assign(new Error("access_denied"), { reason: "access_denied" });
  }
  if (rawR.status === 401 || rawJson.code === 99991663 || rawJson.code === 99991664) {
    throw Object.assign(new Error("token_expired"), { reason: "token_expired" });
  }
  if (!rawR.ok || rawJson.code !== 0) {
    throw Object.assign(new Error("fetch_failed"), { reason: "fetch_failed" });
  }

  const title =
    infoJson.data?.document?.title ??
    infoJson.data?.document?.document_id ??
    documentId;
  const content = rawJson.data?.content ?? "";
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
  // Derive title_path: first heading or just title
  const headingLine = lines.find((l) => l.startsWith("#"));
  const topTitle = headingLine ? headingLine.replace(/^#+\s*/, "") : title;
  return {
    normalized_doc_id: makeId("ndoc"),
    doc_id: doc.doc_id,
    session_id: doc.session_id,
    platform: "feishu",
    title: topTitle,
    title_path: [topTitle],
    blocks: lines,
    content_text: lines.join("\n"),
    created_at: new Date().toISOString()
  };
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

export class FeishuAdapter {
  async fetchDocument(doc: DocumentRef, userAccessToken: string): Promise<NormalizedDocument> {
    if (feishuConfigured()) {
      const parsed = parseFeishuUrl(doc.url);
      if (!parsed) {
        throw Object.assign(new Error("fetch_failed"), {
          reason: "fetch_failed",
          detail: `Unsupported Feishu URL format: ${doc.url}`
        });
      }
      const { title, content } = await fetchDocxRawContent(
        parsed.id,
        userAccessToken,
        config.feishu.baseUrl
      );
      return buildNormalizedDoc(doc, title, content);
    }

    // Mock path (no FEISHU_APP_ID in env)
    if (!userAccessToken.startsWith("feishu_at_")) {
      throw Object.assign(new Error("access_denied"), { reason: "access_denied" });
    }
    const content = `# Feishu Document\nURL: ${doc.url}\n- Item 1\n- Item 2`;
    return buildNormalizedDoc(doc, "Feishu Imported Doc", content);
  }
}
