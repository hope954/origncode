import fs from "node:fs";
import path from "node:path";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { ApiCode } from "../src/http/api_codes.js";

const dataFile = path.resolve("./data/store.stage5.realchain.test.json");

function makeFetchMock() {
  return vi.fn(async (url: string, init?: RequestInit) => {
    // Feishu app access token
    if (url.includes("/open-apis/auth/v3/app_access_token/internal")) {
      return new Response(JSON.stringify({ code: 0, app_access_token: "aat_ok" }), { status: 200 });
    }
    // Feishu OIDC code exchange
    if (url.includes("/open-apis/authen/v1/oidc/access_token")) {
      return new Response(
        JSON.stringify({
          code: 0,
          data: { access_token: "u_at", refresh_token: "u_rt", expires_in: 3600 }
        }),
        { status: 200 }
      );
    }
    // Feishu refresh
    if (url.includes("/open-apis/authen/v1/oidc/refresh_access_token")) {
      return new Response(
        JSON.stringify({
          code: 0,
          data: { access_token: "u_at_2", refresh_token: "u_rt_2", expires_in: 3600 }
        }),
        { status: 200 }
      );
    }
    // Feishu doc info
    if (url.includes("/open-apis/docx/v1/documents/") && !url.includes("/raw_content")) {
      return new Response(JSON.stringify({ code: 0, data: { document: { title: "飞书周报" } } }), { status: 200 });
    }
    // Feishu raw content
    if (url.includes("/open-apis/docx/v1/documents/") && url.includes("/raw_content")) {
      return new Response(
        JSON.stringify({
          code: 0,
          data: {
            content: "# 项目A\n负责梳理需求并推进接口重构，性能提升 30%。\n- 技术栈：Node.js"
          }
        }),
        { status: 200 }
      );
    }

    // Yuque live verify
    if (url.endsWith("/api/v2/user")) {
      const token = String((init?.headers as any)?.["X-Auth-Token"] ?? "");
      if (token.includes("bad")) return new Response("{}", { status: 401 });
      return new Response("{}", { status: 200 });
    }
    // Yuque doc fetch
    if (url.includes("/api/v2/repos/")) {
      const token = String((init?.headers as any)?.["X-Auth-Token"] ?? "");
      if (token.includes("bad")) {
        return new Response(JSON.stringify({ message: "unauthorized" }), { status: 401 });
      }
      return new Response(
        JSON.stringify({
          data: {
            title: "语雀纪要",
            body: "# 语雀纪要\n推进了接口重构，协同落地方案。"
          }
        }),
        { status: 200 }
      );
    }

    return new Response("{}", { status: 500 });
  });
}

