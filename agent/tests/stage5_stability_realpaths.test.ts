import { beforeEach, describe, expect, it, vi } from "vitest";
import { FeishuAdapter } from "../src/platform_adapters/feishuAdapter.js";
import { YuqueAdapter, parseYuqueUrl } from "../src/platform_adapters/yuqueAdapter.js";
import type { DocumentRef } from "../src/types.js";

function docRef(platform: "feishu" | "yuque", url: string): DocumentRef {
  return {
    doc_id: "doc_t",
    session_id: "sess_t",
    platform,
    url,
    status: "pending",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

describe("stage5 round1 - stability guards for real paths (HTTP mocked)", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    delete process.env.FEISHU_APP_ID;
    delete process.env.FEISHU_APP_SECRET;
    delete process.env.YUQUE_LIVE_FETCH;
  });

  it("real path gate: YuqueAdapter uses fallback unless YUQUE_LIVE_FETCH=1", async () => {
    const adapter = new YuqueAdapter();
    const out = await adapter.fetchDocument(docRef("yuque", "https://www.yuque.com/a/b/c"), "yq_valid_token_123456");
    expect(out.content_text).toContain("Yuque Document");
  });

  it("parseYuqueUrl requires 3 path segments", () => {
    expect(parseYuqueUrl("https://www.yuque.com/a/b/c")).toBeTruthy();
    expect(parseYuqueUrl("https://www.yuque.com/doc/1")).toBeNull();
  });

  it("Yuque real path: token_invalid vs access_denied vs fetch_failed vs empty_content are distinguished", async () => {
    process.env.YUQUE_LIVE_FETCH = "1";
    const adapter = new YuqueAdapter();
    const url = "https://www.yuque.com/ns/book/slug";

    // token_invalid (401)
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "unauthorized" }), { status: 401 })) as any);
    await expect(adapter.fetchDocument(docRef("yuque", url), "yq_valid_token_123456")).rejects.toMatchObject({ reason: "token_invalid" });

    // access_denied (403)
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "forbidden" }), { status: 403 })) as any);
    await expect(adapter.fetchDocument(docRef("yuque", url), "yq_valid_token_123456")).rejects.toMatchObject({ reason: "access_denied" });

    // fetch_failed (500)
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })) as any);
    await expect(adapter.fetchDocument(docRef("yuque", url), "yq_valid_token_123456")).rejects.toMatchObject({ reason: "fetch_failed" });

    // empty_content guard (200 but missing body)
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: { title: "t" } }), { status: 200 })) as any);
    await expect(adapter.fetchDocument(docRef("yuque", url), "yq_valid_token_123456")).rejects.toMatchObject({ reason: "fetch_failed" });
  });

  it("Feishu real path: token_expired vs access_denied vs empty_content are distinguished", async () => {
    process.env.FEISHU_APP_ID = "app";
    process.env.FEISHU_APP_SECRET = "sec";
    const adapter = new FeishuAdapter();
    const url = "https://tenant.feishu.cn/docx/DOCID";

    // token_expired (401)
    vi.stubGlobal(
      "fetch",
      vi.fn(async (u: string) => {
        if (u.includes("/raw_content")) return new Response(JSON.stringify({ code: 0, data: { content: "x" } }), { status: 200 });
        return new Response(JSON.stringify({ code: 0, data: { document: { title: "T" } } }), { status: 200 });
      }) as any
    );
    // overwrite raw_content to 401
    vi.stubGlobal(
      "fetch",
      vi.fn(async (u: string) => {
        if (u.includes("/raw_content")) return new Response(JSON.stringify({ code: 0 }), { status: 401 });
        return new Response(JSON.stringify({ code: 0, data: { document: { title: "T" } } }), { status: 200 });
      }) as any
    );
    await expect(adapter.fetchDocument(docRef("feishu", url), "feishu_at_real")).rejects.toMatchObject({ reason: "token_expired" });

    // access_denied (403)
    vi.stubGlobal(
      "fetch",
      vi.fn(async (u: string) => {
        if (u.includes("/raw_content")) return new Response(JSON.stringify({ code: 0 }), { status: 403 });
        return new Response(JSON.stringify({ code: 0, data: { document: { title: "T" } } }), { status: 200 });
      }) as any
    );
    await expect(adapter.fetchDocument(docRef("feishu", url), "feishu_at_real")).rejects.toMatchObject({ reason: "access_denied" });

    // empty_content (200 but content empty)
    vi.stubGlobal(
      "fetch",
      vi.fn(async (u: string) => {
        if (u.includes("/raw_content")) return new Response(JSON.stringify({ code: 0, data: { content: "" } }), { status: 200 });
        return new Response(JSON.stringify({ code: 0, data: { document: { title: "T" } } }), { status: 200 });
      }) as any
    );
    await expect(adapter.fetchDocument(docRef("feishu", url), "feishu_at_real")).rejects.toMatchObject({ reason: "fetch_failed" });
  });
});

