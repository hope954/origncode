下面是一份 **面向 Open Spec / AI coding agent 可直接复制使用的最终版 Master Spec**。
我已经按“给 AI 看、也给你看得懂”的方式整理好了：

* 业务描述用中文
* 字段名 / 枚举 / 接口名保留英文
* 尽量减少歧义
* 明确 MVP 必做项
* 明确输入输出、状态、约束、验收

你可以把这份当作：

1. Open Spec 的主输入文档
2. Cursor / AI agent 的总需求文档
3. 后续拆前后端 / 接口 / Prompt 的母版

---

# Master Spec｜私人文档智能解析与简历亮点提取系统

**Spec Name**: private-doc-resume-highlights
**Spec Version**: v1.0
**Language**: zh-CN
**Primary Audience**: Open Spec / AI coding agent / Cursor / LLM
**Secondary Audience**: 产品经理 / 工程师 / 设计师
**Priority**: MVP first
**Deployment Preference**: 私有化部署 / 用户可控环境优先

---

# 1. 项目定义

## 1.1 一句话定义

构建一个可私有化部署的智能工具，支持读取用户授权的 **飞书文档** 与 **语雀文档**，对多篇私有文档进行联合解析与理解，提取用户经历中的项目、职责、动作、技术栈、难点、成果与指标，并生成 **3～5 条可直接用于简历的专业亮点描述**。

## 1.2 核心目标

系统要解决的不是“文档总结”问题，而是“**从私有文档中提取简历亮点**”问题。

输出结果必须满足以下要求：

* 可直接写进简历
* 表达专业
* 简洁有力
* 优先包含动作、方法、结果
* 有证据链可追溯
* 支持不同岗位方向与输出风格
* 不编造事实，不编造数字

## 1.3 产品定位

这是一个 **简历导向的私有文档智能提炼系统**，不是通用文档摘要工具，不是通用知识库，不是简历排版器。

---

# 2. 问题陈述

目标用户通常在实习、项目、课程、学习过程中，积累了大量分散在飞书与语雀中的文档，例如：

* 工作笔记
* 周报 / 日报
* 复盘文档
* 项目记录
* 需求文档
* 技术说明
* 会议纪要
* 学习总结

这些内容具有很高的经历价值，但存在以下问题：

1. **分散**：内容散落在多篇文档中，难以人工一次性梳理
2. **私有**：文档有权限控制，外部通用 AI 工具无法直接读取
3. **口语化**：原始记录通常不适合直接写进简历
4. **缺乏提炼**：用户往往写得出过程，但写不出亮点、结果和价值
5. **时间紧**：用户希望几分钟内完成高质量整理，而不是手工翻文档数小时

因此，本系统需要从多篇私有文档中自动生成 **简历亮点**，而不是普通摘要。

---

# 3. 目标用户

## 3.1 核心用户

* 在校大学生，尤其是大三 / 大四 / 研一 / 研二
* 实习求职用户
* 有真实经历但不会提炼简历亮点的人
* 文档主要存放在飞书 / 语雀中
* 对隐私和安全敏感的用户

## 3.2 用户目标

用户希望：

1. 不必手动复制所有文档内容
2. 系统能自动读取多篇私有文档
3. 系统能从文档中提取值得写进简历的事实
4. 系统输出的是简历风格，而不是摘要风格
5. 可以根据目标岗位生成不同表达版本
6. 可以查看每条亮点的来源依据
7. 可以自己编辑、复制、导出结果

---

# 4. MVP 范围

## 4.1 In Scope（MVP 必做）

MVP 必须支持以下能力，缺一不可：

1. **飞书文档接入**
2. **语雀文档接入**
3. 手动输入多个文档 URL
4. 平台授权读取私有文档
5. 多文档批量处理
6. 文档抓取与解析
7. 文档清洗与切片
8. 从文档中提取经历事实
9. 跨文档聚合相同经历
10. 生成 **3～5 条简历亮点**
11. 支持输出风格：

* `concise`
* `technical`
* `business`

12. 支持目标岗位方向：

* `generic`
* `engineering`
* `product`
* `operations`

13. 支持证据链查看
14. 支持单条复制 / 全部复制
15. 支持单条编辑 / 删除
16. 支持单条重写
17. 支持 Markdown 或纯文本导出
18. 支持私有化 / 自托管部署兼容
19. 只申请只读权限
20. 支持 `partial_success`

## 4.2 Out of Scope（MVP 不做）

以下能力不属于首期必须范围：

1. 完整简历排版编辑器
2. 自动投递岗位
3. 社区分享 / 模板市场
4. 多人协作空间
5. Word / PDF 精美模板导出
6. 完全离线模型推理（除非额外指定）
7. 所有文档平台的一次性接入
8. 完整 JD 匹配评分系统
9. 自动生成全套简历各模块

---

# 5. 非功能性要求

## 5.1 隐私与安全

系统必须满足：

1. 只读取用户授权范围内的文档
2. 只申请 **read-only** 权限
3. 不修改源文档
4. 不默认依赖不可控第三方 SaaS
5. 支持用户可控部署环境
6. 默认最小化数据保留
7. 普通日志中不得打印文档全文与敏感 token
8. 支持会话数据清理

