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
    await request(app).post("/api/doc/import").send({
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
    await request(app).post("/api/doc/import").send({
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
});
