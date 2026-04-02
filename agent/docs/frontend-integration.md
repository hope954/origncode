# 前端接入指南（Stage 5 Round 1）

本文件用于前端产品化接入，目标是：**只基于当前仓库已实现的接口与字段**，给出稳定消费方式与状态语义说明。

约束：
- **不编造**未实现字段/接口。
- `auth_service` / `platform_adapters` / 上层 pipeline 的职责边界不在前端侧打破。

---

## 1. 通用响应结构（稳定）

所有 HTTP 响应都满足：

```json
{
  "code": 0,
  "message": "ok",
  "data": {},
  "request_id": "req_xxx"
}
```

同时响应头会包含：
- `x-request-id: req_xxx`

前端建议：
- **展示给用户**：当用户反馈问题时可复制 `request_id`。
- **传入透传**：前端可在请求头带 `x-request-id`（或 `x-correlation-id`），后端会沿用该值（满足格式校验时）。

### 1.1 错误响应与 error_context（稳定）

错误响应也包含 `request_id`，并且在 `data.error_context` 中提供可机器读取的上下文：

```json
{
  "code": 4001,
  "message": "token_invalid",
  "data": {
    "error_context": {
      "stage": "auth_refresh",
      "reason": "token_invalid",
      "platform": "feishu",
      "session_id": "sess_xxx",
      "request_id": "req_xxx"
    }
  },
  "request_id": "req_xxx"
}
```

`error_context` **key 名稳定**，允许缺字段（例如没有 `session_id`）但不会随意改名：
- `stage`
- `reason`
- `platform`（若适用）
- `session_id`（若适用）
- `doc_id` / `highlight_id` / `task_id`（若适用）
- `request_id`

---

## 2. 状态与语义（前端展示重点）

### 2.1 会话/任务状态（completed / partial_success / failed）

后端有两条“状态线”：
- **文档抓取解析（ingest）**：`POST /api/analysis/start` → `GET /api/analysis/task` / `GET /api/analysis/result`
- **简历亮点分析（resume）**：`POST /api/resume/analyze` → `GET /api/resume/result`

前端推荐展示：
- 导入与抓取阶段：以 `/api/analysis/result` 为准展示“哪些文档失败/为什么”。
- 亮点结果展示：以 `/api/resume/result` 为准展示 highlights 与 warnings。

### 2.2 文档级失败语义（auth_required / access_denied / fetch_failed 等）

文档抓取解析阶段（ingest）中，失败会体现在：
- `GET /api/analysis/result` 返回的 `failures[]`（每项含 `doc_id` 与 `code` 字符串）

`code` 字符串来自 adapter / auth 的 `reason`，典型值：
- `auth_required`：无可用 token（未连接/已撤销/状态非 connected）
- `token_invalid`：token 无效（例如语雀 token 无效；飞书 refresh 失败收口到该语义）
- `token_expired`：token 过期（飞书常见；部分实现会在 ingest 中收口为 auth_required）
- `access_denied`：有 token 但对该文档无权限访问
- `fetch_failed`：网络/平台异常/文档不存在/URL 不支持/结构不支持/空正文等

> 注意：ingest 内部会把 `token_invalid/token_expired` 这类鉴权问题映射为 doc.status 的 `auth_required`，但 `failures[].code` 会保留更细的 `reason`，用于前端展示原因文本。

### 2.3 fetch_failed 的 detail（仅调试/验收，不建议前端强依赖）

adapter 层会抛出 `reason: fetch_failed`，并可能附带 `detail` 用于排障与测试验收：
- `empty_content`：正文为空（平台结构存在但内容为空）
- `unsupported_structure`：平台响应结构异常/缺字段，无法提取正文
- `doc_not_found`：文档不存在（语雀 404）

该 `detail` 当前**不通过公共 API 直接返回**给前端（避免泄露平台原始响应），主要用于：
- 日志定位（见 `docs/deployment-and-operations.md`）
- 自动化测试验收（Stage 5）

---

## 3. 平台连接状态（Auth）

### 3.1 查询连接状态：`GET /api/auth/status`

Query：
- `user_id`（必填）
- `session_id`（可选；若提供，则优先返回 session 维度绑定的授权记录）

Response `data`（稳定字段）：

```json
{
  "feishu": { "auth_status": "connected", "last_verified_at": "2026-04-02T..." },
  "yuque": { "auth_status": "not_connected", "last_verified_at": null }
}
```

`auth_status` 枚举（稳定，见 Master Spec §6.7）：
`not_connected | connecting | connected | expired | invalid | revoked`

前端推荐判断：
- **需要连接/重新授权**：`auth_status !== "connected"`
- **已连接可拉取**：`auth_status === "connected"`

### 3.2 飞书授权入口（可选展示 real/fallback）

- 授权 URL：`GET /api/auth/url?platform=feishu&user_id=...&session_id=...`
- 回调换票：`POST /api/auth/callback`