describe("stage5 round1 package3 - minimal verifiable real chains (HTTP mocked)", () => {
  beforeEach(() => {
    process.env.DATA_FILE = dataFile;
    if (fs.existsSync(dataFile)) fs.unlinkSync(dataFile);

    process.env.FEISHU_APP_ID = "app";
    process.env.FEISHU_APP_SECRET = "sec";
    process.env.FEISHU_REDIRECT_URI = "https://example.com/cb";
    process.env.FEISHU_BASE_URL = "https://open.feishu.cn";

    process.env.YUQUE_BASE_URL = "https://www.yuque.com";
    process.env.YUQUE_LIVE_VERIFY = "1";
    process.env.YUQUE_LIVE_FETCH = "1";
  });

  it("Feishu callback real-mode + refresh real-mode are verifiable via existing APIs", async () => {
    const fetchMock = makeFetchMock();
    vi.stubGlobal("fetch", fetchMock as any);

    const app = createApp();
    const session = await request(app).post("/api/session/create").send({
      user_id: "u1",
      target_job: "engineering",
      styles: ["technical"],
      desired_highlight_count: 3
    });
    expect(session.body.code).toBe(ApiCode.OK);
    const sessionId = session.body.data.session_id;

    const cb = await request(app).post("/api/auth/callback").send({
      user_id: "u1",
      session_id: sessionId,
      auth_code: "code_ok"
    });
    expect(cb.body.code).toBe(ApiCode.OK);
    expect(cb.body.data.auth_mode).toBe("real");

    const rf = await request(app).post("/api/auth/refresh").send({
      platform: "feishu",
      user_id: "u1",
      session_id: sessionId
    });
    expect(rf.body.code).toBe(ApiCode.OK);
    expect(rf.body.data.auth_mode).toBe("real");
  });

  it("Feishu refresh failure is verifiable (real path, numeric ApiCode, request_id + error_context intact)", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/open-apis/auth/v3/app_access_token/internal")) {
        return new Response(JSON.stringify({ code: 0, app_access_token: "aat_ok" }), { status: 200 });
      }
      if (url.includes("/open-apis/authen/v1/oidc/access_token")) {
        return new Response(
          JSON.stringify({
            code: 0,
            data: { access_token: "u_at", refresh_token: "u_rt", expires_in: 3600 }
          }),
          { status: 200 }
        );
      }
      if (url.includes("/open-apis/authen/v1/oidc/refresh_access_token")) {
        return new Response(JSON.stringify({ code: 400, msg: "invalid refresh token" }), { status: 400 });
      }
      return new Response("{}", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock as any);

    const app = createApp();
    const session = await request(app).post("/api/session/create").send({
      user_id: "u_rf_fail",
      target_job: "engineering",
      styles: ["technical"],
      desired_highlight_count: 3
    });
    const sessionId = session.body.data.session_id;

    await request(app).post("/api/auth/callback").send({
      user_id: "u_rf_fail",
      session_id: sessionId,
      auth_code: "code_ok"
    }).expect(200);

    const rf = await request(app).post("/api/auth/refresh").send({
      platform: "feishu",
      user_id: "u_rf_fail",
      session_id: sessionId
    });

    // real path proof: refresh endpoint was called
    const calledUrls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(calledUrls.some((u) => u.includes("/open-apis/authen/v1/oidc/refresh_access_token"))).toBe(true);

    // numeric ApiCode contract + stable observability signals
    expect(rf.status).toBe(400);
    expect(rf.headers["x-request-id"]).toBeTruthy();
    expect(rf.body.request_id).toBeTruthy();
    expect(rf.headers["x-request-id"]).toBe(rf.body.request_id);

    expect(rf.body.code).toBe(ApiCode.INVALID_PARAMS);
    expect(rf.body.message).toBe("token_invalid");
    expect(rf.body.data?.error_context).toBeTruthy();
    expect(rf.body.data.error_context.stage).toBe("auth_refresh");
    expect(rf.body.data.error_context.platform).toBe("feishu");
    expect(rf.body.data.error_context.reason).toBe("token_invalid");
    expect(rf.body.data.error_context.request_id).toBe(rf.body.request_id);
  });

  it("Yuque live verify is verifiable and returns mode", async () => {
    const fetchMock = makeFetchMock();
    vi.stubGlobal("fetch", fetchMock as any);

    const app = createApp();
    const ok = await request(app).post("/api/auth/yuque/token/verify").send({ token: "yq_valid_token_123456" });
    expect(ok.body.code).toBe(ApiCode.OK);
    expect(ok.body.data.valid).toBe(true);
    expect(ok.body.data.verify_mode).toBe("live");

    const bad = await request(app).post("/api/auth/yuque/token/verify").send({ token: "yq_bad_token_123456" });
    expect(bad.body.code).toBe(ApiCode.OK);
    expect(bad.body.data.valid).toBe(false);
  });

  it("real docs can drive existing pipeline end-to-end without changing it (NormalizedDocument→Chunk→Fact→Experience→Highlight)", async () => {
    const fetchMock = makeFetchMock();
    vi.stubGlobal("fetch", fetchMock as any);

    const app = createApp();
    const session = await request(app).post("/api/session/create").send({
      user_id: "u2",
      target_job: "engineering",
      styles: ["technical"],
      desired_highlight_count: 3
    });
    const sessionId = session.body.data.session_id;

    // Feishu auth (real-mode)
    await request(app).post("/api/auth/callback").send({ user_id: "u2", session_id: sessionId, auth_code: "code_ok" }).expect(200);

    // Yuque token save is still manual, but live verify is on
    await request(app).post("/api/auth/yuque/token/save").send({ user_id: "u2", session_id: sessionId, token: "yq_valid_token_123456" }).expect(200);

    // Import 2 docs: Feishu succeeds, Yuque fails with token_invalid (bad token) -> partial_success
    await request(app).post("/api/docs/import").send({
      session_id: sessionId,
      docs: [
        { platform: "feishu", url: "https://tenant.feishu.cn/docx/AbCdEf123" },
        { platform: "yuque", url: "https://www.yuque.com/alice/proj/meeting-notes" }
      ]
    }).expect(200);

    // Force Yuque token to be bad by overwriting saved auth (minimal approach: delete + save bad)
    await request(app).post("/api/auth/yuque/token/delete").send({ user_id: "u2", session_id: sessionId }).expect(200);
    // Structural check passes, live verify will fail (401)
    await request(app).post("/api/auth/yuque/token/save").send({ user_id: "u2", session_id: sessionId, token: "yq_bad_token_123456" }).expect(400);

    const start = await request(app).post("/api/analysis/start").send({ session_id: sessionId, user_id: "u2" }).expect(200);
    expect(start.headers["x-request-id"]).toBeTruthy();
    expect(start.body.request_id).toBeTruthy();

    const ingest = await request(app).get(`/api/analysis/task?task_id=${start.body.data.task_id}`).expect(200);
    expect(["completed", "partial_success", "failed"]).toContain(ingest.body.data.status);

    // Resume analyze should succeed (at least Feishu parsed)
    const analyze = await request(app).post("/api/resume/analyze").send({ session_id: sessionId }).expect(200);
    expect(analyze.body.code).toBe(ApiCode.OK);

    const result = await request(app).get(`/api/resume/result?session_id=${sessionId}`).expect(200);
    expect(["completed", "partial_success"]).toContain(result.body.data.status);
    expect(result.body.data.highlights.length).toBeGreaterThan(0);

    // Verify real-path fetch was used (called platform endpoints)
    const calledUrls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(calledUrls.some((u) => u.includes("/open-apis/docx/v1/documents/") && u.includes("/raw_content"))).toBe(true);
  });

  it("Yuque real fetch success is verifiable and can drive existing pipeline (content observable)", async () => {
    const fetchMock = makeFetchMock();
    vi.stubGlobal("fetch", fetchMock as any);

    const app = createApp();
    const session = await request(app).post("/api/session/create").send({
      user_id: "u_yq",
      target_job: "engineering",
      styles: ["technical"],
      desired_highlight_count: 3
    });
    const sessionId = session.body.data.session_id;

    // Save Yuque token (manual) with live verify on
    await request(app).post("/api/auth/yuque/token/save").send({ user_id: "u_yq", session_id: sessionId, token: "yq_valid_token_123456" }).expect(200);

    await request(app).post("/api/docs/import").send({
      session_id: sessionId,
      docs: [{ platform: "yuque", url: "https://www.yuque.com/alice/proj/meeting-notes" }]
    }).expect(200);

    // Ingest: should fetch yuque doc via real endpoint (mocked)
    await request(app).post("/api/analysis/start").send({ session_id: sessionId, user_id: "u_yq" }).expect(200);

    const calledUrls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(calledUrls.some((u) => u.endsWith("/api/v2/user"))).toBe(true);
    expect(calledUrls.some((u) => u.includes("/api/v2/repos/"))).toBe(true);

    const snap = await request(app).get("/api/storage/snapshot").expect(200);
    const nds = snap.body.data.normalizedDocuments.filter((n: any) => n.session_id === sessionId && n.platform === "yuque");
    expect(nds.length).toBeGreaterThan(0);
    expect(String(nds[0].content_text)).toContain("接口重构");

    // Resume pipeline (existing)
    await request(app).post("/api/resume/analyze").send({ session_id: sessionId }).expect(200);
    const result = await request(app).get(`/api/resume/result?session_id=${sessionId}`).expect(200);
    expect(result.body.code).toBe(ApiCode.OK);
    expect(["completed", "partial_success"]).toContain(result.body.data.status);
    expect(result.body.data.highlights.length).toBeGreaterThan(0);
  });
});

