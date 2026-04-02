import fs from "node:fs";
import path from "node:path";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { ApiCode } from "../src/http/api_codes.js";

const dataFile = path.resolve("./data/store.stage5.regression.test.json");

function makeFetchMock() {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes("/open-apis/auth/v3/app_access_token/internal")) {
      return new Response(JSON.stringify({ code: 0, app_access_token: "aat_ok" }), { status: 200 });
    }
    if (url.includes("/open-apis/authen/v1/oidc/access_token")) {
      return new Response(
        JSON.stringify({ code: 0, data: { access_token: "u_at", refresh_token: "u_rt", expires_in: 3600 } }),
        { status: 200 }
      );
    }
    if (url.includes("/open-apis/authen/v1/oidc/refresh_access_token")) {
      return new Response(
        JSON.stringify({ code: 0, data: { access_token: "u_at_2", refresh_token: "u_rt_2", expires_in: 3600 } }),
        { status: 200 }
      );
    }
    if (url.includes("/open-apis/docx/v1/documents/") && !url.includes("/raw_content")) {
      return new Response(JSON.stringify({ code: 0, data: { document: { title: "飞书文档" } } }), { status: 200 });
    }
    if (url.includes("/open-apis/docx/v1/documents/") && url.includes("/raw_content")) {
      return new Response(
        JSON.stringify({ code: 0, data: { content: "# 飞书文档\n推进接口优化，提升 30%。" } }),
        { status: 200 }
      );
    }
    if (url.endsWith("/api/v2/user")) {
      const token = String((init?.headers as any)?.["X-Auth-Token"] ?? "");
      if (token.includes("bad")) return new Response("{}", { status: 401 });
      return new Response("{}", { status: 200 });
    }
    if (url.includes("/api/v2/repos/")) {
      return new Response(JSON.stringify({ data: { title: "语雀文档", body: "# 语雀文档\n协同落地方案。" } }), {
        status: 200
      });
    }
    return new Response("{}", { status: 500 });
  });
}

describe("stage5 round1 full regression contracts", () => {
  beforeEach(() => {
    process.env.DATA_FILE = dataFile;
    if (fs.existsSync(dataFile)) fs.unlinkSync(dataFile);
    delete process.env.FEISHU_APP_ID;
    delete process.env.FEISHU_APP_SECRET;
    delete process.env.YUQUE_LIVE_VERIFY;
    delete process.env.YUQUE_LIVE_FETCH;
    vi.unstubAllGlobals();
  });

  it("fallback gates remain valid without real env vars", async () => {
    const app = createApp();

    const s = await request(app).post("/api/session/create").send({
      user_id: "u_fb",
      target_job: "engineering",
      styles: ["technical"],
      desired_highlight_count: 3
    });
    const sessionId = s.body.data.session_id;

    const cb = await request(app).post("/api/auth/callback").send({
      user_id: "u_fb",
      session_id: sessionId,
      auth_code: "code_fb"
    });
    expect(cb.body.code).toBe(ApiCode.OK);
    expect(cb.body.data.auth_mode).toBe("fallback");
  });

  it("frontend-doc promised fields are stable: auth status + verify_mode + request_id", async () => {
    process.env.YUQUE_LIVE_VERIFY = "1";
    vi.stubGlobal("fetch", makeFetchMock() as any);
    const app = createApp();

    const status = await request(app).get("/api/auth/status?user_id=u_doc").expect(200);
    expect(status.body.code).toBe(ApiCode.OK);
    expect(status.body.request_id).toBeTruthy();
    expect(status.body.data.feishu).toBeTruthy();
    expect(status.body.data.yuque).toBeTruthy();
    expect(status.body.data.feishu.auth_status).toBeTruthy();
    expect(status.body.data.yuque.auth_status).toBeTruthy();

    const verify = await request(app)
      .post("/api/auth/yuque/token/verify")
      .set("x-request-id", "req_doc_verify_001")
      .send({ token: "yq_valid_token_123456" })
      .expect(200);
    expect(verify.headers["x-request-id"]).toBe("req_doc_verify_001");
    expect(verify.body.request_id).toBe("req_doc_verify_001");
    expect(verify.body.data.verify_mode).toBe("live");
    expect(typeof verify.body.data.valid).toBe("boolean");
  });

  it("manual-validation path contract holds: failures[] and warnings[] remain available", async () => {
    process.env.FEISHU_APP_ID = "app";
    process.env.FEISHU_APP_SECRET = "sec";
    process.env.FEISHU_REDIRECT_URI = "https://example.com/cb";
    process.env.YUQUE_LIVE_VERIFY = "1";
    process.env.YUQUE_LIVE_FETCH = "1";
    vi.stubGlobal("fetch", makeFetchMock() as any);

    const app = createApp();
    const session = await request(app).post("/api/session/create").send({
      user_id: "u_chain",
      target_job: "engineering",
      styles: ["technical"],
      desired_highlight_count: 3
    });
    const sessionId = session.body.data.session_id;

    await request(app).post("/api/auth/callback").send({
      user_id: "u_chain",
      session_id: sessionId,
      auth_code: "code_ok"
    }).expect(200);

    // only feishu doc to ensure completed path still valid
    await request(app).post("/api/docs/import").send({
      session_id: sessionId,
      docs: [{ platform: "feishu", url: "https://tenant.feishu.cn/docx/AbCdEf123" }]
    }).expect(200);

    await request(app).post("/api/analysis/start").send({ session_id: sessionId, user_id: "u_chain" }).expect(200);
    const ar = await request(app).get(`/api/analysis/result?session_id=${sessionId}`).expect(200);
    expect(["completed", "partial_success", "failed"]).toContain(ar.body.data.session_status);
    expect(Array.isArray(ar.body.data.failures)).toBe(true);

    await request(app).post("/api/resume/analyze").send({ session_id: sessionId }).expect(200);
    const rr = await request(app).get(`/api/resume/result?session_id=${sessionId}`).expect(200);
    expect(["completed", "partial_success", "failed"]).toContain(rr.body.data.status);
    expect(Array.isArray(rr.body.data.warnings)).toBe(true);
    expect(Array.isArray(rr.body.data.highlights)).toBe(true);
  });
});

