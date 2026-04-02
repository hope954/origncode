## 1.5 基础收口（API 与职责边界）

- [x] 1.5.1 收敛 `auth_service` 与 `platform_adapters`：认证仅 auth_service；适配器仅拉取与映射
- [x] 1.5.2 统一文档导入路径为 `POST /api/docs/import`；明确 `POST /api/auth/refresh` 仅 Feishu
- [x] 1.5.3 README / 代码注释标注 mock 与真实接入替换点；补充错误分支测试

## 1. 变更骨架与契约基线

- [x] 1.1 建立模块目录骨架（frontend_app、analysis_orchestrator、auth_service、platform_adapters、document_pipeline、experience_pipeline、highlight_pipeline、storage_layer）
- [x] 1.2 定义核心数据模型契约（Session、PlatformAuth、DocumentRef、NormalizedDocument、Chunk、Fact、Experience、Highlight）
- [x] 1.3 定义统一错误码与通用响应结构（含 partial_success 语义）
- [x] 1.4 建立状态机枚举与状态流转校验（doc_status、session_status、highlight_status，且 doc_status 明确包含 auth_required/access_denied/parsing）

## 2. 会话与任务编排

- [x] 2.1 实现 `session/create` 契约并校验必填参数（target_job、styles、desired_highlight_count）
- [x] 2.2 实现分析任务创建与异步执行入口（task_id 返回、轮询查询）
- [x] 2.3 实现会话级状态推进与文档级状态聚合
- [x] 2.4 实现 `partial_success` 判定与失败文档明细回传

## 3. 双平台接入（MVP 必做）

- [x] 3.1 实现 `auth_service` 的飞书授权地址获取与回调处理，并写入飞书授权状态
- [x] 3.2 实现 `auth_service` 的飞书 token 刷新与失效处理
- [x] 3.3 实现 `auth_service` 的语雀 Access Token 录入、校验、保存、删除
- [x] 3.4 实现 `auth_service` 的通用授权状态查询（按平台返回 auth_status 与 last_verified_at）
- [x] 3.5 完成飞书最小接入验证（OAuth 回调、token 交换、最小文档读取闭环）
- [x] 3.6 完成语雀最小接入验证（手动 token 校验、保存/删除、最小文档读取闭环）
- [x] 3.7 实现飞书文档拉取与统一 schema 映射
- [x] 3.8 实现语雀文档拉取与统一 schema 映射
- [x] 3.9 补齐双平台契约一致性测试（输出 schema 与错误语义一致，认证接口保持差异化）
- [x] 3.10 增加权限合规门禁：禁止绕过平台权限检查，未授权访问必须失败

## 4. 文档处理链路（结构化中间层）

- [x] 4.1 实现 `document_normalizer`（格式统一、标题路径保留）
- [x] 4.2 实现 `content_cleaner`（噪音清理与低价值内容过滤规则）
- [x] 4.3 实现 `chunker`（语义切片、长度控制、relevance_score 打分）
- [x] 4.4 持久化 chunk 层并建立 chunk -> doc 映射索引

## 5. 事实抽取与经历聚合

- [x] 5.1 实现 `fact_extractor`（动作、职责、技术、成果、指标、evidence_text）
- [x] 5.2 持久化 fact 层并建立 fact -> chunk 映射索引
- [x] 5.3 实现 `experience_merger`（跨文档聚合同经历）
- [x] 5.4 实现 `experience_ranker`（与 target_job 相关性排序）
- [x] 5.5 持久化 experience 层并保留 experience -> fact/chunk 映射

## 6. 简历亮点生成与重写

- [x] 6.1 实现 `highlight_generator`（基于 experience 输入生成 3-5 条简历亮点）
- [x] 6.2 强制生成入口显式传入 `target_job` 与 `style`
- [x] 6.3 实现 `highlight_rewriter`（单条重写，禁止脱离原 evidence）
- [x] 6.4 持久化 highlight 层并记录参数快照（target_job/style）

## 7. Evidence 链路与查询

- [x] 7.1 实现 `evidence_binder`（highlight -> experience -> fact -> chunk -> doc 绑定）
- [x] 7.2 实现 evidence 完整性校验 gate（不完整则阻断该条输出）
- [x] 7.3 实现 `resume/evidence` 查询接口并返回结构化证据 payload
- [ ] 7.4 实现结果页 evidence 展示与来源回溯交互

## 8. 结果编辑与会话清理

- [ ] 8.1 实现单条亮点保存接口（保留编辑状态）
- [ ] 8.2 实现单条亮点删除接口（软删或硬删策略按存储约束执行）
- [ ] 8.3 实现 `session/clear` 接口级联清理中间层与结果数据
- [ ] 8.4 验证编辑后 evidence 可追溯性不被破坏

## 9. 隐私与存储约束落地

- [x] 9.1 实现 token 安全存储与传输保护（加密、过期、作用域隔离）
- [x] 9.2 实现 `PlatformAuth` 落库与加密存储（access_token_encrypted、refresh_token_encrypted、token_expire_at、last_verified_at）
- [x] 9.3 实现最小化存储策略（仅保留必要结构化字段与证据片段）
- [ ] 9.4 提供私有化部署配置说明（存储后端、环境变量、网络边界）
- [ ] 9.5 增加隐私与安全审计检查项（访问日志、异常告警、清理确认）
- [ ] 9.6 增加凭证安全策略：不接收明文长期 token 输入，不在日志/报错中暴露 token

## 10. 验收与回归

- [ ] 10.1 构建 MVP 功能验收清单（飞书+语雀、target_job/style、evidence、partial_success）
- [ ] 10.2 构建质量验收清单（grounding、无编造、风格/岗位差异性）
- [ ] 10.3 构建安全验收清单（token、会话清理、最小化存储）
- [ ] 10.4 执行端到端回归并固化发布门禁（全部通过方可进入 apply 阶段）