## 5.2 稳定性

1. 部分文档失败不能导致整体任务失败
2. 文档拉取、解析、生成需要分阶段可观测
3. 错误码和错误信息必须结构化
4. 中间结果应支持调试与回溯

## 5.3 输出质量

1. 生成结果必须是简历风格，而不是普通摘要
2. 不允许编造数字
3. 不允许无依据夸大为“主导”“独立负责”
4. 优先输出动作明确、结果明确、与岗位相关度高的亮点
5. Top 排名结果必须具备证据链

---

# 6. 认证与授权模型

## 6.1 章节目标

本章节用于定义系统访问飞书与语雀私有文档时的认证、授权、凭证管理与访问控制规则。

本系统必须通过**平台官方支持的授权方式**或**用户显式提供的有效访问令牌**读取私有文档，不能绕过飞书或语雀的权限检查机制。

本系统访问私有文档的前提不是“知道文档 URL”或“知道用户 ID”，而是：

1. 用户已完成平台授权，或已提供有效访问令牌
2. 授权凭证对目标文档具有读取权限
3. 系统仅在用户原有权限范围内读取文档
4. 读取过程仅使用最小必要的只读权限

## 6.2 总体原则

### 6.2.1 不绕过平台权限

系统不得设计、实现或依赖任何绕过飞书或语雀权限检查的方案。

### 6.2.2 不以 `user_id` 作为访问凭证

`user_id` 仅可作为用户标识，不能作为读取私有文档的访问凭证。  
系统不能根据 `user_id` 直接读取用户私有文档。

### 6.2.3 必须基于授权凭证访问

读取私有文档时，必须使用以下二者之一：

* 平台官方授权流程获取的 token
* 用户显式提供并经校验有效的 access token

### 6.2.4 权限范围受用户原始权限约束

系统只能读取用户本身已有权限的文档。  
若用户对某篇文档无权限，即使系统知道该文档的 URL、doc_id 或其他标识，也不得读取。

### 6.2.5 最小权限原则

系统只申请完成读取操作所需的最小必要权限，优先采用 **read-only** 权限。  
MVP 阶段不得申请写入、编辑、删除、移动、共享等非必要权限。

### 6.2.6 后端安全保存凭证

所有 token、refresh token、授权状态与验证信息必须由后端安全保存：

* 不允许在前端长期明文持久化
* 不允许写入普通日志
* 不允许在错误信息中暴露 token
* 必须支持删除、替换、失效和撤销处理

### 6.2.7 用户可撤销与可清理

用户必须能够：

* 删除平台连接
* 替换 Access Token
* 重新授权
* 清理会话数据
* 终止后续对该平台文档的读取能力

## 6.3 平台支持范围

MVP 阶段必须支持以下平台：

* `feishu`
* `yuque`

飞书与语雀都属于 MVP 必做能力，不可将语雀降级为后续版本。

## 6.4 飞书认证模型

### 6.4.1 目标

飞书文档读取必须基于**官方 OAuth / 授权码 / 用户访问令牌**机制设计。

### 6.4.2 推荐实现方式

飞书采用以下授权链路：

1. 用户点击“连接飞书”
2. 前端跳转飞书授权页面
3. 用户在飞书侧确认授权
4. 飞书回调系统并返回 `auth_code`
5. 后端使用 `auth_code` 交换 `user_access_token`
6. 后端在文档读取请求中使用 `user_access_token`
7. token 过期后，后端执行刷新流程或要求用户重新授权

### 6.4.3 飞书需要维护的凭证字段

系统建议维护以下字段：

* `platform = feishu`
* `auth_code`
* `user_access_token`
* `refresh_token`（如平台流程要求或支持）
* `token_expire_at`
* `auth_status`
* `last_verified_at`

### 6.4.4 飞书访问约束

1. 不允许写成“根据 `user_id` 读取飞书文档”
2. 不允许写成“根据 `doc_id` 直接访问私有飞书文档”
3. 飞书文档读取必须依赖有效的 `user_access_token`
4. token 过期后不得继续读取，必须刷新或重新授权
5. 若用户在飞书侧撤销授权，系统必须将连接状态更新为不可用

## 6.5 语雀认证模型

### 6.5.1 目标

语雀在 MVP 阶段优先采用“**用户手动提供 Access Token**”方案。

### 6.5.2 采用该方案的原因

在当前 MVP 方案中，不假定语雀存在一个已验证、与你的产品完全兼容且可直接落地的官方 OAuth 集成流程。
因此，MVP 阶段优先采用“用户提供 token、后端校验并安全存储”的方案，以降低接入不确定性并加快验证速度。

### 6.5.3 推荐实现方式

语雀采用以下流程：

1. 用户在语雀账户中创建或复制自己的 `Access Token`
2. 用户在系统的“连接语雀”配置入口中粘贴该 token
3. 后端调用语雀相关接口校验 token 是否有效
4. 校验通过后，后端安全保存该 token
5. 后端在知识库/文档读取请求中使用该 token
6. 若 token 失效、被删除、被撤销或权限不足，系统提示用户重新配置

### 6.5.4 语雀需要维护的凭证字段

系统建议维护以下字段：

