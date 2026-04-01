## Context

本变更仅以 `docs/master-spec-private-doc-resume-highlights.md` 为需求基准，目标是先定义可落地的 MVP 技术方案，不包含代码实现。系统要在私有化部署环境中，从飞书与语雀文档读取内容，经过结构化处理中间层，输出可编辑、可追溯证据的“简历亮点”。

关键约束：
- MVP 内飞书与语雀必须同等支持，任一缺失即不达标。
- 输出目标是“简历亮点”而非摘要；生成入口必须显式传入 `target_job` 与 `style`。
- 必须支持 evidence 查询（highlight -> experience/fact/chunk/doc）。
- 必须支持 `partial_success`，允许文档级失败但会话级产出继续。
- 不允许“全文直接一步生成最终结果”，必须保留结构化中间层。
- 必须私有化部署友好：用户可控存储、可清理、最小化保留。
- 必须遵循平台访问控制且区分平台认证模型：飞书走 OAuth 授权链路，语雀 MVP 走“用户手动提供 Access Token + 后端校验与托管”，禁止绕过权限检查。

主要干系模块：
- `frontend_app`：会话创建、文档导入、结果展示、evidence 展示、单条重写与人工编辑。
- `analysis_orchestrator`：session/task 编排、状态推进、失败隔离、重试与聚合。
- `auth_service`：飞书授权、飞书 token 刷新、语雀 token 校验与保存/删除、授权状态查询。
- `platform_adapters`：消费 `auth_service` 提供的授权上下文，执行飞书/语雀文档拉取并统一为同构文档 schema。
- `document_pipeline`：标准化、清洗、chunk 切分与相关度评分。
- `experience_pipeline`：fact 抽取、experience 聚合、经历排序。
- `highlight_pipeline`：highlight 生成、单条重写、evidence 绑定。
- `storage_layer`：中间结构持久化、状态存储、审计字段、会话清理。

## Goals / Non-Goals

**Goals:**
- 在 MVP 范围内完整定义 Session->Task->Result 的可执行链路与状态机。
- 明确 chunk/fact/experience/highlight 五层结构及跨层映射规则，保证可追溯。
- 定义跨平台适配层，保证飞书与语雀输出统一 schema、统一错误语义。
- 定义认证与授权模型，明确飞书 OAuth 与语雀手动 token 两条不同接入路径。
- 定义文档处理链路与 evidence 链路，确保每条 highlight 可查询依据。
- 定义 `partial_success` 的判定、响应格式与前端展示语义。
- 定义隐私与存储约束，满足私有化部署友好与数据可清理要求。

**Non-Goals:**
- 不定义最终模型参数调优、Prompt 文案微调实现细节。
- 不覆盖 MVP 之外平台（如 Notion、Google Docs）接入。
- 不定义复杂在线协同编辑、团队权限系统。
- 不引入“直接全文生成亮点”的旁路模式。
- 不将飞书与语雀强行统一为同一套 OAuth 认证实现。

## 认证与授权模型

### 平台认证方式（强制区分）
- 飞书：`OAuth -> auth_code -> user_access_token -> refresh_token` 生命周期管理。
- 语雀（MVP）：用户手动提供 `Access Token`，由后端执行校验、保存、删除与状态维护。
- `user_id` 仅用于身份标识，不作为文档读取凭证。
- 文档 URL / doc_id 不是访问授权依据；访问必须依赖有效授权上下文。

### auth_service 模块职责
- 飞书授权能力：
  - 生成授权地址
  - 处理回调与 `auth_code` 兑换
  - 刷新 token 与失效处理
- 语雀授权能力：
  - 校验 `Access Token` 可用性
  - 安全保存/替换/删除 token
  - 标记 token 状态（valid/invalid/revoked）
- 通用能力：
  - 查询平台授权状态（按用户、按 session）
  - 向 `platform_adapters` 提供最小化授权上下文（不暴露明文 token）
  - 提供授权错误标准化（`auth_required`、`token_expired`、`token_invalid`、`token_revoked`、`access_denied`）

### PlatformAuth 数据模型
- `platform`: `feishu | yuque`
- `auth_status`: `not_connected | connecting | connected | expired | invalid | revoked`
- `access_token_encrypted`: 加密后的 access token（后端托管）
- `refresh_token_encrypted`: 加密后的 refresh token（飞书必需，语雀可为空）
- `token_expire_at`: token 过期时间（语雀未知时允许空）
- `last_verified_at`: 最近一次成功验证时间
- 推荐补充字段：`user_id`、`session_id`、`created_at`、`updated_at`

## Decisions

### 决策 1：采用“平台适配层 + 统一文档模型”作为接入边界
选择：
- 为飞书与语雀分别实现 adapter，但统一输出 `DocumentRef` 与 `NormalizedDocument`。
- adapter 仅负责文档拉取与基础元数据映射，认证由 `auth_service` 统一提供授权上下文。
- adapter 必须只使用有效授权凭证访问资源，不接收“用户提供 ID”作为读取凭证。

