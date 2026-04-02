# Private Doc Resume Highlights — Agent Backend

Node/Express service under **`agent/`**: session orchestration, document intake, and **resume analysis** (Fact → Experience → Highlight → Evidence).

## Current project status

| Stage | Status | What it covers |
|--------|--------|----------------|
| **Stage 1** | Done | API skeleton, session model, auth routes, `POST /api/docs/import`, analysis orchestration, chunk pipeline, storage. |
| **Stage 1.5** | Done | Contract baseline: numeric HTTP `code` (Master Spec §15.x), path fixes, tests; mock adapters clearly bounded. |
| **Stage 2** | Done | **Fact / Experience / Highlight / Evidence** backend: `Chunk → Fact → Experience → Highlight`, `partial_success`, analyze/result/evidence/rewrite APIs. |
| **Stage 3** | Done | **结果编辑 / 软删 / 会话清理**：`POST /api/resume/highlight/save`、`delete`，`POST /api/session/clear`；软删亮点、级联清理会话数据；**不**在业务逻辑中耦合平台 mock。 |

Third-party **OAuth token exchange** and **live document APIs** remain **mocked or stubbed** (see [Mock vs real integration](#mock-vs-real-integration)). Pipeline logic does not depend on real Feishu/Yuque HTTP.

### Highlights (Stage 3)

- **Soft delete**：`highlight.status === "deleted"` + `deleted_at`；`GET /api/resume/result` 不返回已删项；`GET /api/resume/evidence` 对已删 id 返回 **404** + `code: 4007`（与清理后「无数据」一致）。
- **Save**：仅更新 `final_content` / `content`，**不**改 `experience_id` 与 `evidence_fact_ids`；`original_content` 保留为首次生成/重写基线。
- **Session clear**：删除该会话下 documents / normalized / chunks / facts / experiences / highlights / tasks；**仅删除** `platformAuths.session_id === session_id` 的凭证；**保留** `session_id` 为空的全局语雀等绑定（见 `src/session_lifecycle/clear_session.ts`）。

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

### Stage 3 — edit, delete, session lifecycle

- `POST /api/resume/highlight/save` — persist edited `final_content`, `is_edited`, `status: saved`.
- `POST /api/resume/highlight/delete` — soft delete; optional **幂等**第二次删除返回 `idempotent: true`。
- `POST /api/session/clear` — cascade purge session-scoped data; optional `user_id` 校验。
- Deployment / audit / release gate documentation: **`docs/deployment-and-operations.md`**。

---

## Not implemented yet

- **Production** Feishu/Yuque OAuth and document HTTP (current: mocks; see table below).
- Dedicated **web UI** for evidence chains / highlight editing (APIs exist; no shipped frontend in this repo).
- OpenSpec task **7.4**（结果页 evidence 展示交互）— 前端范围，本仓库仅提供 API。
- **Multi-tenant DB / S3** 等替代 JSON 文件存储（需替换 `Repository` 实现）。

---

## Mock vs real integration

| Area | Current behavior | To reach “real” |
|------|------------------|-----------------|
| Feishu token exchange | **`auth_service` synthesizes** tokens from `auth_code`** — not Feishu HTTP | `app_id` / `app_secret` + official token endpoints |
| Feishu document fetch | **`FeishuAdapter.fetchDocument`** returns fixed markdown-like text | Docs/Bitable APIs with real `user_access_token` |
| Yuque document fetch | **`YuqueAdapter.fetchDocument`** returns fixed text | Yuque Open API with user token |
| Yuque token “verify” | Prefix / length checks only — **not** live API | e.g. lightweight “who am I” probe |

**Adapters remain pluggable**: resume **save/delete/clear** 只读写仓库内结构化数据，**无**飞书/语雀分支。

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
| POST | `/api/session/clear` | Cascade remove session data; body `{ session_id, user_id? }` |
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
| GET | `/api/resume/result?session_id=` | Highlights + warnings（不含软删项） |
| GET | `/api/resume/evidence?highlight_id=` | Evidence chain（已删或已 clear → 404） |
| POST | `/api/resume/rewrite` | `highlight_id`, `style`, `target_job` |
| POST | `/api/resume/highlight/save` | `highlight_id`, `final_content` |
| POST | `/api/resume/highlight/delete` | `highlight_id` |

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
- **`npm test`** — Vitest（stage1–3、pipeline 单测、closeout）。

No `.env` is strictly required for tests (tests use isolated `DATA_FILE` paths). For **`npm run dev`** / **`npm start`**, copy `.env.example` → `.env` and set `TOKEN_ENCRYPTION_KEY` as documented there.

## CI

On push/PR to `main` or `master`, **GitHub Actions** workflow **`.github/workflows/agent-ci.yml`** runs install + typecheck + test with **`working-directory: agent`**.

## Operations & release gates

See **`docs/deployment-and-operations.md`**（私有化部署、环境变量、存储、mock 替换说明、安全审计与发布前检查清单）。

---

## Local run (server)

1. `npm install`
2. Copy `.env.example` → `.env` and set `TOKEN_ENCRYPTION_KEY` (32-byte base64 recommended for production).
3. `npm run dev` or `npm start`

---

## Responsibility split

- **`auth_service`**: Feishu auth URL, callback, Feishu refresh, Yuque token verify/save/delete, auth status.
- **`platform_adapters`**: Given a **decrypted** platform token, fetch content → `NormalizedDocument` (no OAuth on adapters).
- **`resume_pipeline` + experience/highlight pipelines**: Chunk → Fact → Experience → Highlight; evidence; rewrite; save/delete highlights.
- **`session_lifecycle/clear_session`**: Session cascade delete only (no platform HTTP); PlatformAuth 规则见文件头注释。
