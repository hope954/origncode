# Stage 5 手工验收步骤（真实接入）

本文档用于 **Stage 5 Round 1** 的人工验收，覆盖：
- 飞书真实 OAuth / refresh
- 语雀 token verify / 真实文档读取
- 失败场景与排障（`request_id` / 日志 / `error_context`）
- 真实文档进入既有链路的最小演示路径

约束：
- 仅基于当前代码已实现接口，不引入新页面、新脚本、新 API。
- 不在文档中给出 token 明文示例；示例统一使用占位符。

---

## 1. 验收前准备

### 1.1 启动

在 `agent/` 目录：

```bash
npm install
npm run dev
```

默认服务地址：`http://localhost:3000`

### 1.2 环境变量与 real/fallback 门控

飞书真实路径门控：
- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`
- `FEISHU_REDIRECT_URI`
- 可选 `FEISHU_BASE_URL`

语雀真实路径门控：
- `YUQUE_LIVE_VERIFY=1`：verify 走 live probe（`/api/v2/user`）
- `YUQUE_LIVE_FETCH=1`：文档读取走真实路径
- 可选 `YUQUE_BASE_URL`

若未配置上述门控：
- 会走 fallback（用于 CI/dev），不是生产真实接入。

### 1.3 request_id 使用方式

建议每次请求带 header：

```text
x-request-id: req_manual_001
```

验收时检查：
- 响应头 `x-request-id`
- 响应体 `request_id`
- 错误时 `data.error_context.request_id`

三者应一致。

---

## 2. 飞书验收步骤

## 2.1 获取授权 URL

请求：

```http
GET /api/auth/url?platform=feishu&user_id=<USER_ID>&session_id=<SESSION_ID>
```

预期：
- `code = 0`
- `data.auth_url` 存在

## 2.2 callback 成功（最小可验证）

请求：

```http
POST /api/auth/callback
Content-Type: application/json

{
  "user_id": "<USER_ID>",
  "session_id": "<SESSION_ID>",
  "auth_code": "<FEISHU_AUTH_CODE>"
}
```

预期：
- `code = 0`
- `data.platform = "feishu"`
- `data.auth_status = "connected"`
- `data.auth_mode`：
  - `real`：真实路径
  - `fallback`：未开启真实门控

## 2.3 refresh 成功

请求：

```http
POST /api/auth/refresh
Content-Type: application/json

{
  "platform": "feishu",
  "user_id": "<USER_ID>",
  "session_id": "<SESSION_ID>"
}
```

预期：
- `code = 0`
- `data.platform = "feishu"`
- `data.auth_status = "connected"`
- `data.auth_mode = "real"`（真实门控已开启时）

## 2.4 refresh 失败（token_invalid / token_expired）

同接口触发失败后，预期：
- `code = 4001`
- `message` 为 `token_invalid` 或 `token_expired`
- `data.error_context.stage = "auth_refresh"`
- `data.error_context.platform = "feishu"`
- `request_id` / `x-request-id` / `error_context.request_id` 一致

---

## 3. 语雀验收步骤

## 3.1 token verify（live vs structural）

请求：

```http
POST /api/auth/yuque/token/verify
Content-Type: application/json

