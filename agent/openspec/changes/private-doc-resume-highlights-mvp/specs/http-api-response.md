# HTTP API 响应契约（与实现一致）

与 `docs/master-spec-private-doc-resume-highlights.md` **§15.1 / §15.2** 对齐：**成功时 `code` 为数字 `0`**；错误时为 **四位数错误码**（非字符串）。

## 成功响应

```json
{
  "code": 0,
  "message": "ok",
  "data": {}
}
```

## 错误码（§15.2 + 扩展）

| code | 含义 | 典型使用 |
|------|------|----------|
| 0 | success | — |
| 4001 | invalid_params | 请求体校验失败、资源不存在（统一用 4001 + message 区分） |
| 4002 | invalid_url | URL 非法 |
| 4003 | unsupported_platform | 不支持的平台或错误使用刷新接口 |
| 4004 | auth_required | 需授权 |
| 4005 | access_denied | 无权限 |
| 4006 | empty_content | 内容为空 |
| **4007** | **not_found** | **实现扩展**：HTTP 404 时 body 使用（Master Spec 未单列时由本表约定） |
| 5001 | fetch_failed | 拉取失败 |
| 5002 | parse_failed | 解析失败 |
| 5003 | generation_failed | 生成/分析失败 |
| 5004 | internal_error | 内部错误 |

> 历史说明：曾使用字符串 `code: "ok"`，已废弃；以本文件与代码为准。

## Stage 3 路由补充（实现约定）

| 路由 | 成功 | 典型错误 |
|------|------|----------|
| `POST /api/resume/highlight/save` | `code: 0`，`data` 含 `final_content`、`original_content`、`is_edited` | `4001` 空内容；`4007` 无此亮点或已软删；`5003` evidence 链不完整（`message: evidence_incomplete`） |
| `POST /api/resume/highlight/delete` | `code: 0`，`data.status: deleted`；重复删除 `idempotent: true` | `4007` 未知 `highlight_id` |
| `POST /api/session/clear` | `code: 0`，`data.cleared: true` | `4007` 无此 session；`4005` `user_id` 与 session 不匹配 |

软删后的亮点：`GET /api/resume/evidence` 返回 **404** + body `code: 4007`（与资源不存在一致）。`POST /api/session/clear` 后同会话 evidence 亦为 **404**。
