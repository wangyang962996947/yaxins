// 提示词模板常量 — 避免在 Vue SFC 里写大段模板字符串导致嵌套引号问题

export const bizLogicTemplate = `
请分析给定 HTML 页面中的所有 onclick、ontap 等事件绑定的 JavaScript 函数。

【任务目标】
生成一份完整的业务逻辑说明文档（Markdown 格式），帮助技术人员理解该页面的完整业务链路。

【阶段一：业务函数筛选】

1. 过滤规则：
 - 排除仅实现以下行为的函数：页面跳转 / 打开链接、关闭弹窗 / 返回上一页、仅改变 UI 样式、无数据读写或状态变更的纯交互函数。

2. 保留业务函数：涉及数据请求、提交、计算、状态变更、页面核心流程的函数。

3. 梳理前端业务交互顺序：
 - 按用户完成一个完整业务目标的路径，列出函数之间的调用顺序与数据依赖。

【阶段二：业务流程识别】

针对阶段一中的每一个核心业务路径，追踪完整的技术调用链，覆盖以下层级：
- 前端 JS 函数（函数名、请求 URL、Method、参数）
- 后端接口（Controller/Handler、中间件）
- 业务层（Service、RPC调用）
- 数据库（表名、操作类型）
- 中间件/缓存/消息队列（Redis、MQ等）

梳理出该页面的业务路径结构：

主流程：用户完成核心业务目标必须经过的步骤（如：登录 -> 选商品 -> 下单 -> 支付）

子流程：主流程中每个步骤展开的详细调用链（如：下单流程包含：创建订单、扣库存、发优惠券）


【阶段三：生成文档（Markdown 格式）】

文档结构如下：

[页面名称] 业务逻辑说明文档
一、概述
页面功能：简要说明页面的核心业务目标

业务角色：涉及的用户角色（如：普通用户、管理员）

二、业务流程总览

【推荐语法格式】：
\`\`\`
sequenceDiagram
 participant A
 participant B

 A->>A: 自调用
 A->>+B: 激活请求
 B-->>-A: 停用响应

 Note over A: 单参与者注释
 Note over A,B: 多参与者注释
\`\`\`

【语法注意点】
1. + 和 - 只能用于不同参与者之间，不能用于自己
正确写法：
FE->>FE: 调用自身
FE-->>FE: 返回自身

2. 每个 activate 必须有且仅有一个 deactivate，且不能重复停用，推荐使用 + 和 - 符号代替 activate/deactivate，避免配对错误
正确写法：
FE->>+API: (这里用 +API 表示激活)
API-->>-FE: 响应 (这里用 -API 表示销毁)

3. over 后面跟 1 个或 2 个参与者，不能是同一个参与者写两次
正确写法：
Note over FE: 说明文字 # 单个参与者
Note over FE,API: 说明文字 # 多个参与者

4. alt 嵌套建议不超过 3 层，超过时拆分成多个图表或用 else 扁平化
正确写法：
alt 条件1
 ...
else 条件2
 ...
else 条件3
 ...
end

5. 中文标点符号导致解析错误，统一使用英文标点符号，引号用 " 不用 ""
正确写法：
FE-->>User: 提示"验证通过" # 英文双引号
FE-->>User: 提示成功 # 不用引号
FE-->>User: 提示【验证通过】 # 用方括号代替

6. 消息内容包含特殊字符，避免使用 * & < > { } [ ] 等特殊字符，用中文描述代替
正确写法：
FE->>API: 查询用户表
FE->>API: 参数 KEY=value


2.1 主流程时序图

\`\`\`
sequenceDiagram
 participant User as 用户
 participant FE as 前端
 participant BFF as 后端网关
 participant Service as 业务服务
 participant DB as 数据库

 Note over User,DB: 主流程：完成核心业务目标
 User->>FE: 步骤1：触发业务入口
 FE->>BFF: 调用接口A
 BFF->>Service: 转发请求
 Service->>DB: 数据操作
 DB-->>Service: 返回数据
 Service-->>BFF: 返回结果
 BFF-->>FE: 响应数据
 FE-->>User: 步骤N：完成业务
\`\`\`

2.2 主流程步骤说明
| 步骤 | 用户操作 | 前端函数 | 后端接口 | 数据变化 | 下一步依赖 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | 点击xxx | xxx() | POST /api/xxx | 创建xxx记录 | 启用xxx按钮 |

三、子业务流程详解

3.1 子流程一：[名称，如：用户登录流程]
业务描述：说明该子流程的业务目的

时序图：

\`\`\`
sequenceDiagram
 participant FE as 前端
 participant API as 认证接口
 participant Cache as Redis
 participant DB as 用户表
 participant MQ as 消息队列

 FE->>API: login({username, password})
 activate API
 API->>DB: SELECT * FROM users WHERE username=?
 DB-->>API: user数据
 alt 密码正确
 API->>Cache: SET session:{token}
 API-->>FE: {token, userInfo}
 FE->>FE: 存储token到localStorage
 else 密码错误
 API-->>FE: 401 错误
 end
 deactivate API

 API->>MQ: 发送登录日志（异步）
\`\`\`

调用链详情：

前端：login() -> 校验参数 -> axios.post('/api/login')

后端接口：AuthController.login() -> 中间件：无（公开接口）

业务层：UserService.authenticate() -> 密码加密比对（bcrypt）

数据库：users 表（SELECT）

缓存：Redis 存储 session（TTL: 7天）

消息队列：Kafka 发送登录事件（用于日志分析）

关键字段：

| 层级 | 输入字段 | 输出字段 |
| :--- | :--- | :--- |
| 前端 | username, password | token, userId, nickname |
| 后端 | username, password | userId, token, expireTime |
| 数据库 | username | id, password_hash, status |

异常处理：

密码错误：返回 401，前端提示"用户名或密码错误"

账号锁定：返回 403，前端提示"账号已被锁定"

3.2 子流程二：[名称]
（重复上述结构）

四、数据依赖关系图

\`\`\`
graph TD
 A[用户点击搜索] --> B[调用 searchItems]
 B --> C{有缓存?}
 C -->|是| D[返回缓存数据]
 C -->|否| E[查询数据库]
 E --> F[写入缓存]
 F --> D
 D --> G[渲染列表]
 G --> H[启用详情按钮]
\`\`\`

五、关键函数索引

| 函数名 | 所在文件 | 业务作用 | 调用后端接口 | 所属流程 |
| :--- | :--- | :--- | :--- | :--- |
| submitOrder | order.js | 提交订单 | POST /api/order | 主流程-步骤3 |
| checkStock | cart.js | 检查库存 | GET /api/stock | 子流程-下单 |

六、注意事项与边界条件
列出需要特别注意的业务逻辑（如：并发控制、幂等性、事务边界）

列出已知的异常场景及处理方式

列出对技术人员重要的配置项或开关

【输出要求】

严格按照上述 Markdown 结构输出

如果页面有多个独立业务模块，请分别生成独立的文档（用 H1 标题区分模块）

时序图必须使用 Mermaid 语法，确保可渲染

对于无法从代码中推断的信息（如数据库表结构），请用 [待补充] 标注

最终在report目录下输出应该是一个完整的 .md 文件内容，可以直接保存使用`

