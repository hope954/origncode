import fs from "node:fs";
import path from "node:path";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

const dataFile = path.resolve("./data/store.test.json");

describe("stage1 core flows", () => {
  beforeEach(() => {
    process.env.DATA_FILE = dataFile;
    if (fs.existsSync(dataFile)) fs.unlinkSync(dataFile);
  });

  it("uses POST /api/docs/import (not /api/doc/import)", async () => {
    const app = createApp();
    const session = await request(app).post("/api/session/create").send({
      user_id: "u_path",
      target_job: "engineering",
      styles: ["technical"],
      desired_highlight_count: 3
    });
    const sessionId = session.body.data.session_id;
    await request(app).post("/api/auth/callback").send({
      user_id: "u_path",
      session_id: sessionId,
      auth_code: "auth_xxx"
    });
    const bad = await request(app).post("/api/doc/import").send({
      session_id: sessionId,
      docs: [{ platform: "feishu", url: "https://feishu.cn/doc/1" }]
    });
    expect(bad.status).not.toBe(200);
    const good = await request(app).post("/api/docs/import").send({
      session_id: sessionId,
      docs: [{ platform: "feishu", url: "https://feishu.cn/doc/1" }]
    });
    expect(good.status).toBe(200);
  });

  it("validates Feishu OAuth minimal flow", async () => {
    const app = createApp();
    const session = await request(app).post("/api/session/create").send({
      user_id: "u1",
      target_job: "engineering",
      styles: ["technical"],
      desired_highlight_count: 3
    });
    const sessionId = session.body.data.session_id;
    await request(app).post("/api/auth/callback").send({
      user_id: "u1",
      session_id: sessionId,
      auth_code: "auth_xxx"
    }).expect(200);
    await request(app).post("/api/docs/import").send({
      session_id: sessionId,
      docs: [{ platform: "feishu", url: "https://feishu.cn/doc/1" }]
    }).expect(200);
    const start = await request(app).post("/api/analysis/start").send({ session_id: sessionId, user_id: "u1" }).expect(200);
    const task = await request(app).get(`/api/analysis/task?task_id=${start.body.data.task_id}`).expect(200);
    expect(["completed", "partial_success"]).toContain(task.body.data.status);
  });

  it("validates Yuque manual token flow", async () => {
    const app = createApp();
    const session = await request(app).post("/api/session/create").send({
      user_id: "u2",
      target_job: "product",
      styles: ["business"],
      desired_highlight_count: 3
    });
    const sessionId = session.body.data.session_id;
    await request(app).post("/api/auth/yuque/token/save").send({
      user_id: "u2",
      session_id: sessionId,
      token: "yq_valid_token_123456"
    }).expect(200);
    await request(app).post("/api/docs/import").send({
      session_id: sessionId,
      docs: [{ platform: "yuque", url: "https://yuque.com/doc/1" }]
    }).expect(200);
    const start = await request(app).post("/api/analysis/start").send({ session_id: sessionId, user_id: "u2" }).expect(200);
    const result = await request(app).get(`/api/analysis/result?session_id=${sessionId}`).expect(200);
    expect(["completed", "partial_success"]).toContain(result.body.data.session_status);
    const snapshot = await request(app).get("/api/storage/snapshot").expect(200);
    const auth = snapshot.body.data.platformAuths[0];
    expect(auth.access_token_encrypted).toBeTruthy();
    expect(auth.access_token_encrypted).not.toContain("yq_valid_token_123456");
  });

  it("returns auth_required when no platform token for document", async () => {
    const app = createApp();
    const session = await request(app).post("/api/session/create").send({
      user_id: "u_noauth",
      target_job: "engineering",
      styles: ["technical"],
      desired_highlight_count: 3
    });
    const sessionId = session.body.data.session_id;
    await request(app).post("/api/docs/import").send({
      session_id: sessionId,
      docs: [{ platform: "feishu", url: "https://feishu.cn/doc/1" }]
    }).expect(200);
    await request(app).post("/api/analysis/start").send({ session_id: sessionId, user_id: "u_noauth" }).expect(200);
    const result = await request(app).get(`/api/analysis/result?session_id=${sessionId}`).expect(200);
    expect(result.body.data.session_status).toBe("failed");
    expect(result.body.data.failures[0].code).toBe("auth_required");
  });

  it("returns token_invalid for bad Yuque token save", async () => {
    const app = createApp();
    const res = await request(app).post("/api/auth/yuque/token/save").send({
      user_id: "u_bad",
      token: "short"
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("token_invalid");
  });

  it("POST /api/auth/refresh rejects unsupported_platform for Yuque", async () => {
    const app = createApp();
    const res = await request(app).post("/api/auth/refresh").send({
      platform: "yuque",
      user_id: "u1"
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("unsupported_platform");
  });

  it("POST /api/auth/refresh refreshes Feishu when refresh token exists", async () => {
    const app = createApp();
    const session = await request(app).post("/api/session/create").send({
      user_id: "u_ref",
      target_job: "engineering",
      styles: ["technical"],
      desired_highlight_count: 3
    });
    const sessionId = session.body.data.session_id;
    await request(app).post("/api/auth/callback").send({
      user_id: "u_ref",
      session_id: sessionId,
      auth_code: "auth_xxx"
    });
    const res = await request(app).post("/api/auth/refresh").send({
      platform: "feishu",
      user_id: "u_ref",
      session_id: sessionId
    });
    expect(res.status).toBe(200);
    expect(res.body.data.platform).toBe("feishu");
  });

  it("returns token_invalid when Feishu refresh has no refresh material", async () => {
    const app = createApp();
    const res = await request(app).post("/api/auth/refresh").send({
      platform: "feishu",
      user_id: "u_norefresh"
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("token_invalid");
  });
});