* `platform = yuque`
* `yuque_access_token`
* `token_expire_at`（若平台无法提供明确过期时间，可为空）
* `auth_status`
* `last_verified_at`

### 6.5.5 语雀访问约束

1. 系统不能假设任意语雀文档都可访问
2. 语雀文档读取必须受 token 所属用户权限限制
3. 若 token 无效、失效、撤销或权限不足，必须拒绝读取
4. token 必须支持以下操作：

   * 校验
   * 替换
   * 删除
   * 重新验证

## 6.6 文档访问前置条件

系统在尝试读取任意文档之前，必须完成以下检查。

### 6.6.1 平台可识别

文档 URL 必须可识别为支持的平台之一：

* `feishu`
* `yuque`

否则返回：

* `unsupported_platform`
* `invalid_url`

### 6.6.2 授权存在

对应平台必须存在有效授权上下文：

* 飞书：有效 `user_access_token`
* 语雀：有效 `yuque_access_token`

否则返回：

* `auth_required`

### 6.6.3 凭证有效

token 必须处于有效状态，未过期、未失效、未撤销。

否则返回：

* `token_expired`
* `token_invalid`
* `token_revoked`

### 6.6.4 对目标文档具有访问权限

即使 token 存在，若该 token 无权访问目标文档，也必须拒绝读取。

否则返回：

* `access_denied`

## 6.7 授权状态模型

系统必须为每个平台维护独立授权状态，建议使用字段：

`platform_auth_status`

可选枚举值如下：

* `not_connected`
* `connecting`
* `connected`
* `expired`
* `invalid`
* `revoked`

### 6.7.1 状态说明

#### `not_connected`

用户尚未连接该平台，或从未配置过授权信息。

#### `connecting`

正在执行授权、token 校验或等待平台回调。

#### `connected`

授权信息有效，可用于读取用户权限范围内的文档。

#### `expired`

token 已过期，需要刷新或重新授权。

#### `invalid`

token 不合法、校验失败或已不可用。

#### `revoked`

用户主动删除授权，或平台侧已撤销授权。

## 6.8 Token 生命周期管理

### 6.8.1 飞书

对于飞书，需要显式管理 token 生命周期：

1. 保存 `user_access_token`
2. 保存 `refresh_token`（如流程要求）
3. 保存 `token_expire_at`
4. 每次访问前检查是否过期
5. token 过期时优先尝试刷新
6. 刷新失败时要求用户重新授权

### 6.8.2 语雀

对于语雀，MVP 阶段按如下方式管理：

1. 保存用户提供的 `yuque_access_token`
2. 在读取前或按周期校验 token 可用性
3. 校验失败时更新状态为 `invalid` 或 `revoked`
4. 用户重新输入新 token 后覆盖旧 token

## 6.9 Token 安全存储要求

所有平台凭证必须满足以下要求：

1. 只允许后端保存，不允许前端长期持久化
2. 不得在普通日志中打印 token 明文
3. 数据库存储时必须加密，或使用密钥管理机制
4. 不得在错误堆栈或调试信息中暴露 token
5. 删除授权时必须同时清除对应 token
6. 用户更换 token 时，旧 token 必须失效或被覆盖

## 6.10 平台连接管理

系统必须提供“平台连接管理”能力，供用户查看和管理授权状态。

### 6.10.1 飞书必须支持的操作

* 连接飞书
* 查看当前连接状态
* 重新授权
* 断开连接

### 6.10.2 语雀必须支持的操作

* 配置 token
* 校验 token
* 替换 token
* 删除 token
* 查看当前连接状态

### 6.10.3 模块建议

建议在设置页或导入页中提供独立模块：

`platform_connection_manager`

该模块至少展示：

* 平台名称
* 当前授权状态
* 最近验证时间
* 对应操作入口

## 6.11 接口要求

为支撑认证与授权模型，系统必须提供以下接口。

### 6.11.1 飞书相关接口

* `GET /api/auth/url?platform=feishu`
* `POST /api/auth/callback`
* `POST /api/auth/refresh?platform=feishu`

### 6.11.2 语雀相关接口

* `POST /api/auth/yuque/token/verify`
* `POST /api/auth/yuque/token/save`
* `POST /api/auth/yuque/token/delete`

### 6.11.3 通用授权状态接口

* `GET /api/auth/status`

该接口应返回每个平台当前的 `platform_auth_status` 以及必要的元信息。

## 6.12 错误码与错误场景

认证与授权相关错误必须结构化返回，至少包括：

* `auth_required`
* `access_denied`
* `token_expired`
* `token_invalid`
* `token_revoked`
* `unsupported_platform`
* `invalid_url`

### 6.12.1 错误处理要求

1. 错误必须按文档粒度返回，不影响其他文档处理
2. 若一个平台未连接，不应阻塞另一平台已连接文档的处理
3. 若部分文档因权限失败，但其他文档可读取，整体状态应允许返回 `partial_success`

## 6.13 对主分析流程的影响

认证与授权不是外围功能，而是文档处理主流程的前置条件。

主流程必须调整为：

