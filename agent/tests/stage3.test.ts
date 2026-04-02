import fs from "node:fs";
import path from "node:path";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { ApiCode } from "../src/http/api_codes.js";

const dataFile = path.resolve("./data/store.stage3.json");

async function seedAnalyzedSession(app: ReturnType<typeof createApp>) {
  const session = await request(app).post("/api/session/create").send({
    user_id: "u_s3",
    target_job: "engineering",
    styles: ["technical"],
    desired_highlight_count: 3
  });
  const sessionId = session.body.data.session_id;
  await request(app).post("/api/auth/callback").send({
    user_id: "u_s3",
    session_id: sessionId,
    auth_code: "auth_s3"
  });
  const imp = await request(app).post("/api/docs/import").send({
    session_id: sessionId,
    docs: [{ platform: "feishu", url: "https://feishu.cn/doc/s3" }]
  });
  const docId = imp.body.data[0].doc_id;
  await request(app).post("/api/analysis/start").send({ session_id: sessionId, user_id: "u_s3" }).expect(200);
  await request(app)
    .post("/api/resume/analyze")
    .send({ session_id: sessionId, doc_ids: [docId] })
    .expect(200);
  const result = await request(app).get(`/api/resume/result?session_id=${sessionId}`).expect(200);
  const hlId = result.body.data.highlights[0].highlight_id;
  return { sessionId, hlId };
}

describe("stage3 highlight save / delete / session clear", () => {
  beforeEach(() => {
    process.env.DATA_FILE = dataFile;
    if (fs.existsSync(dataFile)) fs.unlinkSync(dataFile);
  });

  it("POST /api/resume/highlight/save stores edited final_content and keeps original_content", async () => {
    const app = createApp();
    const { sessionId, hlId } = await seedAnalyzedSession(app);

    const edited = "在工程侧主导核心模块交付，与抽取证据一致的用户表述。";
    const save = await request(app).post("/api/resume/highlight/save").send({
      highlight_id: hlId,
      final_content: edited
    });
    expect(save.status).toBe(200);
    expect(save.body.code).toBe(ApiCode.OK);
    expect(save.body.data.final_content).toBe(edited);
    expect(save.body.data.is_edited).toBe(true);
    expect(save.body.data.original_content).toBeTruthy();
    expect(save.body.data.original_content).not.toBe(edited);

    const result = await request(app).get(`/api/resume/result?session_id=${sessionId}`).expect(200);
    const row = result.body.data.highlights.find((h: { highlight_id: string }) => h.highlight_id === hlId);
    expect(row.content).toBe(edited);
  });

  it("after save, GET /api/resume/evidence still resolves facts and chunks", async () => {
    const app = createApp();
    const { hlId } = await seedAnalyzedSession(app);
    await request(app)
      .post("/api/resume/highlight/save")
      .send({ highlight_id: hlId, final_content: "编辑后仍可追溯证据链路的表述。" })
      .expect(200);

    const ev = await request(app).get(`/api/resume/evidence?highlight_id=${hlId}`).expect(200);
    expect(ev.body.code).toBe(ApiCode.OK);
    expect(ev.body.data.facts.length).toBeGreaterThan(0);
    expect(ev.body.data.source_chunks.length).toBeGreaterThan(0);
  });

  it("POST /api/resume/highlight/delete removes highlight from result list (soft delete)", async () => {
    const app = createApp();
    const { sessionId, hlId } = await seedAnalyzedSession(app);
    const del = await request(app).post("/api/resume/highlight/delete").send({ highlight_id: hlId });
    expect(del.status).toBe(200);
    expect(del.body.code).toBe(ApiCode.OK);
    expect(del.body.data.status).toBe("deleted");

    const result = await request(app).get(`/api/resume/result?session_id=${sessionId}`).expect(200);
    expect(result.body.data.highlights.some((h: { highlight_id: string }) => h.highlight_id === hlId)).toBe(false);

    const ev = await request(app).get(`/api/resume/evidence?highlight_id=${hlId}`).expect(404);
    expect(ev.body.code).toBe(ApiCode.NOT_FOUND);
  });

  it("DELETE idempotent: second delete returns 200 with idempotent flag", async () => {
    const app = createApp();
    const { hlId } = await seedAnalyzedSession(app);
    await request(app).post("/api/resume/highlight/delete").send({ highlight_id: hlId }).expect(200);
    const again = await request(app).post("/api/resume/highlight/delete").send({ highlight_id: hlId });
    expect(again.status).toBe(200);
    expect(again.body.data.idempotent).toBe(true);
  });

  it("POST /api/session/clear removes session data; result and evidence behave as expected", async () => {
    const app = createApp();
    const { sessionId, hlId } = await seedAnalyzedSession(app);

    const clear = await request(app).post("/api/session/clear").send({ session_id: sessionId, user_id: "u_s3" });
    expect(clear.status).toBe(200);
    expect(clear.body.code).toBe(ApiCode.OK);

    const result = await request(app).get(`/api/resume/result?session_id=${sessionId}`).expect(200);
    expect(result.body.data.highlights.length).toBe(0);
    expect(result.body.data.status).toBe("failed");

    const ev = await request(app).get(`/api/resume/evidence?highlight_id=${hlId}`).expect(404);

    const snap = await request(app).get("/api/storage/snapshot").expect(200);
    expect(snap.body.data.sessions.some((s: { session_id: string }) => s.session_id === sessionId)).toBe(false);
    expect(snap.body.data.highlights.some((h: { highlight_id: string }) => h.highlight_id === hlId)).toBe(false);
  });

  it("session/clear with wrong user_id returns 403", async () => {
    const app = createApp();
    const { sessionId } = await seedAnalyzedSession(app);
    const r = await request(app).post("/api/session/clear").send({ session_id: sessionId, user_id: "other" });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe(ApiCode.ACCESS_DENIED);
  });

  it("session/clear removes session-scoped PlatformAuth but keeps user-wide Yuque token rows", async () => {
    const app = createApp();
    const session = await request(app).post("/api/session/create").send({
      user_id: "u_wide",
      target_job: "engineering",
      styles: ["technical"],
      desired_highlight_count: 3
    });
    const sessionId = session.body.data.session_id;
    await request(app)
      .post("/api/auth/yuque/token/save")
      .send({ user_id: "u_wide", token: "yq_1234567890123456" })
      .expect(200);
    await request(app).post("/api/session/clear").send({ session_id: sessionId, user_id: "u_wide" }).expect(200);

    const snap = await request(app).get("/api/storage/snapshot").expect(200);
    const yuqueWide = snap.body.data.platformAuths.filter(
      (a: { platform: string; user_id: string; session_id?: string }) =>
        a.platform === "yuque" && a.user_id === "u_wide"
    );
    expect(yuqueWide.length).toBeGreaterThan(0);
    expect(yuqueWide.every((a: { session_id?: string }) => a.session_id == null)).toBe(true);
  });
});
