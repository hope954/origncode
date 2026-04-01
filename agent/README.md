# Stage 1 / 1.5 Backend (MVP subset)

## Implemented scope

- Module skeleton + contract baseline
- Session/task orchestration
- Dual-platform intake: Feishu OAuth **callback + token persistence** (mock exchange), Yuque **manual** token (verify/save/delete)
- Document pipeline: `NormalizedDocument`, `document_normalizer`, `content_cleaner`, `chunker`
- Privacy/storage basics: `PlatformAuth` with encrypted token fields and minimized persistence

## Not implemented yet

- Fact extraction / experience / highlight generation (phase 2)
- Evidence detail UI / result edit UI
- Full release gates

---

## Mock vs real integration

| Area | Current behavior | Phase 2 note |
|------|------------------|--------------|
| Feishu token exchange | `auth_service` **synthesizes** `user_access_token` / `refresh_token` from `auth_code` — **not** Feishu HTTP APIs | Replace with `app_id`/`app_secret` + official token endpoints |
| Feishu document fetch | `FeishuAdapter.fetchDocument` returns **fixed markdown-like text** | Replace with Docs/Bitable APIs using real `user_access_token` |
| Yuque document fetch | `YuqueAdapter.fetchDocument` returns **fixed text** | Replace with Yuque Open API calls using user token |
| Yuque token validity | `verifyYuqueToken` uses prefix `yq_` + length — **not** a live Yuque API check | Replace with a real “who am I” or lightweight API probe |

**Phase 2 must treat adapters and auth token exchange as pluggable**: swap implementations without changing orchestration contracts.

### 真实平台接入待替换点（checklist）

1. **`auth_service.handleFeishuCallback`** — POST Feishu OAuth token API with `auth_code`, store real tokens + expiry.
2. **`auth_service.refreshFeishuToken`** — POST refresh endpoint; handle `token_expired` / revoke.
3. **`auth_service.saveYuqueToken` / `verifyYuqueToken`** — optional live validation call before save.
4. **`FeishuAdapter.fetchDocument`** — resolve `doc.url` → doc token/sheet id; call export/content APIs.
5. **`YuqueAdapter.fetchDocument`** — resolve repo/slug; GET document body from Yuque API.

---

## HTTP API (stage 1.5)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/session/create` | Create session |
| GET | `/api/auth/url?platform=feishu&user_id=&session_id=` | Feishu OAuth entry URL |
| POST | `/api/auth/callback` | Feishu: `{ user_id, session_id, auth_code }` |
| POST | `/api/auth/refresh` | **Feishu only**: body `{ "platform": "feishu", user_id, session_id? }`. Yuque → `400` + `unsupported_platform` |
| POST | `/api/auth/yuque/token/verify` | `{ token }` |
| POST | `/api/auth/yuque/token/save` | `{ user_id, session_id?, token }` |
| POST | `/api/auth/yuque/token/delete` | `{ user_id, session_id? }` |
| GET | `/api/auth/status?user_id=&session_id=` | Per-platform auth summary |
| POST | **`/api/docs/import`** | `{ session_id, docs: [{ platform, url }] }` |
| POST | `/api/analysis/start` | `{ session_id, user_id }` |
| GET | `/api/analysis/task?task_id=` | Task status |
| GET | `/api/analysis/result?session_id=` | Aggregate doc outcomes |

Debug: `GET /api/storage/snapshot` (encrypted tokens only in store).

---

## Local run

1. `npm install`
2. Copy `.env.example` → `.env` and set `TOKEN_ENCRYPTION_KEY` (32-byte base64 recommended for production).
3. `npm run dev` or `npm start`
4. `npm test`

---

## Responsibility split

- **`auth_service`**: Feishu auth URL, callback handling, Feishu refresh, Yuque token verify/save/delete, auth status.
- **`platform_adapters`**: Given a **decrypted** platform access token, fetch content and map to `NormalizedDocument` (no OAuth entry points on adapters).