1. 用户创建会话
2. 用户连接飞书或配置语雀 token
3. 系统检查授权状态
4. 用户输入文档 URL
5. 系统基于授权上下文校验文档可访问性
6. 系统读取文档内容
7. 读取成功后才可进入后续链路：

   * `NormalizedDocument`
   * `Chunk`
   * `Fact`
   * `Experience`
   * `Highlight`

这意味着：

**未通过授权检查的文档，不得进入文档解析与生成链路。**

## 6.14 对任务拆解的要求

Open Spec 的 `tasks.md` 中必须新增“认证与权限系统”阶段，至少包含以下任务：

1. 实现飞书 OAuth 授权与 token 交换
2. 实现飞书 token 刷新与失效处理
3. 实现语雀 token 录入、校验与安全存储
4. 实现统一的授权状态查询接口
5. 实现基于授权上下文的文档访问控制
6. 实现 token 删除、替换与清理能力

## 6.15 验收要求

只有同时满足以下条件，认证与授权模型才算通过验收：

1. 飞书文档读取基于官方授权 token，而不是 `user_id`
2. 语雀文档读取基于用户提供并校验通过的 token
3. 无有效授权时，系统拒绝读取私有文档
4. 权限不足时，系统返回 `access_denied`
5. token 失效时，系统返回对应状态并要求刷新或重新配置
6. 用户可删除授权或替换 token
7. 普通日志中不出现 token 明文
8. 文档读取严格受用户原有权限范围约束

# 7. 核心用户流程

## 7.1 主流程

1. 用户进入系统
2. 创建一个分析会话
3. 用户输入飞书 / 语雀文档 URL，或完成授权
4. 系统校验文档链接与权限
5. 系统抓取文档内容
6. 系统解析并标准化文档
7. 系统清洗并切分文档内容
8. 系统抽取经历事实
9. 系统跨文档合并同一经历
10. 系统生成 3～5 条简历亮点
11. 用户查看结果
12. 用户查看证据链
13. 用户编辑 / 删除 / 复制 / 重写
14. 用户导出结果或结束会话

## 7.2 容错流程

若某些文档失败：

* 失败文档要单独标记
* 成功文档继续处理
* 若剩余可用文档足够，则返回 `partial_success`
* 仅当所有文档都不可用时返回 `failed`

---

# 8. 业务规则

## 8.1 文档接入规则

1. 平台必须支持：

   * `feishu`
   * `yuque`
2. URL 必须能识别平台来源
3. 重复文档在同一会话内不可重复导入
4. 无权限文档不可继续抓取
5. 单篇文档内容为空或过短时，可标记低质量或失败
6. 单次会话支持的最大文档数可配置，默认建议 20

## 8.2 内容筛选规则

### 高优先级内容

* 项目背景
* 任务分工
* 技术方案
* 问题与解决
* 优化动作
* 阶段复盘
* 指标结果
* 需求推进记录
* 协同推进记录

### 低优先级内容

* 寒暄
* 闲聊
* 无实质内容的会议记录
* 空泛打卡
* 情绪性日记
* 与本人经历无关的转载材料
* 重复模板话术

## 8.3 事实抽取规则

1. 优先抽取原子化事实，不要一段文本只提炼成一个巨大的混合事实
2. 每条事实都要尽可能保留证据文本
3. 若无法确认是用户本人完成，则降低置信度
4. 若无法确认结果归因，则使用保守表达
5. 若没有明确数字，不能补数字

## 8.4 经历聚合规则

1. 同一项目下可以产生多条经历，不强制只合并成一条
2. 仅在证据充分时合并跨文档事实
3. 语义相似但业务上不同的事实不能误合并
4. 高度重复表达应去重
5. 聚合结果必须保留 fact → experience 的映射

## 8.5 亮点生成规则

1. 输出默认 3～5 条
2. 若信息不足，可降级为 1～3 条
3. 每条亮点要尽量符合：

   * 动词开头
   * 有动作
   * 有方法
   * 有结果
   * 有技术栈或业务价值
4. 没有量化指标时，允许结果型中性表达，但不能编造数字
5. 输出不能是流水账
6. 输出不能是纯摘要
7. 输出不能过长，需适合直接粘贴到简历中

## 8.6 归因规则

如果材料无法证明用户“主导”：

* 优先使用：

  * 参与
  * 协同推进
  * 负责支持
  * 参与实现
  * 贡献于
* 避免使用：

  * 主导
  * 全权负责
  * 独立完成
  * 牵头推动

---

# 9. 输出风格与岗位方向

## 9.1 输出风格 `style`

### `concise`

特点：

* 简洁
* 通用
* 少堆砌术语
* 强调一条亮点的清晰表达

### `technical`

特点：

* 更强调技术栈
* 更强调实现方式、工程细节、优化动作
* 更贴近技术岗表达

### `business`

特点：

* 更强调业务背景
* 更强调效率提升、流程优化、用户价值、业务影响
* 更贴近产品 / 运营表达

## 9.2 目标岗位 `target_job`

### `generic`

通用版，不强偏任何岗位

### `engineering`

优先强调：

* 技术栈
* 实现方案
* 性能优化
* 系统设计
* 工程交付

### `product`

优先强调：

* 需求分析
* 方案拆解
* 跨团队协作
* 推进落地
* 结果闭环

### `operations`

优先强调：