export const securityAnalysisTemplate = `
你是一位拥有10年经验的资深应用安全专家和白盒代码审计工程师，擅长Java/Python/Web安全分析，精通OWASP Top 10漏洞原理及修复方案。请基于已生成的 [report/写卡协同任务管理业务逻辑说明文档.md] 业务逻辑说明文档结合业务代码，进行业务逻辑漏洞扫描分析。

【任务目标】
识别该页面业务流程中可能存在的逻辑漏洞、权限绕过、状态篡改等安全问题，输出一份安全分析报告（Markdown 格式）。

【扫描范围限定】
仅分析业务逻辑层面的安全漏洞，不包含以下内容：
- 静态代码扫描类漏洞（SQL注入、XSS、CSRF等）
- 基础配置问题（CORS、HTTPS、HTTP头缺失等）
- 第三方依赖漏洞

【漏洞类型参考（OWASP 业务逻辑漏洞分类）】

1. 支付逻辑漏洞
 - 金额篡改（负数、极小值、精度丢失）
 - 支付状态绕过（未支付标记为已支付）
 - 重复支付/重复退款
 - 优惠券/积分叠加漏洞

2. 权限与访问控制
 - 越权操作（水平/垂直越权）
 - 未授权访问
 - 权限提升路径
 - 会话固定/劫持

3. 业务流程绕过
 - 步骤跳跃（跳过前置步骤）
 - 参数重放（重复提交有效请求）
 - 条件竞争（并发触发多次操作）
 - 状态机异常（非法状态流转）

4. 数据校验缺失
 - 业务约束绕过（超量、超限）
 - 数据类型混淆
 - 业务规则绕过（如黑名单用户仍可操作）

5. 信息泄露
 - 枚举漏洞（ID遍历）
 - 敏感信息返回
 - 响应差异泄露

6. 验证码与限流
 - 无验证码/验证码可绕过
 - 无操作频率限制
 - 短信/邮件轰炸

【扫描方法】

阶段一：业务流程拆解
从业务逻辑文档中提取以下信息：
- 主流程的步骤序列及依赖关系
- 子流程的调用链和数据流转
- 状态变更点（数据库写入、缓存更新、消息发送）
- 权限检查点（哪些接口需要鉴权）

阶段二：逐环节漏洞分析
针对每个业务环节，结合业务代码，分析业务流转过程中的代码逻辑漏洞

阶段三：漏洞验证思路

对于发现的每个漏洞：
- 定位具体代码行（文件名:行号）
- 分析漏洞成因
- 评估影响范围

【输出格式】

[页面名称] 业务逻辑安全分析报告

一、 漏洞概览
| 漏洞编号 | 漏洞名称 | 严重程度 | 漏洞类型 |
| :--- | :--- | :--- | :--- |
| VUL-001 | [例如：SQL注入] | [高危/中危/低危] | [注入/配置错误] |

二、漏洞详情（按流程分组）

3.1 [流程名称] - [漏洞名称]

漏洞类型：[从上述类型中选择]

风险等级：高危/中危/低危

漏洞描述：
[简要描述问题发生的业务场景和可能后果]

关键代码片段：
\`\`\`
// 在此处展示存在漏洞的代码片段
\`\`\`

漏洞成因分析：
\`\`\`
sequenceDiagram
 participant Attacker as 攻击者
 participant FE as 前端
 participant API as 接口
 participant DB as 数据库

 Note over Attacker,DB: 漏洞利用流程
 Attacker->>FE: 篡改请求参数X
 FE->>API: 发送恶意请求
 Note over API: 缺少参数X的校验
 API->>DB: 执行异常操作
 DB-->>API: 返回结果
 API-->>Attacker: 操作成功
\`\`\`

复现步骤：

1. 登录系统，进入[页面]
2. 打开浏览器开发者工具
3. 拦截请求 [具体接口]
4. 修改参数 [原值] 为 [恶意值]
5. 发送请求，观察响应

预期结果：[系统应有的正确行为]
实际结果：[系统当前表现]

验证请求示例：
\`\`\`
POST /api/xxx HTTP/1.1
Host: example.com
Cookie: session=xxx
Content-Type: application/json

{"original_param": "malicious_value"}
\`\`\`

修复建议：

代码层面：[具体修改建议]
配置层面：[如需要]
架构层面：[如需要]

参考：[类似漏洞的CVE或公开案例，如有]

3.2 [流程名称] - [漏洞名称]
（重复上述结构）


【输出要求】

严格按照上述 Markdown 结构输出

每个漏洞必须有明确的复现步骤和修复建议

如文档信息不足无法判断，标注 [信息不足，需补充] 并说明需要补充什么信息

时序图必须使用 Mermaid 语法

最终输出为单个 .md 文件到report目录下，可直接保存使用`
