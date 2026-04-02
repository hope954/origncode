/**
 * Adapter smoke tests — no FEISHU_APP_ID / YUQUE_LIVE_FETCH set,
 * so both adapters run their CI/dev fallback paths.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { FeishuAdapter } from "../src/platform_adapters/feishuAdapter.js";
import { YuqueAdapter } from "../src/platform_adapters/yuqueAdapter.js";
import { parseYuqueUrl } from "../src/platform_adapters/yuqueAdapter.js";
import type { DocumentRef } from "../src/types.js";

const feishuDoc: DocumentRef = {
  doc_id: "doc_1",
  session_id: "sess_1",
  platform: "feishu",
  url: "https://example.feishu.cn/docx/TestDocId123",
  status: "pending",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

const yuqueDoc: DocumentRef = {
  doc_id: "doc_2",
  session_id: "sess_1",
  platform: "yuque",
  url: "https://www.yuque.com/user/repo/doc-slug",
  status: "pending",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

describe("FeishuAdapter (fallback path, no FEISHU_APP_ID)", () => {
  it("throws access_denied for invalid token shape", async () => {
    const adapter = new FeishuAdapter();
    await expect(adapter.fetchDocument(feishuDoc, "not_feishu_token")).rejects.toThrow("access_denied");
  });

  it("returns NormalizedDocument with fallback content", async () => {
    const adapter = new FeishuAdapter();
    const nd = await adapter.fetchDocument(feishuDoc, "feishu_at_test_123");
    expect(nd.platform).toBe("feishu");
    expect(nd.content_text).toBeTruthy();
    expect(nd.blocks.length).toBeGreaterThan(0);
  });
});

describe("YuqueAdapter (fallback path, YUQUE_LIVE_FETCH not set)", () => {
  it("throws access_denied for empty token", async () => {
    const adapter = new YuqueAdapter();
    await expect(adapter.fetchDocument(yuqueDoc, "")).rejects.toThrow("access_denied");
  });

  it("returns NormalizedDocument with fallback content (CI mode)", async () => {
    const adapter = new YuqueAdapter();
    const nd = await adapter.fetchDocument(yuqueDoc, "yq_validtoken1234567890");
    expect(nd.platform).toBe("yuque");
    expect(nd.content_text).toBeTruthy();
  });

  it("parseYuqueUrl extracts namespace/book/slug from valid URL", () => {
    const r = parseYuqueUrl("https://www.yuque.com/alice/proj/doc-123");
    expect(r).toEqual({ namespace: "alice", book: "proj", slug: "doc-123" });
  });

  it("parseYuqueUrl returns null for 2-segment URL (no slug)", () => {
    expect(parseYuqueUrl("https://www.yuque.com/alice/proj")).toBeNull();
  });

  it("YUQUE_LIVE_FETCH=1 path throws fetch_failed when URL has only 2 segments", async () => {
    process.env.YUQUE_LIVE_FETCH = "1";
    vi.stubGlobal("fetch", vi.fn());
    try {
      const adapter = new YuqueAdapter();
      const badDoc = { ...yuqueDoc, url: "https://www.yuque.com/short" };
      await expect(adapter.fetchDocument(badDoc, "yq_validtoken1234567890")).rejects.toMatchObject({
        reason: "fetch_failed"
      });
    } finally {
      delete process.env.YUQUE_LIVE_FETCH;
      vi.restoreAllMocks();
    }
  });
});
