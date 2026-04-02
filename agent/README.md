# Private Doc Resume Highlights — Agent Backend

Node/Express service under **`agent/`**: session orchestration, document intake, and **resume analysis** (Fact → Experience → Highlight → Evidence).

## Current project status

| Stage | Status | What it covers |
|--------|--------|----------------|
| **Stage 1** | Done | API skeleton, session model, auth routes, `POST /api/docs/import`, analysis orchestration, chunk pipeline, storage. |
| **Stage 1.5** | Done | Contract baseline: numeric HTTP `code` (Master Spec §15.x), path fixes, tests; mock adapters clearly bounded. |
| **Stage 2** | Done | **Fact / Experience / Highlight / Evidence** backend: `Chunk → Fact → Experience → Highlight`, ranking, evidence binding, `partial_success` semantics, `POST /api/resume/*` routes, persistence + tests. |

Third-party **OAuth token exchange** and **live document APIs** remain **mocked or stubbed** (see [Mock vs real integration](#mock-vs-real-integration)). Pipeline logic does not depend on real Feishu/Yuque HTTP.

## Stage 3 planned scope (not started here)

- Product-facing flows beyond current MVP API (e.g. richer session/clear, highlight save/delete if spec requires).
- Replacing mock **Feishu/Yuque** adapters and **token exchange** with production integrations.
- Optional: frontend for evidence/result UX, release gates from OpenSpec tasks.

---

## Implemented

### Stage 1 — foundation

- Session creation, analysis task orchestration, dual-platform **document refs** (`POST /api/docs/import`).
- Document pipeline: `NormalizedDocument`, normalizer, cleaner, **chunker**.
- Privacy/storage: `PlatformAuth`, encrypted token fields, repository JSON store.

### Stage 1.5 — contract & quality

- HTTP responses: **`{ code, message, data? }`** with numeric codes (`0` = success; `400x` / `500x` errors). See `openspec/changes/private-doc-resume-highlights-mvp/specs/http-api-response.md`.
- Vitest coverage for core stage-1 flows and adapter smoke tests.

### Stage 2 — resume intelligence (backend)

- **Fact extraction** (rule-based + controlled synthetic fallback with tier / degradation signals).
- **Experience merge & rank**, **highlight generation**, **evidence binding** to chunks/docs/facts.
- APIs: `POST /api/resume/analyze`, `GET /api/resume/result`, `GET /api/resume/evidence`, `POST /api/resume/rewrite`.
- Session/task states including **`partial_success`** when some docs fail but highlights are still produced.
- Evidence API exposes fact metadata (e.g. **`extraction_tier`**) for traceability.

---

## Not implemented yet

- **Production** Feishu/Yuque OAuth and document HTTP (current: mocks; see table below).
- Dedicated **web UI** for evidence chains / highlight editing (APIs exist; no shipped frontend in this repo).
- Spec endpoints not yet built (examples): `POST /api/resume/highlight/save`, bulk delete, `session/clear` — see OpenSpec `tasks.md` if applicable.
- Full **release / QA gates** (checklists in OpenSpec) beyond automated tests in CI.

---

## Mock vs real integration

| Area | Current behavior | To reach “real” |
|------|------------------|-----------------|
| Feishu token exchange | **`auth_service` synthesizes** tokens from `auth_code`** — not Feishu HTTP | `app_id` / `app_secret` + official token endpoints |
| Feishu document fetch | **`FeishuAdapter.fetchDocument`** returns fixed markdown-like text | Docs/Bitable APIs with real `user_access_token` |
| Yuque document fetch | **`YuqueAdapter.fetchDocument`** returns fixed text | Yuque Open API with user token |
| Yuque token “verify” | Prefix / length checks only — **not** live API | e.g. lightweight “who am I” probe |

**Stage 2 treats adapters and OAuth as pluggable**: orchestration and resume pipelines consume **normalized chunks**; swap adapters without changing Fact/Experience/Highlight contracts.

### 真实平台接入待替换点（checklist）

1. **`auth_service.handleFeishuCallback`** — POST Feishu OAuth token API; store real tokens + expiry.
2. **`auth_service.refreshFeishuToken`** — refresh endpoint; handle expiry/revoke.
3. **`auth_service.saveYuqueToken` / `verifyYuqueToken`** — optional live validation before save.
4. **`FeishuAdapter.fetchDocument`** — resolve URL → API calls for body/export.
5. **`YuqueAdapter.fetchDocument`** — resolve repo/slug; GET document body.

---

## HTTP API overview

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/session/create` | Create session |
| GET | `/api/auth/url?platform=feishu&user_id=&session_id=` | Feishu OAuth URL |
| POST | `/api/auth/callback` | Feishu: `{ user_id, session_id, auth_code }` |
| POST | `/api/auth/refresh` | **Feishu only**; Yuque → `4003` + message |
| POST | `/api/auth/yuque/token/verify` | `{ token }` |
| POST | `/api/auth/yuque/token/save` | `{ user_id, session_id?, token }` |
| POST | `/api/auth/yuque/token/delete` | `{ user_id, session_id? }` |
| GET | `/api/auth/status?user_id=&session_id=` | Auth summary |
| POST | `/api/docs/import` | `{ session_id, docs: [{ platform, url }] }` |
| POST | `/api/analysis/start` | `{ session_id, user_id }` |
| GET | `/api/analysis/task?task_id=` | Task status |
| GET | `/api/analysis/result?session_id=` | Aggregate doc outcomes |
| POST | `/api/resume/analyze` | `session_id`, optional `doc_ids`, `target_job`, `styles`, `desired_highlight_count` |
| GET | `/api/resume/result?session_id=` | Highlights + warnings |
| GET | `/api/resume/evidence?highlight_id=` | Evidence chain |
| POST | `/api/resume/rewrite` | `highlight_id`, `style`, `target_job` |

Debug: `GET /api/storage/snapshot` (treat as dev-only; tokens stored encrypted).

---

## Verification (local)

From the **`agent/`** directory:

```bash
npm install
npx tsc --noEmit
npm test
```

- **`npx tsc --noEmit`** — TypeScript compile check without emit.
- **`npm test`** — Vitest (stage1, stage2, pipeline unit tests, closeout tests).

No `.env` is strictly required for tests (tests use isolated `DATA_FILE` paths). For **`npm run dev`** / **`npm start`**, copy `.env.example` → `.env` and set `TOKEN_ENCRYPTION_KEY` as documented there.

## CI

On push/PR to `main` or `master`, **GitHub Actions** workflow **`.github/workflows/agent-ci.yml`** runs the same install + typecheck + test sequence with **`working-directory: agent`**. A green run means the repo’s automated bar for the current Stage 2 closeout is satisfied.

---

## Local run (server)

1. `npm install`
2. Copy `.env.example` → `.env` and set `TOKEN_ENCRYPTION_KEY` (32-byte base64 recommended for production).
3. `npm run dev` or `npm start`

---

## Responsibility split

- **`auth_service`**: Feishu auth URL, callback, Feishu refresh, Yuque token verify/save/delete, auth status.
- **`platform_adapters`**: Given a **decrypted** platform token, fetch content → `NormalizedDocument` (no OAuth on adapters).
- **`resume_pipeline` + experience/highlight pipelines**: Chunk → Fact → Experience → Highlight; evidence; rewrite.
