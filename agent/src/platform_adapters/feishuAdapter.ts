import type { DocumentRef, NormalizedDocument } from "../types.js";
import { makeId } from "../utils/id.js";

export class FeishuAdapter {
  getAuthUrl(sessionId: string): string {
    return `https://open.feishu.cn/open-apis/authen/v1/index?state=${encodeURIComponent(sessionId)}`;
  }

  handleCallback(code: string): { user_access_token: string; refresh_token: string; expire_at: string } {
    return {
      user_access_token: `feishu_at_${code}_${Date.now()}`,
      refresh_token: `feishu_rt_${code}_${Date.now()}`,
      expire_at: new Date(Date.now() + 1000 * 60 * 60).toISOString()
    };
  }

  refreshToken(refreshToken: string): { user_access_token: string; expire_at: string } {
    return {
      user_access_token: `feishu_at_refresh_${refreshToken.slice(0, 8)}_${Date.now()}`,
      expire_at: new Date(Date.now() + 1000 * 60 * 60).toISOString()
    };
  }

  fetchDocument(doc: DocumentRef, token: string): NormalizedDocument {
    if (!token.startsWith("feishu_at_")) throw new Error("access_denied");
    const content = `# Feishu Document\nURL: ${doc.url}\nTokenPrefix:${token.slice(0, 10)}\n- Item 1\n- Item 2`;
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