* 运营执行
* 内容策略
* 活动推进
* 流程优化
* 效率 / 转化 / 覆盖

---

# 10. 系统架构要求

系统建议拆分为以下模块，每个模块职责必须清晰，避免耦合：

## 10.1 `frontend_app`

负责：

* URL 输入
* 授权入口
* 文档状态展示
* 结果展示
* 证据查看
* 编辑 / 删除 / 复制 / 导出

## 10.2 `analysis_orchestrator`

负责：

* 创建和管理分析会话
* 调度整条分析链路
* 汇总各阶段结果
* 处理 partial_success
* 输出最终结果

## 10.3 `platform_adapters`

必须包含：

* `feishu_adapter`
* `yuque_adapter`

负责：

* 平台识别
* 文档抓取
* 授权校验
* 平台错误映射
* 输出统一文档结构

## 10.4 `document_pipeline`

负责：

* 文档标准化
* 清洗
* chunk 切分
* relevance 打分

## 10.5 `experience_pipeline`

负责：

* fact 抽取
* experience 聚合
* experience 排序

## 10.6 `highlight_pipeline`

负责：

* highlight 生成
* 单条重写
* style / target_job 调整
* evidence 绑定

## 10.7 `storage_layer`

负责：

* session
* document metadata
* chunk
* fact
* experience
* highlight
* auth metadata
* config

---

# 11. 数据流要求

核心数据流必须采用分阶段结构，不能让模型直接从原始全文一步输出最终亮点。

## 11.1 标准数据流

```text
Document URL / Auth
→ platform adapter
→ normalized document
→ chunk list
→ fact list
→ experience list
→ highlight list
→ editable result
```

## 11.2 保留中间结构的理由

必须保留以下中间结构：

* `NormalizedDocument`
* `Chunk`
* `Fact`
* `Experience`
* `Highlight`

因为系统必须具备：

1. 可解释性
2. 可调试性
3. 可部分重算
4. 可证据追踪
5. 可评估质量

---

# 12. 核心数据模型

---

## 12.1 `Session`

```json
{
  "session_id": "string",
  "user_id": "string|null",
  "target_job": "generic|engineering|product|operations",
  "styles": ["concise", "technical", "business"],
  "desired_highlight_count": 5,
  "status": "created|importing|parsing|extracting|merging|generating|completed|partial_success|failed",
  "created_at": "string",
  "updated_at": "string"
}
```

---

## 12.2 `DocumentRef`

```json
{
  "doc_id": "string",
  "session_id": "string",
  "platform": "feishu|yuque",
  "url": "string",
  "title": "string|null",
  "status": "pending_validation|invalid_url|unauthorized|supported|fetching|fetch_failed|fetched|parsing|parse_failed|parsed",
  "error_code": "string|null",
  "error_message": "string|null"
}
```

---

## 12.3 `NormalizedDocument`

```json
{
  "doc_id": "string",
  "platform": "feishu|yuque",
  "title": "string",
  "url": "string",
  "sections": [
    {
      "section_id": "string",
      "title_path": ["string"],
      "raw_text": "string",
      "cleaned_text": "string",
      "block_type": "paragraph|list|table|heading|code|quote|unknown",
      "order": 1
    }
  ],
  "metadata": {
    "author": "string|null",
    "created_at": "string|null",
    "updated_at": "string|null"
  }
}
```

---

## 12.4 `Chunk`

```json
{
  "chunk_id": "string",
  "doc_id": "string",
  "title_path": ["string"],
  "cleaned_text": "string",
  "relevance_score": 0.0,
  "quality_score": 0.0,
  "candidate_tags": ["project", "task", "result", "metric", "tech_stack"]
}
```

---

## 12.5 `Fact`

```json
{
  "fact_id": "string",
  "chunk_id": "string",
  "project_name": "string|null",
  "background": "string|null",
  "user_role": "string|null",
  "action": "string|null",
  "tool_stack": ["string"],
  "challenge": "string|null",
  "solution": "string|null",
  "result": "string|null",
  "metric": "string|null",
  "collaboration": "string|null",
  "evidence_text": "string",
  "confidence": 0.0
}
```

---

## 12.6 `Experience`

```json
{
  "experience_id": "string",
  "project_name": "string|null",
  "summary_theme": "string",
  "fact_ids": ["string"],
  "merged_background": "string|null",
  "merged_actions": ["string"],
  "merged_tool_stack": ["string"],
  "merged_challenges": ["string"],
  "merged_solutions": ["string"],
  "merged_results": ["string"],
  "merged_metrics": ["string"],
  "evidence_chunk_ids": ["string"],
  "confidence_score": 0.0
}
```

---

## 12.7 `Highlight`

```json
{
  "highlight_id": "string",
  "experience_id": "string",
  "style": "concise|technical|business",
  "target_job": "generic|engineering|product|operations",
  "title": "string|null",
  "content": "string",
  "evidence_fact_ids": ["string"],
  "confidence_score": 0.0,
  "is_edited": false,
  "original_content": "string",
  "final_content": "string"
}
```

---

# 13. 模块行为规范

---

## 13.1 模块 A：文档接入 `document_intake`

### 输入

* 多个文档 URL
* 或授权后的平台文档选择结果

