import type { DocumentRef, NormalizedDocument } from "../types.js";
import { makeId } from "../utils/id.js";

export class YuqueAdapter {
  verifyAccessToken(token: string): boolean {
    return token.startsWith("yq_") && token.length >= 16;
  }

  saveAccessToken(token: string): string {
    if (!this.verifyAccessToken(token)) {
      throw new Error("token_invalid");
    }
    return token;
  }

  deleteAccessToken(): true {
    return true;
  }

  fetchDocument(doc: DocumentRef, token: string): NormalizedDocument {
    if (!this.verifyAccessToken(token)) throw new Error("access_denied");
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