原因：
- 满足 MVP 双平台同等支持，降低上层 pipeline 平台耦合。
- 便于后续扩展新平台，不改动核心分析链路。

备选方案：
- 直接在 pipeline 内分支判断平台类型。  
  放弃原因：平台逻辑污染核心链路，难以测试与维护。

### 决策 2：强制五层结构化中间层（doc/chunk/fact/experience/highlight）
选择：
- 文档解析后先落 `chunk`，再抽 `fact`，再聚合 `experience`，最后生成 `highlight`。
- 每层都持久化关键字段与上游引用 ID，禁止跨层“跳步直出”。

原因：
- 满足“禁止一步全文直出”的约束。
- 支撑 evidence 查询、质量审计、失败重跑与局部优化。

备选方案：
- 全文直接喂模型输出 highlight。  
  放弃原因：不可追溯、不可控、无法稳定支持 evidence 与 partial_success。

### 决策 3：以 Session + Task 实现异步编排与状态流
选择：
- `Session` 代表一次简历亮点生产上下文，`Task` 代表一次分析执行实例。
- 状态流遵循 `created -> importing -> parsing -> extracting -> merging -> generating -> completed|partial_success|failed`。
- 文档级状态独立跟踪，任务聚合时计算会话级状态。

原因：
- 满足多文档长链路执行与可观测性要求。
- 能隔离单文档失败并保留可用结果。

备选方案：
- 同步串行 API 一次返回全部结果。  
  放弃原因：超时风险高，失败不可恢复，用户体验差。

### 决策 4：将 `target_job` 与 `style` 作为生成与重写的硬输入
选择：
- `start-analysis` 与 `rewrite-highlight` 均要求显式参数校验。
- 生成模块先依据 `experience_ranker` 结果选材，再做风格与岗位定向表达。

原因：
- 满足“亮点而非摘要”的目标导向与差异化输出质量要求。
- 避免无参默认导致输出同质化。

备选方案：
- 参数可选，缺失时模型自判断。  
  放弃原因：不可预测，难满足验收中“风格/岗位有明显差异”。

### 决策 5：evidence 链路作为一等对象
选择：
- 在 `evidence_binder` 阶段为每条 highlight 绑定 `experience_id`、`fact_ids`、`chunk_ids`、`doc_id`。
- 提供 evidence 查询 API，返回原文片段、标题路径、来源文档信息。

原因：
- 支撑 Grounding / No Fabrication 约束。
- 允许用户审阅、质疑与修订，形成可解释闭环。

备选方案：
- 仅展示“来源可信”标签不返回具体证据。  
  放弃原因：无法满足明确 evidence 查询需求。

### 决策 6：partial_success 采用“文档级容错 + 会话级聚合”策略
选择：
- 每份文档可独立 `parsed|failed|skipped` 等状态。
- 当“成功文档数 >= 最小可用阈值（默认 1）且有可生成素材”时，session 置为 `partial_success` 并返回结果与失败明细。
- 若无可用素材则 `failed`。

原因：
- 在私有文档权限、内容质量波动场景中提升稳态可用性。

备选方案：
- 任一文档失败则整体失败。  
  放弃原因：鲁棒性差，不符合 master spec 容错流程。

### 决策 7：隐私优先存储与私有化部署友好
选择：
- 默认最小化持久化：保存结构化字段与 evidence 片段，不保存超范围全文副本。
- token 加密存储在 `PlatformAuth`，按平台与用户作用域隔离；`session/clear` 与授权删除操作需联动清理会话侧关联。
- 存储层抽象为可替换 backend（本地数据库/私有云数据库），不绑定公网依赖。
- 禁止记录明文 access token/refresh token 到日志、监控事件或调试输出。

原因：
- 满足隐私敏感用户预期与私有化环境部署约束。

备选方案：
- 全量原文长期存储便于复算。  
  放弃原因：隐私风险与合规成本高。

### 模块划分与职责边界
- `document_intake`: 校验 URL/授权信息，建立 `DocumentRef`。
- `auth_service`: 维护 `PlatformAuth`、飞书 OAuth、飞书 token 刷新、语雀 token 校验/保存/删除、授权状态查询。
- `platform_adapters`: 基于 `auth_service` 返回的授权上下文拉取平台文档并映射统一字段（标题、层级、正文块、更新时间等）。
- `document_normalizer`: 去平台噪音、统一格式、保留 `title_path`。
- `content_cleaner` + `chunker`: 清理低价值内容，切分 chunk 并计算 `relevance_score`。
- `fact_extractor`: 从 chunk 抽取动作、职责、技术、结果、指标与 evidence_text。
- `experience_merger` + `experience_ranker`: 跨文档聚合同经历并按相关性排序。
- `highlight_generator` + `highlight_rewriter`: 生成/重写面向岗位与风格的亮点文案。
- `evidence_binder`: 绑定并校验 highlight 的证据完整性。

