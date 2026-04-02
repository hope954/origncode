import fs from "node:fs";
import path from "node:path";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

const dataFile = path.resolve("./data/store.stage2.json");

async function seedFeishuSession(app: ReturnType<typeof createApp>) {
  const session = await request(app).post("/api/session/create").send({
    user_id: "u_stage2",
    target_job: "engineering",
    styles: ["technical"],
    desired_highlight_count: 3
  });
  const sessionId = session.body.data.session_id;
  await request(app).post("/api/auth/callback").send({
    user_id: "u_stage2",
    session_id: sessionId,
    auth_code: "auth_xxx"
  });
  const imp = await request(app).post("/api/docs/import").send({
    session_id: sessionId,
    docs: [{ platform: "feishu", url: "https://feishu.cn/doc/1" }]
  });
  const docId = imp.body.data[0].doc_id;
  await request(app).post("/api/analysis/start").send({ session_id: sessionId, user_id: "u_stage2" }).expect(200);
  return { sessionId, docId };
}

describe("stage2 resume pipeline", () => {
  beforeEach(() => {
    process.env.DATA_FILE = dataFile;
    if (fs.existsSync(dataFile)) fs.unlinkSync(dataFile);
  });

  it("POST /api/resume/analyze then result and evidence", async () => {
    const app = createApp();
    const { sessionId, docId } = await seedFeishuSession(app);

    const analyze = await request(app).post("/api/resume/analyze").send({
      session_id: sessionId,
      doc_ids: [docId],
      target_job: "engineering",
      styles: ["technical"],
      desired_highlight_count: 3
    });
    expect(analyze.status).toBe(200);
    expect(analyze.body.data.task_id).toBeTruthy();

    const result = await request(app).get(`/api/resume/result?session_id=${sessionId}`).expect(200);
    expect(result.body.data.highlights.length).toBeGreaterThan(0);
    const hl = result.body.data.highlights[0];
    expect(hl.content).toBeTruthy();
    expect(hl.highlight_id).toBeTruthy();

    const ev = await request(app).get(`/api/resume/evidence?highlight_id=${hl.highlight_id}`).expect(200);
    expect(ev.body.data.source_chunks.length).toBeGreaterThan(0);
    expect(ev.body.data.facts.length).toBeGreaterThan(0);
    expect(ev.body.data.source_docs.length).toBeGreaterThan(0);
  });

  it("uses /api/docs/import path before analyze (contract)", async () => {
    const app = createApp();
    const { sessionId, docId } = await seedFeishuSession(app);
    await request(app)
      .post("/api/resume/analyze")
      .send({ session_id: sessionId, doc_ids: [docId] })
      .expect(200);
  });

  it("POST /api/resume/rewrite updates content with explicit style", async () => {
    const app = createApp();
    const { sessionId, docId } = await seedFeishuSession(app);
    await request(app).post("/api/resume/analyze").send({ session_id: sessionId, doc_ids: [docId] });
    const result = await request(app).get(`/api/resume/result?session_id=${sessionId}`);
    const hlId = result.body.data.highlights[0].highlight_id;
    const before = result.body.data.highlights[0].content;
    const rw = await request(app).post("/api/resume/rewrite").send({
      highlight_id: hlId,
      style: "business",
      target_job: "product"
    });
    expect(rw.status).toBe(200);
    expect(rw.body.data.rewritten_content).toBeTruthy();
    expect(rw.body.data.rewritten_content).not.toBe(before);
  });

  it("returns 400 when resume analyze before docs parsed", async () => {
    const app = createApp();
    const session = await request(app).post("/api/session/create").send({
      user_id: "u_noparse",
      target_job: "engineering",
      styles: ["concise"],
      desired_highlight_count: 3
    });
    const sessionId = session.body.data.session_id;
    await request(app).post("/api/docs/import").send({
      session_id: sessionId,
      docs: [{ platform: "feishu", url: "https://feishu.cn/x" }]
    });
    const res = await request(app).post("/api/resume/analyze").send({ session_id: sessionId });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("generation_failed");
  });

  it("GET /api/resume/evidence 404 for unknown highlight", async () => {
    const app = createApp();
    await request(app).get("/api/resume/evidence?highlight_id=hl_missing").expect(404);
  });
});