### 输出

* `DocumentRef[]`

### 约束

1. 支持飞书与语雀
2. 能识别 URL 所属平台
3. 重复 URL 不重复导入
4. 每个文档独立维护状态
5. 错误必须结构化

---

## 13.2 模块 B：平台适配 `platform_adapters`

### 必须实现

* `feishu_adapter`
* `yuque_adapter`

### 输入

* `platform`
* `url` 或平台文档 ID
* 授权上下文

### 输出

* `NormalizedDocument`

### 约束

1. 飞书与语雀输出必须统一 schema
2. 平台私有细节不可泄漏到上层业务模块
3. 权限不足、链接无效、平台异常必须映射为统一错误类型

---

## 13.3 模块 C：文档标准化 `document_normalizer`

### 目标

将平台原始文档结构转成统一 sections。

### 规则

1. 尽可能保留标题层级
2. 尽可能保留列表语义
3. 表格可转为文本，但要尽量保留行语义
4. 去掉纯视觉格式
5. 去掉空白块

---

## 13.4 模块 D：内容清洗与切片 `content_cleaner` + `chunker`

### 目标

生成适合抽取事实的 chunk。

### 规则

1. 去除明显噪音
2. 不要过度删除潜在有价值内容
3. chunk 应适中，既不能太碎，也不能过长
4. 每个 chunk 要保留 `title_path`
5. 要对 chunk 进行 `relevance_score` 打分

---

## 13.5 模块 E：事实抽取 `fact_extractor`

### 目标

从 chunk 中提取简历相关事实。

### 必抽字段

尽量抽取：

* `project_name`
* `action`
* `tool_stack`
* `challenge`
* `solution`
* `result`
* `metric`
* `evidence_text`

### 规则

1. 抽取尽量原子化
2. 证据文本必须保留
3. 无法确认归因时降低 `confidence`
4. 禁止编造缺失字段

---

## 13.6 模块 F：经历聚合 `experience_merger`

### 目标

将属于同一经历的 facts 合并。

### 聚合信号

* 项目名相同或相近
* 背景相同
* 时间范围接近
* 技术栈相似
* 动作目标相近
* 结果目标相近

### 规则

1. 不因文本相似就盲目合并
2. 同一项目下允许多个不同经历
3. 合并后要保留全部 fact_id 映射

---

## 13.7 模块 G：经历排序 `experience_ranker`

### 排序依据

优先级从高到低建议为：

1. 有明确结果
2. 有明确指标
3. 动作具体
4. 与目标岗位相关
5. 证据覆盖强
6. 置信度高

---

## 13.8 模块 H：亮点生成 `highlight_generator`

### 输入

* `Experience[]`
* `style`
* `target_job`

### 输出

* `Highlight[]`

### 规则

1. 亮点必须是简历语言，不是摘要语言
2. 每条要简短、专业、适合直接复制
3. 优先采用“动作 + 方法 + 结果”
4. 没有指标时不能硬造数字
5. 没有主导证据时不能写成主导表达
6. 不允许明显套话

---

## 13.9 模块 I：单条重写 `highlight_rewriter`

### 目标

支持用户对某条 highlight 按不同风格或岗位重新生成。

### 规则

1. 只能基于原 experience 与 evidence 重写
2. 不能脱离原始证据新增事实
3. `style` 和 `target_job` 参数必须显式传入

---

## 13.10 模块 J：证据绑定 `evidence_binder`

### 目标

为每条 highlight 输出来源依据。

### 每条 highlight 必须能追溯到：

* source docs
* source chunks
* source facts

### 规则

没有证据链的亮点不能作为默认 Top 结果，除非处于低质量降级模式。

---

# 14. AI 行为约束

这是给 AI coding / AI generation 模块的硬约束。

## 14.1 Grounding

生成内容必须 grounded in evidence，即必须基于已抽取 fact 和 source chunk。

## 14.2 No Fabrication

禁止编造以下内容：

* 指标
* 项目名
* 用户职责级别
* 明确结果
* 技术栈
* 团队归因为个人归因

## 14.3 Conservative Authorship

如果用户 ownership 不明确，优先使用弱归因表达。

## 14.4 Resume Objective

目标是“简历亮点生成”，不是“摘要优化”，不是“完整文章总结”。

## 14.5 Ranking First

默认输出应优先选择最值得写进简历的内容，而不是最全面的内容。

---

# 15. API 规范

---

## 15.1 通用响应格式

```json
{
  "code": 0,
  "message": "ok",
  "data": {},
  "request_id": "string"
}
```

---

## 15.2 通用错误码

* `0`: success
* `4001`: invalid_params
* `4002`: invalid_url
* `4003`: unsupported_platform
* `4004`: auth_required
* `4005`: access_denied
* `4006`: empty_content
* `5001`: fetch_failed
* `5002`: parse_failed
* `5003`: generation_failed
* `5004`: internal_error

---

## 15.3 创建会话

**POST** `/api/session/create`

### request

```json
{
  "target_job": "engineering",
  "styles": ["concise", "technical"],
  "desired_highlight_count": 5
}
```