{
  "token": "<YUQUE_ACCESS_TOKEN>"
}
```

预期：
- `code = 0`
- `data.valid = true|false`
- `data.verify_mode`：
  - `live`：`YUQUE_LIVE_VERIFY=1`
  - `structural`：仅结构校验（fallback）

## 3.2 token save / delete

保存：

```http
POST /api/auth/yuque/token/save
{
  "user_id": "<USER_ID>",
  "session_id": "<SESSION_ID>",
  "token": "<YUQUE_ACCESS_TOKEN>"
}
```

删除：

```http
POST /api/auth/yuque/token/delete
{
  "user_id": "<USER_ID>",
  "session_id": "<SESSION_ID>"
}
```

预期：
- save 成功：`code = 0`，`data.auth_status = "connected"`
- save 失败：`code = 4001`，`message = token_invalid`
- delete 参数错误：`code = 4001` 且含 `data.error_context`

## 3.3 语雀真实文档读取验证

前置：`YUQUE_LIVE_FETCH=1` 且 token 已保存。

导入语雀文档并启动 ingest（见第 5 节），预期：
- 文档能到 `parsed`（通过 `/api/analysis/result` 间接观察）
- 继续 `resume/analyze` 后可产出 highlights（最小闭环）

---

## 4. 失败场景验收清单

以下场景均应保持数字 code + 结构化错误：

1. **无权限**（`access_denied`）
   - 表现：ingest `failures[].code` 包含 `access_denied`
2. **token 无效**（`token_invalid`）
   - 表现：auth 接口 `message = token_invalid`
3. **token 失效**（`token_expired`）
   - 表现：refresh 失败 `message = token_expired`（按后端映射）
4. **URL 不合法/不支持**
   - 导入阶段 schema 不过：`code = 4001` / `message = invalid_params`
   - 适配器 URL 不支持：ingest 失败 `code = fetch_failed`（在失败列表中体现）
5. **文档不存在**
   - 通常收口为 `fetch_failed`（语雀 detail 可为 `doc_not_found`，仅用于内部排障）

注意：
- `detail`（如 `empty_content`/`unsupported_structure`）不作为前端稳定字段。
- 前端展示建议用 `message` 与 `failures[].code`。

---

## 5. 主链路最小演示路径（真实文档触发既有链路）

目标：验证真实平台文档可进入既有
`NormalizedDocument -> Chunk -> Fact -> Experience -> Highlight`
链路（不改主链路策略）。

步骤：

1. 创建会话
   - `POST /api/session/create`
2. 完成平台授权/保存 token
   - 飞书：`/api/auth/callback`
   - 语雀：`/api/auth/yuque/token/save`
3. 导入文档
   - `POST /api/docs/import`
4. 启动 ingest
   - `POST /api/analysis/start`
5. 查看 ingest 结果
   - `GET /api/analysis/result?session_id=...`
6. 启动 resume 分析
   - `POST /api/resume/analyze`
7. 查看结果
   - `GET /api/resume/result?session_id=...`

观察点：
- `analysis/result.data.session_status`：
  - `completed`：全部文档可用
  - `partial_success`：部分失败但有可用结果
  - `failed`：无可用结果
- `analysis/result.data.failures[]`：文档失败列表
- `resume/result.data.warnings[]`：用户可展示提示

---

## 6. 日志与 request_id 排障

## 6.1 推荐查看的日志事件名

- 会话：`session.create.*`
- 认证：`auth.feishu.*`、`auth.yuque.*`
- 文档：`document.fetch.*`
- 分析：`analysis.*`、`resume.analyze.*`

## 6.2 request_id 串联方法

1. 从失败响应拿到 `request_id`
2. 在日志中按该 `request_id` 搜索
3. 对照 `error_context.stage/reason/platform`

## 6.3 error_context 解读

常用字段：
- `stage`：失败发生位置（如 `auth_refresh` / `resume_analyze`）
- `reason`：机器可读原因
- `platform`：`feishu` / `yuque`（若适用）
- `session_id/doc_id/highlight_id/task_id`：定位对象（若适用）
- `request_id`：链路关联

---

## 7. real/fallback 判断规则（验收侧）

优先判断：

- 飞书 callback / refresh 返回中的 `auth_mode`
- 语雀 verify 返回中的 `verify_mode`

辅助判断（需要服务端日志或测试工具）：
- 是否命中对应平台 Open API endpoint

注意：
- `auth_mode` / `verify_mode` 主要用于验收与调试。
- 前端业务判断仍应以 `auth_status`、`analysis/result`、`resume/result` 为主。

