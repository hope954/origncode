/**
 * Feishu platform adapter — document fetch + NormalizedDocument mapping only.
 *
 * Auth (OAuth URL, auth_code exchange, refresh) lives in `auth_service`, not here.
 *
 * MOCK: `fetchDocument` does not call Feishu Open APIs. Replace with real HTTP calls
 * using the decrypted user_access_token (see README “真实平台接入待替换点”).
 */
import type { DocumentRef, NormalizedDocument } from "../types.js";
import { makeId } from "../utils/id.js";

export class FeishuAdapter {
  fetchDocument(doc: DocumentRef, userAccessToken: string): NormalizedDocument {
    if (!userAccessToken.startsWith("feishu_at_")) {
      throw new Error("access_denied");
    }
    const content = `# Feishu Document\nURL: ${doc.url}\n- Item 1\n- Item 2`;
    return {
      normalized_doc_id: makeId("ndoc"),
      doc_id: doc.doc_id,
      session_id: doc.session_id,
      platform: "feishu",
      title: "Feishu Imported Doc",
      title_path: ["Feishu Imported Doc"],
      blocks: content.split("\n"),
      content_text: content,
      created_at: new Date().toISOString()
    };
  }
}