### 数据流（标准链路）
1. `session/create` 记录 `target_job`、`styles`、期望条数。
2. 用户完成平台连接（飞书 OAuth 或语雀 token 录入校验），`auth_service` 写入 `PlatformAuth`。
3. 用户导入文档链接，系统先做平台识别与授权可用性检查，再建立 `DocumentRef` 列表。
4. orchestrator 驱动 adapter 拉取并输出 `NormalizedDocument`。
5. 进入清洗切片，得到 `Chunk[]`（含 title_path、relevance_score）。
6. 事实抽取得到 `Fact[]`（含 evidence_text 与 chunk_id）。
7. 聚合排序得到 `Experience[]`（保留 fact_ids、evidence_chunk_ids）。
8. 生成 `Highlight[]`（绑定 style、target_job、experience_id）。
9. evidence_binder 回填 `evidence_fact_ids`、`source_chunks`、`source_docs`。
10. `result` 与 `evidence` API 对外提供查询与编辑。

### 状态流（session/doc/highlight）
- `doc_status`：`pending -> auth_required|access_denied|pulling -> parsing -> parsed|failed|skipped`。
- `session_status`：`created -> importing -> parsing -> extracting -> merging -> generating -> completed|partial_success|failed`。
- `highlight_status`：`generated -> rewritten|edited -> saved|deleted`。
- 任何状态推进必须记录时间戳与原因码，便于错误定位与审计。

### session 与 task 编排
- 一个 session 可包含多个文档与多个 analysis task（首次生成、参数重跑）。
- task 幂等键：`session_id + target_job + styles + desired_highlight_count + doc_version_set`。
- 对已成功阶段支持断点续跑：优先复用结构化中间层，避免重复全文处理。

### 平台适配层设计
- `FeishuAdapter` 接口：
  - `getAuthUrl(session_id)`
  - `handleCallback(code/state)`
  - `refreshToken()`
  - `fetchDocument(document_ref)`
- `YuqueAdapter` 接口：
  - `verifyAccessToken(token)`
  - `saveAccessToken(token)`
  - `deleteAccessToken()`
  - `fetchDocument(document_ref)`
- 两类 adapter 不共享完全相同的认证接口；仅共享文档输出 schema 与错误语义约定。
- 统一错误分类：鉴权失败、权限不足、文档不存在、限流、网络异常、内容空。
- 统一重试策略：仅对可重试错误执行指数退避，鉴权类错误不重试。
- 权限策略：若用户无权限访问目标文档，返回标准权限错误并引导重新授权，不提供任何“绕过权限”分支。

### 文档处理链路设计
- 标准化阶段保留结构信息（标题层级、列表、代码块标记）以提升事实抽取准确率。
- chunk 策略：按语义段落合并，长度与信息密度双阈值控制；每个 chunk 强制记录来源路径。
- relevance 过滤：低分 chunk 可降权而非直接丢弃，避免误删关键信息。

### evidence 链路设计
- highlight 创建前执行 evidence 完整性校验：
  - 至少关联 1 个 `experience_id`
  - 至少关联 1 个 `fact_id`
  - fact 必须可回溯到 `chunk_id` 与 `doc_id`
- evidence 查询返回：
  - highlight 文案与参数（style/target_job）
  - 事实清单与原始 evidence_text
  - chunk 片段、title_path、source_doc 标识

## Risks / Trade-offs

- [双平台 API 差异导致接入不对齐] -> 通过 adapter 契约测试与统一错误码约束收敛差异。
- [结构化中间层带来存储与计算开销] -> 采用最小字段存储、TTL 清理与按需重跑控制成本。
- [partial_success 误用导致质量波动] -> 在结果中强制返回失败文档明细与质量告警标记。
- [style/target_job 差异不足] -> 在验收中加入差异性规则与对比测试样例。
- [证据链断裂] -> 在生成前执行 evidence 完整性 gate，不满足即阻断该条 highlight 输出。

## Migration Plan

1. 先落地认证与授权契约（`auth_service`、`PlatformAuth`、授权状态与错误码）。
2. 完成飞书最小接入验证（OAuth 回调、token 交换、刷新、最小文档读取闭环）。
3. 完成语雀最小接入验证（手动 token 校验、保存、删除、最小文档读取闭环）。
4. 再落地主接口与数据契约（session/doc/chunk/fact/experience/highlight/evidence）。
5. 启用 orchestrator 状态机与 partial_success 聚合逻辑。
6. 启用 evidence API 与前端展示链路。
7. 打开 session 清理与隐私策略（token 加密、最小化持久化）。

回滚策略：
- 以 feature flag 关闭新 pipeline，保留 session 创建与文档导入能力。
- 仅回滚新增生成链路，不破坏已存在的数据清理与安全策略。

## Open Questions

- `partial_success` 最小可用阈值是否固定为 1 份成功文档，还是按用户导入总量动态调整。
- 默认返回 highlights 数量不足期望值时，前端是提示“可补充文档”还是建议“切换 style/target_job 重试”。
- evidence 查询接口是否需要支持批量查询（按 `session_id` 一次返回全部 highlights 的 evidence 摘要）。
- 语雀 token 方案是否已通过实际接口验证，且是否稳定满足目标文档读取需求。
