# Private Doc Resume Highlights — Agent Backend

Node/Express service under **`agent/`**: session orchestration, document intake, and **resume analysis** (Fact → Experience → Highlight → Evidence).

## Current project status

| Stage | Status | What it covers |
|--------|--------|----------------|
| **Stage 1** | Done | API skeleton, session model, auth routes, `POST /api/docs/import`, analysis orchestration, chunk pipeline, storage. |
| **Stage 1.5** | Done | Contract baseline: numeric HTTP `code` (Master Spec §15.x), path fixes, tests; mock adapters clearly bounded. |
| **Stage 2** | Done | **Fact / Experience / Highlight / Evidence** backend: `Chunk → Fact → Experience → Highlight`, `partial_success`, analyze/result/evidence/rewrite APIs. |
| **Stage 3** | Done | **结果编辑 / 软删 / 会话清理**：`POST /api/resume/highlight/save`、`delete`，`POST /api/session/clear`；软删亮点、级联清理会话数据；**不**在业务逻辑中耦合平台 mock。 |
| **Stage 4** | Done | **真实平台接入替换**：飞书真实 OAuth / token exchange / refresh；语雀真实 token 校验探测；两个 adapter 均支持真实 HTTP 文档拉取 + `NormalizedDocument` 映射；配置门控（`FEISHU_APP_ID` / `YUQUE_LIVE_FETCH`），CI 无需真实凭据。 |

Platform integration is **configuration-gated**: when env vars are unset, adapters and auth use mock paths for CI/dev; when configured, real HTTP calls are made. (see [Mock vs real integration](#mock-vs-real-integration)).

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

### Stage 4 — real platform integration (mock adapters replaced)

Previously all platform HTTP was mocked. Stage 4 replaced every mock point with real implementations, controlled by env-var gates so CI keeps passing without credentials.

- **飞书 OAuth** (`handleFeishuCallback`): 真实 Feishu `app_access_token` 获取 + OIDC code exchange → `user_access_token` + `refresh_token`；`refreshFeishuToken` 调真实 refresh 端点。Gate: `FEISHU_APP_ID` + `FEISHU_APP_SECRET`。
- **飞书文档** (`FeishuAdapter.fetchDocument`): 解析 `/docx/` / `/docs/` URL，GET `/open-apis/docx/v1/documents/{id}/raw_content`，映射 `title`/`blocks`/`content_text`。Gate: `FEISHU_APP_ID`。
- **语雀 token 校验** (`verifyYuqueToken`): `YUQUE_LIVE_VERIFY=1` 时向 `GET /api/v2/user` 发 live 探测；否则仅结构校验（前缀 + 长度）。
- **语雀文档** (`YuqueAdapter.fetchDocument`): 解析 `yuque.com/{ns}/{book}/{slug}` URL，GET `/api/v2/repos/{ns}/{book}/docs/{slug}`，映射 `NormalizedDocument`。Gate: `YUQUE_LIVE_FETCH=1`。
- **错误语义统一**: 平台 401/403/404/500 映射到 `access_denied` / `token_invalid` / `token_expired` / `token_revoked` / `fetch_failed`；数字 `ApiCode` 不变。
- **Orchestrator async cascade**: `startTask`/`runTask` 改为 async；`POST /api/analysis/start` 等待所有文档拉取完成后再返回（无需客户端轮询）。
- **新增测试**: `tests/platform_integration.test.ts`（14 用例，`vi.stubGlobal('fetch', ...)` 驱动，覆盖飞书 + 语雀真实路径、error mapping）。

---

## Not implemented yet (MVP scope boundaries)

- Dedicated **web UI** for evidence chains / highlight editing (APIs exist; no shipped frontend in this repo).
- OpenSpec task **7.4**（结果页 evidence 展示交互）— 前端范围，本仓库仅提供 API。
- **Multi-tenant DB / S3** 等替代 JSON 文件存储（需替换 `Repository` 实现）。
- Feishu **Wiki / Bitable / Sheet** URL 格式支持（当前仅 `/docx/` + `/docs/` 路径，见 `FeishuAdapter` 注释）。
- 语雀 **OAuth** 接入（当前仍为手动 token，符合 Master Spec MVP 要求；`YuqueAdapter` 实现已就绪，替换 token 来源即可）。

---

## Mock vs real integration

Stage 4 已实现真实接入，行为通过 **配置门控** 切换，CI 无需真实凭据：

| Area | Real mode gate | Mock fallback (CI/dev) |
|------|----------------|------------------------|
| Feishu token exchange | `FEISHU_APP_ID` + `FEISHU_APP_SECRET` | Synthesized `feishu_at_...` token |
| Feishu document fetch | `FEISHU_APP_ID` set | Fixed markdown-like text |
| Yuque token verify (live probe) | `YUQUE_LIVE_VERIFY=1` | Structural prefix + length check |
| Yuque document fetch | `YUQUE_LIVE_FETCH=1` | Fixed text |

**Adapters remain pluggable**: resume **save/delete/clear** 只读写仓库内结构化数据，**无**飞书/语雀分支。

### 真实平台接入状态（Stage 4 completed）

All mock points replaced with real implementations. Production setup:

```
FEISHU_APP_ID=<your_app_id>
FEISHU_APP_SECRET=<your_secret>
FEISHU_REDIRECT_URI=https://your-domain/callback/feishu
YUQUE_LIVE_FETCH=1          # enables real Yuque document fetch
YUQUE_LIVE_VERIFY=1         # optional: live token probe on save
```

| Component | Status | Details |
|-----------|--------|---------|
| `auth_service.handleFeishuCallback` | ✅ 已替换 | 真实 OIDC code → token exchange；`FEISHU_APP_ID` 门控 |
| `auth_service.refreshFeishuToken` | ✅ 已替换 | 真实 `/authen/v1/oidc/refresh_access_token`；`FEISHU_APP_ID` 门控 |
| `auth_service.verifyYuqueToken` | ✅ 已替换 | 可选真实 GET `/api/v2/user` 探测；`YUQUE_LIVE_VERIFY=1` 门控 |
| `FeishuAdapter.fetchDocument` | ✅ 已替换 | 真实 docx/docs URL + raw_content API；`FEISHU_APP_ID` 门控 |
| `YuqueAdapter.fetchDocument` | ✅ 已替换 | 真实 yuque.com URL + `/api/v2/repos/…/docs/` API；`YUQUE_LIVE_FETCH=1` 门控 |

### Remaining limitations

- Feishu **Wiki / Bitable / Sheet** URL formats not yet supported (only `/docx/` + `/docs/`).
- Yuque **OAuth** not implemented — MVP uses manual token per Master Spec.
- CI / dev **fallback path** remains: when gates are unset, adapters return synthetic content so integration tests pass without network access.

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
- **`npm test`** — Vitest（stage1–4、pipeline 单测、closeout、platform integration; 47 tests）。

No `.env` is strictly required for tests (tests use isolated `DATA_FILE` paths). For **`npm run dev`** / **`npm start`**, copy `.env.example` → `.env` and set `TOKEN_ENCRYPTION_KEY` as documented there.

## CI

On push/PR to `main` or `master`, **GitHub Actions** workflow **`.github/workflows/agent-ci.yml`** runs install + typecheck + test with **`working-directory: agent`**.

## Operations & release gates

See **`docs/deployment-and-operations.md`**（私有化部署、环境变量、存储、mock 替换说明、安全审计与发布前检查清单）。

Frontend integration: see **`docs/frontend-integration.md`**（平台连接状态、稳定响应结构、状态语义与前端展示建议）。

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
