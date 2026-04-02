import fs from "node:fs";
import path from "node:path";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { ApiCode } from "../src/http/api_codes.js";

const dataFile = path.resolve("./data/store.phase2.json");

describe("phase2 closeout: analyze status + API codes", () => {
  beforeEach(() => {
    process.env.DATA_FILE = dataFile;
    if (fs.existsSync(dataFile)) fs.unlinkSync(dataFile);
  });

  it("POST /api/resume/analyze returns real partial_success when some session docs failed ingest", async () => {
    const app = createApp();
    const session = await request(app).post("/api/session/create").send({
      user_id: "u_partial",
      target_job: "engineering",
      styles: ["technical"],
      desired_highlight_count: 3
    });
    const sessionId = session.body.data.session_id;
    await request(app).post("/api/auth/callback").send({
      user_id: "u_partial",
      session_id: sessionId,
      auth_code: "code_x"
    });
    const imp = await request(app).post("/api/docs/import").send({
      session_id: sessionId,
      docs: [
        { platform: "feishu", url: "https://feishu.cn/doc/a" },
        { platform: "yuque", url: "https://yuque.com/doc/b" }
      ]
    });
    const feishuDocId = imp.body.data[0].doc_id;
    await request(app).post("/api/analysis/start").send({ session_id: sessionId, user_id: "u_partial" }).expect(200);

    const analyze = await request(app).post("/api/resume/analyze").send({
      session_id: sessionId,
      doc_ids: [feishuDocId]
    });
    expect(analyze.status).toBe(200);
    expect(analyze.body.code).toBe(ApiCode.OK);
    expect(analyze.body.data.status).toBe("partial_success");

    const result = await request(app).get(`/api/resume/result?session_id=${sessionId}`).expect(200);
    expect(result.body.code).toBe(ApiCode.OK);
    expect(result.body.data.status).toBe("partial_success");
  });

  it("resume analyze failure returns numeric GENERATION_FAILED", async () => {
    const app = createApp();
    const session = await request(app).post("/api/session/create").send({
      user_id: "u_fail",
      target_job: "engineering",
      styles: ["concise"],
      desired_highlight_count: 3
    });
    const res = await request(app).post("/api/resume/analyze").send({ session_id: session.body.data.session_id });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(ApiCode.GENERATION_FAILED);
  });

  it("evidence payload includes extraction_tier for facts", async () => {
    const app = createApp();
    const session = await request(app).post("/api/session/create").send({
      user_id: "u_ev",
      target_job: "engineering",
      styles: ["technical"],
      desired_highlight_count: 3
    });
    const sessionId = session.body.data.session_id;
    await request(app).post("/api/auth/callback").send({
      user_id: "u_ev",
      session_id: sessionId,
      auth_code: "x"
    });
    const imp = await request(app).post("/api/docs/import").send({
      session_id: sessionId,
      docs: [{ platform: "feishu", url: "https://feishu.cn/d" }]
    });
    const docId = imp.body.data[0].doc_id;
    await request(app).post("/api/analysis/start").send({ session_id: sessionId, user_id: "u_ev" });
    await request(app).post("/api/resume/analyze").send({ session_id: sessionId, doc_ids: [docId] });
    const r = await request(app).get(`/api/resume/result?session_id=${sessionId}`);
    const hlId = r.body.data.highlights[0].highlight_id;
    const ev = await request(app).get(`/api/resume/evidence?highlight_id=${hlId}`).expect(200);
    expect(ev.body.code).toBe(ApiCode.OK);
    expect(ev.body.data.facts[0].extraction_tier).toBeDefined();
  });
});
