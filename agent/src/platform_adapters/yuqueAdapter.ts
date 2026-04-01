/**
 * Yuque platform adapter — document fetch + NormalizedDocument mapping only.
 *
 * Token verify / save / delete belongs to `auth_service` (MVP: manual token).
 * This adapter receives a decrypted access token only after auth_service has persisted it.
 *
 * MOCK: `fetchDocument` does not call Yuque APIs. Replace with real HTTP calls
 * (see README “真实平台接入待替换点”).
 */
import type { DocumentRef, NormalizedDocument } from "../types.js";
import { makeId } from "../utils/id.js";

export class YuqueAdapter {
  fetchDocument(doc: DocumentRef, accessToken: string): NormalizedDocument {
    if (!accessToken || accessToken.length < 8) {
      throw new Error("access_denied");
    }
    const content = `# Yuque Document\nURL: ${doc.url}\n- 背景\n- 目标\n- 结果`;
    return {
      normalized_doc_id: makeId("ndoc"),
      doc_id: doc.doc_id,
      session_id: doc.session_id,
      platform: "yuque",
      title: "Yuque Imported Doc",
      title_path: ["Yuque Imported Doc"],
      blocks: content.split("\n"),
      content_text: content,
      created_at: new Date().toISOString()
    };
  }
}
