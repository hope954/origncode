## Why

当前简历准备过程里，用户的高价值经历长期分散在飞书与语雀私有文档中，人工回溯、归纳、改写成本高且容易遗漏证据。  
基于 `docs/master-spec-private-doc-resume-highlights.md`，需要先定义一个可私有化部署、可追溯证据、可按岗位与风格输出“简历亮点”的 MVP 级技术方案，作为后续分阶段实现基线。

## What Changes

- 新增面向 MVP 的端到端能力定义：飞书与语雀文档接入、统一标准化、结构化处理中间层（chunk/fact/experience/highlight）、亮点生成与重写、证据查询。
- 明确“输出目标是简历亮点而非摘要”，并强制 `target_job` 与 `style` 作为生成与重写输入参数。
- 引入 session 与 task 编排、状态机与 `partial_success` 语义，保证文档级失败时仍可返回可用结果。
- 新增隐私与存储约束：最小化存储、可清理、token 安全与私有化部署友好。
- 新增访问控制合规约束：仅允许通过飞书/语雀官方授权流程访问文档，禁止任何绕过权限检查的实现方案。
- 明确禁止“全文一步直出最终结果”的黑盒流程，必须保留结构化中间层与可追溯 evidence 链路。

## Capabilities

### New Capabilities

- `dual-platform-document-intake`: 定义飞书与语雀在 MVP 内同等支持的接入、授权、导入与拉取解析行为。
- `structured-resume-highlight-pipeline`: 定义从文档到 chunk/fact/experience/highlight 的五层结构化处理与亮点生成行为。
- `evidence-traceability-and-query`: 定义 highlight 到 experience/fact/chunk/doc 的证据绑定与查询接口行为。
- `session-task-orchestration-and-partial-success`: 定义 session/task 生命周期、状态机与 partial_success 返回规则。
- `privacy-first-storage-and-self-hosting`: 定义私有化部署友好的存储边界、数据最小化与会话清理要求。

### Modified Capabilities

- 无（当前仓库无既有 capability specs，需要新增）。

## Impact

- 影响系统边界：`frontend_app`、`analysis_orchestrator`、`platform_adapters`、`document_pipeline`、`experience_pipeline`、`highlight_pipeline`、`storage_layer`。
- 影响接口契约：会话创建、授权地址、授权回调、导入文档、拉取解析、发起分析、结果查询、证据查询、单条重写、保存/删除亮点、清空会话。
- 影响数据模型：`Session`、`DocumentRef`、`NormalizedDocument`、`Chunk`、`Fact`、`Experience`、`Highlight` 及其映射关系。
- 影响非功能约束：隐私安全、稳定性、输出质量、可追溯性与私有化部署兼容性。