### response

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "session_id": "sess_xxx",
    "status": "created"
  },
  "request_id": "req_xxx"
}
```

---

## 15.4 获取授权地址

**GET** `/api/auth/url?platform=feishu`

**GET** `/api/auth/url?platform=yuque`

### response

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "platform": "feishu",
    "auth_url": "https://..."
  },
  "request_id": "req_xxx"
}
```

---

## 15.5 授权回调

**POST** `/api/auth/callback`

### request

```json
{
  "platform": "yuque",
  "auth_code": "xxx"
}
```

### response

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "platform": "yuque",
    "authorized": true
  },
  "request_id": "req_xxx"
}
```

---

## 15.6 导入文档

**POST** `/api/docs/import`

### request

```json
{
  "session_id": "sess_xxx",
  "documents": [
    {
      "platform": "feishu",
      "url": "https://..."
    },
    {
      "platform": "yuque",
      "url": "https://..."
    }
  ]
}
```

### response

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "documents": [
      {
        "doc_id": "doc_1",
        "platform": "feishu",
        "url": "https://...",
        "status": "supported"
      },
      {
        "doc_id": "doc_2",
        "platform": "yuque",
        "url": "https://...",
        "status": "supported"
      }
    ]
  },
  "request_id": "req_xxx"
}
```

---

## 15.7 拉取并解析文档

**POST** `/api/docs/fetch-parse`

### request

```json
{
  "session_id": "sess_xxx",
  "doc_ids": ["doc_1", "doc_2"]
}
```

### response

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "document_results": [
      {
        "doc_id": "doc_1",
        "status": "parsed",
        "title": "实习周报"
      },
      {
        "doc_id": "doc_2",
        "status": "fetch_failed",
        "error_code": "5001",
        "error_message": "平台拉取失败"
      }
    ]
  },
  "request_id": "req_xxx"
}
```

---

## 15.8 发起分析

**POST** `/api/resume/analyze`

### request

```json
{
  "session_id": "sess_xxx",
  "doc_ids": ["doc_1", "doc_2"],
  "target_job": "product",
  "styles": ["concise", "business"],
  "desired_highlight_count": 5
}
```

### response

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "task_id": "task_xxx",
    "status": "extracting"
  },
  "request_id": "req_xxx"
}
```

---

## 15.9 查询分析结果

**GET** `/api/resume/result?session_id=sess_xxx`

### response

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "session_id": "sess_xxx",
    "status": "partial_success",
    "highlights": [
      {
        "highlight_id": "hl_1",
        "style": "business",
        "target_job": "product",
        "content": "梳理并推进某项目需求落地，结合多轮文档复盘与协作记录优化流程衔接，提升执行效率。",
        "confidence_score": 0.84,
        "is_edited": false
      }
    ],
    "warnings": [
      "部分文档读取失败",
      "部分亮点缺少明确量化指标"
    ]
  },
  "request_id": "req_xxx"
}
```

---

## 15.10 查询证据链

**GET** `/api/resume/evidence?highlight_id=hl_1`

### response

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "highlight_id": "hl_1",
    "source_docs": [
      {
        "doc_id": "doc_1",
        "title": "实习周报-第3周"
      }
    ],
    "source_chunks": [
      {
        "chunk_id": "chunk_1",
        "title_path": ["项目A", "需求跟进"],
        "cleaned_text": "负责梳理需求变更并推进执行..."
      }
    ],
    "facts": [
      {
        "fact_id": "fact_1",
        "action": "梳理需求变更",
        "result": "优化流程衔接",
        "metric": null
      }
    ]
  },
  "request_id": "req_xxx"
}
```

---

## 15.11 重写单条亮点

**POST** `/api/resume/rewrite`

### request

```json
{
  "highlight_id": "hl_1",
  "style": "technical",
  "target_job": "engineering"
}
```

### response

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "highlight_id": "hl_1",
    "rewritten_content": "基于多轮需求记录与实现文档，梳理并优化前端需求流转过程，提升协作效率与交付可追踪性。"
  },
  "request_id": "req_xxx"
}
```

---

## 15.12 保存编辑结果

**POST** `/api/resume/highlight/save`

### request

```json
{
  "highlight_id": "hl_1",
  "content": "用户编辑后的内容"
}
```

### response

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "highlight_id": "hl_1",
    "is_edited": true
  },
  "request_id": "req_xxx"
}
```

---

## 15.13 删除亮点

**POST** `/api/resume/highlight/delete`

### request

```json
{
  "highlight_id": "hl_1"
}
```

### response

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "highlight_id": "hl_1",
    "deleted": true
  },
  "request_id": "req_xxx"
}
```

---

## 15.14 清空会话

**POST** `/api/session/clear`

### request

```json
{
  "session_id": "sess_xxx"
}
```

### response

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "session_id": "sess_xxx",
    "cleared": true
  },
  "request_id": "req_xxx"
}
```

---

# 16. 状态机定义

## 16.1 `doc_status`

* `pending_validation`
* `invalid_url`
* `unauthorized`
* `supported`
* `fetching`
* `fetch_failed`
* `fetched`
* `parsing`
* `parse_failed`
* `parsed`

## 16.2 `session_status`

* `created`
* `importing`
* `parsing`
* `extracting`
* `merging`
* `generating`
* `completed`
* `partial_success`
* `failed`

