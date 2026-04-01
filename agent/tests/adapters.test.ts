import { describe, expect, it } from "vitest";
import { FeishuAdapter } from "../src/platform_adapters/feishuAdapter.js";
import { YuqueAdapter } from "../src/platform_adapters/yuqueAdapter.js";
import type { DocumentRef } from "../src/types.js";

const baseDoc: DocumentRef = {
  doc_id: "doc_1",
  session_id: "sess_1",
  platform: "feishu",
  url: "https://example.com/d",
  status: "pending",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

describe("platform adapters (fetch only)", () => {
  it("FeishuAdapter.fetchDocument throws access_denied for invalid token shape", () => {
    const adapter = new FeishuAdapter();
    expect(() => adapter.fetchDocument(baseDoc, "not_feishu_token")).toThrow(
      "access_denied"
    );
  });

  it("YuqueAdapter.fetchDocument throws access_denied for empty token", () => {
    const adapter = new YuqueAdapter();
    const yuqueDoc = { ...baseDoc, platform: "yuque" as const };
    expect(() => adapter.fetchDocument(yuqueDoc, "")).toThrow("access_denied");
  });
});
