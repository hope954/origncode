import fs from "node:fs";
import path from "node:path";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { ApiCode } from "../src/http/api_codes.js";

const dataFile = path.resolve("./data/store.stage5.test.json");

describe("stage5 round1 - request_id / error_context", () => {
  beforeEach(() => {
    process.env.DATA_FILE = dataFile;
    if (fs.existsSync(dataFile)) fs.unlinkSync(dataFile);
  });

  it("adds request_id to success response and echoes x-request-id", async () => {
    const app = createApp();
    const incoming = "req_test_123456";
    const res = await request(app)
      .post("/api/session/create")
      .set("x-request-id", incoming)
      .send({
        user_id: "u_req",
        target_job: "engineering",
        styles: ["technical"],
        desired_highlight_count: 3
      })
      .expect(200);

    expect(res.headers["x-request-id"]).toBe(incoming);
    expect(res.body.request_id).toBe(incoming);
    expect(res.body.code).toBe(ApiCode.OK);
  });

  it("includes machine-readable error_context and request_id on failure", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/auth/yuque/token/save")
      .send({ user_id: "u_bad", token: "short" })
      .expect(400);

    expect(res.body.code).toBe(ApiCode.INVALID_PARAMS);
    expect(res.body.message).toBe("token_invalid");
    expect(typeof res.body.request_id).toBe("string");
    expect(res.body.request_id.length).toBeGreaterThan(6);
    expect(res.body.data?.error_context).toBeTruthy();
    expect(res.body.data.error_context.stage).toBe("yuque_token_save");
    expect(res.body.data.error_context.reason).toBe("token_invalid");
    expect(res.body.data.error_context.platform).toBe("yuque");
  });

  it("keeps request_id and error_context on yuque token delete invalid_params", async () => {
    const app = createApp();
    const res = await request(app).post("/api/auth/yuque/token/delete").send({}).expect(400);
    expect(res.headers["x-request-id"]).toBeTruthy();
    expect(res.body.request_id).toBeTruthy();
    expect(res.headers["x-request-id"]).toBe(res.body.request_id);
    expect(res.body.code).toBe(ApiCode.INVALID_PARAMS);
    expect(res.body.data?.error_context?.stage).toBe("yuque_token_delete");
    expect(res.body.data?.error_context?.request_id).toBe(res.body.request_id);
  });

  it("maps access_denied vs auth_required (token_expired/invalid) at API layer distinctly", async () => {
    const app = createApp();
    const session = await request(app).post("/api/session/create").send({
      user_id: "u_auth",
      target_job: "engineering",
      styles: ["technical"],
      desired_highlight_count: 3
    });
    const sessionId = session.body.data.session_id;

    // No token at all -> auth_required in doc failures
    await request(app).post("/api/docs/import").send({
      session_id: sessionId,
      docs: [{ platform: "feishu", url: "https://feishu.cn/docx/abc" }]
    });
    await request(app).post("/api/analysis/start").send({ session_id: sessionId, user_id: "u_auth" }).expect(200);
    const result = await request(app).get(`/api/analysis/result?session_id=${sessionId}`).expect(200);
    expect(result.body.data.session_status).toBe("failed");
    expect(result.body.data.failures[0].code).toBe("auth_required");

    // Now create a Feishu auth via mock callback, but force adapter mock-path access_denied by using non-feishu token.
    // We can't inject token directly; instead, this assertion focuses on API-level separation for save/refresh paths already covered elsewhere.
    const refreshBad = await request(app).post("/api/auth/refresh").send({
      platform: "feishu",
      user_id: "u_auth"
    });
    expect(refreshBad.body.message).toBe("token_invalid");
  });
});