## 16.3 `highlight_status`

建议前端层维护：

* `generated`
* `edited`
* `deleted`

---

# 17. 错误处理规范

## 17.1 文档级错误

支持以下错误类型：

* `invalid_url`
* `unsupported_platform`
* `auth_required`
* `access_denied`
* `fetch_timeout`
* `fetch_failed`
* `parse_failed`
* `empty_content`
* `content_too_short`
* `internal_error`

## 17.2 会话级状态

* `success`：所有文档成功或足够成功且结果完整
* `partial_success`：部分文档失败，但仍有可用结果
* `failed`：没有可用结果

## 17.3 低质量降级策略

当内容质量不足时：

1. 输出更少的亮点
2. 返回 warning
3. 可退化为“经历候选”，而不是强行生成高质量亮点
4. 不要用空泛废话填满 3～5 条

---

# 18. 验收标准

## 18.1 功能验收

MVP 必须全部满足：

1. 能处理飞书文档
2. 能处理语雀文档
3. 支持一次分析多篇文档
4. 能输出 3～5 条亮点，或在不足时合理降级
5. 支持选择 `target_job`
6. 支持选择 `style`
7. 支持 evidence 查看
8. 支持单条编辑
9. 支持单条删除
10. 支持复制结果
11. 支持 partial_success
12. 支持清理会话数据

## 18.2 质量验收

1. 输出结果显著更接近简历语言，而非摘要语言
2. 无明确数字时不编数字
3. 不明显夸大 ownership
4. 重复亮点数量低
5. style 和 target_job 变化后，输出表达有明显差异
6. Top 排名亮点有证据链

## 18.3 安全验收

1. 只申请只读权限
2. 不写回源平台
3. 普通日志不记录全文
4. token 安全存储
5. 支持会话数据删除

---

# 19. AI 编码指令

以下内容是给 Open Spec / Cursor / agent 的直接执行约束。

## 19.1 实现优先级

优先保证：

1. 文档读取正确
2. 中间结构清晰
3. 证据链贯通
4. 输出 grounded
5. 飞书和语雀同等支持

不要优先做：

* 复杂 UI 美化
* 模板花样
* 次要导出格式
* 花哨交互

## 19.2 工程要求

1. 平台 adapter 必须隔离
2. parsing 与 generation 必须解耦
3. chunk / fact / experience / highlight 必须结构化
4. 每一步应支持单独调试
5. 尽量返回 machine-readable 错误信息

## 19.3 Prompt / LLM 要求

若使用 LLM：

1. 优先返回结构化 JSON
2. 抽取与生成分两步以上完成
3. 生成亮点时必须传入 evidence-based 输入，而不是全文直接生成
4. 生成模块必须支持 style 与 target_job 参数
5. 所有生成结果必须可追溯到 fact

---

# 20. 推荐任务拆分

## Task 1：项目骨架

* 建立目录结构
* 定义 schema
* 建立 session 机制
* 建立统一响应体与错误码

## Task 2：飞书接入

* URL 识别
* 授权
* 文档抓取
* 标准化输出

## Task 3：语雀接入

* URL 识别
* 授权
* 文档抓取
* 标准化输出

## Task 4：文档处理

* normalizer
* cleaner
* chunker
* relevance ranker

## Task 5：事实抽取

* fact extractor
* JSON schema 校验
* confidence 字段

## Task 6：经历聚合

* merger
* dedup
* ranking

## Task 7：亮点生成

* generator
* style 差异化
* target_job 差异化
* no fabrication 约束

## Task 8：证据链

* highlight → fact → chunk → doc 映射
* evidence API

## Task 9：结果编辑

* save
* delete
* rewrite
* export

## Task 10：异常与隐私

* partial_success
* 日志收敛
* session clear
* token 安全

---

# 21. Definition of Done

只有当以下条件全部成立时，此 spec 对应的 MVP 才算完成：

1. 飞书接入可用
2. 语雀接入可用
3. 多文档分析可用
4. 支持文档抓取、解析、切片
5. 支持 fact 抽取
6. 支持 experience 聚合
7. 支持生成 3～5 条亮点
8. 支持 `concise / technical / business`
9. 支持 `generic / engineering / product / operations`
10. 支持 evidence 查看
11. 支持编辑 / 删除 / 复制
12. 支持单条重写
13. 支持 `partial_success`
14. 只读权限生效
15. 不编造数字
16. 不无依据夸大 ownership
17. 可清理会话数据

---

# 22. 最终产品定义

这是一个 **面向简历场景的私有文档智能提炼系统**。
系统通过读取用户授权的飞书与语雀文档，对多篇私有文档进行统一解析、事实抽取、跨文档经历聚合与简历化改写，最终输出可编辑、可复制、可追踪证据的简历亮点，帮助用户高效完成简历优化。

---

如果你愿意，我下一步可以直接继续把这份 Master Spec 往下落成两份最实用的东西之一：

**第一份：给 Cursor / Open Spec 直接执行的任务清单版**
也就是把它拆成一条条可以让 AI 连续开工的开发任务。

**第二份：Prompt Spec**
专门定义 fact 抽取、experience 聚合、highlight 生成这三段 Prompt 应该怎么写。
