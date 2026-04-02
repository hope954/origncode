# 私有化部署与运维（Agent 后端）

本文档与 `README.md`、OpenSpec `tasks.md` 中「部署 / 审计 / 发布门禁」条目对应，描述 **Stage 3 完成后** 的运行方式与检查清单。

---

## 1. 私有化部署说明

- **运行形态**：单进程 Node.js（`npm start` / `tsx src/server.ts`），无强制反向代理要求；生产环境建议在应用前部署 **HTTPS 终止**（Nginx、Caddy、云负载均衡等）。
- **数据落盘**：默认使用 **本地 JSON 文件** 作为唯一存储（见下文「存储后端」）。多实例水平扩展前须替换为共享存储或数据库，否则副本间数据不一致。
- **网络边界**：服务需能访问飞书 / 语雀 **Open API**（真实接入时）；当前 MVP 为 **mock 适配器**，可不访问外网。
- **目录**：在仓库 `agent/` 目录安装依赖并启动；`DATA_FILE` 指向可写路径。

---

## 2. 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `DATA_FILE` | 否 | JSON 存储文件绝对或相对路径；默认见 `src/config.ts`。测试与 CI 会覆盖为隔离文件。 |
| `TOKEN_ENCRYPTION_KEY` | 生产建议 | 用于 `access_token` / `refresh_token` 对称加密；需与 `.env.example` 说明一致（长度/编码要求）。缺失时开发环境可能使用占位，**不得用于生产**。 |
| `PORT` | 否 | HTTP 监听端口（若 `server.ts` 暴露）。 |

### 第四阶段真实接入新增配置（规划中，当前代码默认未消费）

| 变量 | 计划用途 |
|------|----------|
| `FEISHU_APP_ID` | 飞书 OAuth `auth_code -> user_access_token` 交换时的客户端标识 |
| `FEISHU_APP_SECRET` | 飞书 OAuth / refresh 调用所需密钥，必须仅后端持有 |
| `FEISHU_REDIRECT_URI` | 飞书回调地址；需与飞书应用配置保持一致 |
| `FEISHU_BASE_URL` | 飞书 Open API 基础地址；默认官方域名，私有区域或网关代理场景可覆盖 |
| `YUQUE_BASE_URL` | 语雀 Open API 基础地址；用于 token 校验与文档拉取 |

说明：
- `TOKEN_ENCRYPTION_KEY` 在第四阶段继续沿用，用于加密保存 **飞书 access/refresh token** 与 **语雀 access token**。
- 上述第四阶段变量应先写入 `.env.example` 与部署文档，再在下一轮代码替换时接入 `src/config.ts` / `auth_service` / `platform_adapters`。

复制 `.env.example` → `.env` 并按环境填写。勿将 `.env` 提交到版本库。

---

## 3. 存储后端说明

- **当前实现**：`Repository` 将 `DataStore`（sessions、platformAuths、documentRefs、normalizedDocuments、chunks、facts、experiences、highlights、tasks 等）**序列化为单个 JSON 文件**，读写时全量加载/写回。
- **影响**：大会话下文件体积与写放大需关注；**无**内置备份与 WAL。
- **演进**：替换存储时保持 **结构化链路** 不变：`NormalizedDocument → Chunk → Fact → Experience → Highlight`，仅替换 `Repository` 实现与持久化介质。

---

## 4. Mock 与真实平台替换

- **认证**：`auth_service` 负责 OAuth / token；**当前**飞书 token 为本地合成字符串，语雀为前缀校验 + 保存。
- **文档**：`FeishuAdapter` / `YuqueAdapter` 返回 **固定文本**；解析后进入统一 `NormalizedDocument` 与 chunk 管线。
- **替换步骤**：见根目录 `README.md`「真实平台接入待替换点」清单；**不得**在 `resume` 保存/删除/会话清理逻辑中插入平台特判 — 第三阶段路由与 `session_lifecycle` 仅依赖仓库内结构化数据。
- **测试策略**：CI 不直接访问真实飞书 / 语雀；第四阶段推荐使用 **协议层 HTTP mock + fixture JSON + adapter 映射测试**，手工验证单独执行。

---

## 5. 安全 / 隐私审计清单（自检）

- [ ] 生产环境已配置强随机 `TOKEN_ENCRYPTION_KEY`，且密钥轮换流程已约定。
- [ ] 日志与错误响应中 **不** 打印明文 token、refresh 材料或完整用户文档正文。
- [ ] `GET /api/storage/snapshot` 仅在受控环境启用或已禁用对外暴露。
- [ ] `POST /api/session/clear` 在提供 `user_id` 时校验与会话归属一致（当前实现：`user_id` 可选，提供则必须匹配 `session.user_id`）。
- [ ] 亮点 **软删** 后列表与 evidence 行为与文档一致（正常列表不含已删项；evidence 返回 `404` + 数字 `code`）。
- [ ] 会话清理 **仅删除** `platformAuths.session_id === 该 session` 的凭证行；**保留** `session_id` 为空的全局语雀等绑定（见 `session_lifecycle/clear_session.ts` 注释）。

---

## 6. 发布前检查清单

- [ ] `cd agent && npm install && npx tsc --noEmit && npm test` 全部通过。
- [ ] CI（`.github/workflows/agent-ci.yml`）在默认分支为绿。
- [ ] API 响应仍为 **数字 `code`**，与 `openspec/.../http-api-response.md` 及 Master Spec §15 一致。
- [ ] 抽样验证：`POST /api/resume/highlight/save`、`delete`、`POST /api/session/clear` 与 `GET /api/resume/result`、`/api/resume/evidence` 行为符合 README。
- [ ] 版本标签 / 变更说明已记录（若团队要求）。

---

## 7. 相关文档

- `README.md` — 功能范围、API 表、本地与 CI 验证命令。
- `openspec/changes/private-doc-resume-highlights-mvp/specs/http-api-response.md` — HTTP 数字契约。
- `docs/master-spec-private-doc-resume-highlights.md` — Master Spec（若与实现有扩展差异，以 `http-api-response.md` 标注为准）。