`POST /api/auth/callback` 成功时 `data` 包含：
- `platform`
- `auth_status`
- `auth_mode: "real" | "fallback"`

说明：
- `auth_mode` 属于 Stage 5 的**可验证验收字段**，适合调试/验收展示；业务判断仍以 `auth_status` 与 ingest 结果为准。

### 3.3 飞书 refresh：`POST /api/auth/refresh`（仅飞书）

Request：
```json
{ "platform": "feishu", "user_id": "u1", "session_id": "sess_xxx" }
```

Success `data`：
- `platform`
- `auth_status`
- `auth_mode: "real" | "fallback"`

Failure：
- `code: 4001`
- `message: token_invalid | token_expired`
- `data.error_context.stage === "auth_refresh"`

### 3.4 语雀 token verify/save/delete

- verify：`POST /api/auth/yuque/token/verify` → `data.valid` + `data.verify_mode: "live" | "structural"`
- save：`POST /api/auth/yuque/token/save`
- delete：`POST /api/auth/yuque/token/delete`

说明：
- `verify_mode` 同样属于调试/验收字段：当 `YUQUE_LIVE_VERIFY=1` 时为 `live`，否则为 `structural`。

---

## 4. 导入与抓取解析（ingest）

### 4.1 导入：`POST /api/docs/import`

Request：

```json
{
  "session_id": "sess_xxx",
  "docs": [{ "platform": "feishu", "url": "https://..." }]
}
```

Response `data`：
- `DocumentRef[]`（当前字段：`doc_id/session_id/platform/url/status/created_at/updated_at`）

### 4.2 抓取解析：`POST /api/analysis/start`

Request：

```json
{ "session_id": "sess_xxx", "user_id": "u1" }
```

Response `data`：

```json
{ "task_id": "task_xxx" }
```

> 当前实现会 await 完成所有文档拉取与 chunk 入库后再返回（无需前端轮询等待 ingest 结束）。

### 4.3 ingest 结果：`GET /api/analysis/result?session_id=...`

Response `data`（稳定字段）：
- `session_status: completed | partial_success | failed`
- `docs_total`
- `docs_parsed`
- `docs_failed`
- `partial_success`（boolean）
- `failures: Array<{ doc_id: string; code?: string }>`

前端展示建议：
- 对 `failures[]` 做“失败列表”展示：按 `code` 映射用户可理解文案（不展示平台原始错误）。
- `partial_success === true` 时仍允许进入 `resume/analyze`。

---

## 5. 简历亮点分析与结果

### 5.1 分析：`POST /api/resume/analyze`

Request（最小）：

```json
{ "session_id": "sess_xxx" }
```

Success `data`：
- `task_id`
- `status`（可能为 `extracting|merging|generating|completed|partial_success|failed`）

Failure：
- `code: 5003`
- `message: generation_failed`
- `data.error_context.stage === "resume_analyze"`

### 5.2 结果：`GET /api/resume/result?session_id=...`

Success `data`（稳定字段）：
- `session_id`
- `status: completed | partial_success | failed`
- `highlights[]`（每项字段）
  - `highlight_id`
  - `style`
  - `target_job`
  - `content`（最终展示文本，来自后端 `final_content`）
  - `confidence_score`
  - `is_edited`
- `warnings: string[]`

### 5.3 warnings（前端展示）

当前 warnings 是可直接展示给用户的中文句子（不含敏感数据），典型值：
- `部分文档读取失败或未授权`
- `部分亮点缺少明确量化指标（材料中未抽取到数字时系统不会编造）`

前端建议：
- 以“提示/告警条”展示，点击可展开（比如引导用户补充文档或重新授权）。

### 5.4 evidence：`GET /api/resume/evidence?highlight_id=...`

Success `data`（稳定字段）：
- `highlight_id`
- `source_docs[]`（`doc_id/title`）
- `source_chunks[]`（`chunk_id/title_path/cleaned_text`）
- `facts[]`（`fact_id/extraction_tier/action/result/metric`）

404（不存在/已软删/会话清理后）：
- `code: 4007`
- `message: not_found`

---

## 6. 编辑/删除/清理（Stage 3）

### 6.1 保存：`POST /api/resume/highlight/save`

Request：

```json
{ "highlight_id": "hl_xxx", "final_content": "..." }
```

Success `data`：
- `highlight_id`
- `final_content`
- `original_content`
- `is_edited`

### 6.2 删除：`POST /api/resume/highlight/delete`

Success `data`：
- `highlight_id`
- `status: "deleted"`
- `idempotent: boolean`

### 6.3 会话清理：`POST /api/session/clear`

Request：

```json
{ "session_id": "sess_xxx", "user_id": "u1" }
```

Success `data`：
- `session_id`
- `cleared: true`

说明（稳定语义）：
- 清理会话级结构化数据（docs/normalized/chunks/facts/experiences/highlights/tasks）。
- 不会误删可跨会话复用的长期平台授权（详见 `docs/deployment-and-operations.md`）。

