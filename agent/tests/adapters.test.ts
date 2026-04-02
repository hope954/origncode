import { describe, expect, it } from "vitest";
import { FeishuAdapter } from "../src/platform_adapters/feishuAdapter.js";
import { YuqueAdapter } from "../src/platform_adapters/yuqueAdapter.js";
import type { DocumentRef } from "../src/types.js";

const baseDoc: DocumentRef = {
  doc_id: "doc_1",
  session_id: "sess_1",
  platform: "feishu",
  url: "https://example.feishu.cn/docx/TestDocId123",
  status: "pending",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

describe("platform adapters (mock-mode, no FEISHU_APP_ID configured)", () => {
  it("FeishuAdapter.fetchDocument throws access_denied for invalid token shape", async () => {
    const adapter = new FeishuAdapter();
    await expect(adapter.fetchDocument(baseDoc, "not_feishu_token")).rejects.toThrow("access_denied");
  });

  it("FeishuAdapter.fetchDocument returns NormalizedDocument in mock mode", async () => {
    const adapter = new FeishuAdapter();
    const nd = await adapter.fetchDocument(baseDoc, "feishu_at_test_123");
    expect(nd.platform).toBe("feishu");
    expect(nd.content_text).toBeTruthy();
    expect(nd.blocks.length).toBeGreaterThan(0);
  });

  it("YuqueAdapter.fetchDocument throws access_denied for empty token", async () => {
    const adapter = new YuqueAdapter();
    const yuqueDoc = { ...baseDoc, platform: "yuque" as const };
    await expect(adapter.fetchDocument(yuqueDoc, "")).rejects.toThrow("access_denied");
  });

  it("YuqueAdapter.fetchDocument returns NormalizedDocument in mock mode", async () => {
    const adapter = new YuqueAdapter();
    const yuqueDoc = { ...baseDoc, platform: "yuque" as const, url: "https://www.yuque.com/u/repo/doc" };
    const nd = await adapter.fetchDocument(yuqueDoc, "yq_validtoken1234567890");
    expect(nd.platform).toBe("yuque");
    expect(nd.content_text).toBeTruthy();
  });
});
