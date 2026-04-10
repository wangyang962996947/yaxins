---
name: miaoda-coding
description: 用户要求创建或修改应用、网页、页面、PPT、幻灯片、演示文稿，或提到"妙搭"、"vibe coding"时适用。
user-invocable: false
---

# 妙搭

**重要：创建或修改应用、网页、PPT 等制品的执行环节，必须通过 sessions_spawn 交给妙搭。绝对不要自己动手写代码。**

## 判断是否需要先做前置工作

妙搭只负责**生成制品**（网页、应用、PPT），不负责搜索、分析、总结等研究工作。

收到用户请求后，先判断：

- **纯建站/改站请求**（如"做一个计算器"、"改一下颜色"）→ 直接派活给妙搭
- **对话中有需要传递给 code agent 的上下文**（之前讨论的调研结果、用户偏好、素材等）→ 先调 `miaoda_write_reference` 写入参考资料，再派活
- **复合请求**（如"先搜集 XX 资料，再生成网站"）→ 主 agent 先完成研究，**整理为摘要+关键原文引用**，调 `miaoda_write_reference` 写入，再派活

**错误做法**：把"先搜集再生成"的整个需求原样丢给妙搭——妙搭不会搜索，只会基于给定内容生成页面。

### 写入参考资料

用 `miaoda_write_reference` 将上下文写入项目的 reference 目录：

参数：
- `project_id`: 项目 ID
- `category`: `"research"`（调研结果）、`"design"`（设计要求）、`"feedback"`（用户反馈）
- `content`: Markdown 格式的参考资料（摘要+关键原文引用）
- `filename`: 可选，自定义文件名
- `mode`: `"append"`（默认，追加）或 `"replace"`（替换该 category 全部内容，用于用户反悔/调整）

整理原则：
- 结构化摘要：提炼对话中的关键结论、决策、需求
- 保留关键原文：用户的原话、重要数据、具体要求原样引用
- 不要把整段对话历史塞进去，提炼有价值的信息

### 调用者边界

| Tool | 谁调 |
|------|------|
| `miaoda_write_reference` | 主 agent（non-subagent 会话） |
| `miaoda_coding` | subagent |
| `miaoda_check_progress` | 主 agent（non-subagent 会话） |
| `list_projects` | 主 agent 或 subagent |

## 派活

通过 `sessions_spawn` 派给 subagent。**只传以下三个参数，不要传任何其他参数**（不要传 streamTo、sandbox、stream 等）：

- `runtime`: `"subagent"`
- `mode`: `"run"`
- `task`: 按下面模板填写

如果 sessions_spawn 返回错误，去掉多余参数后重试，**绝对不要 fallback 到自己写代码**。

**创建新项目：**

1. 如有上下文需要传递，先调 `miaoda_write_reference`
2. 调 `sessions_spawn`，task 内容：

```
调用 miaoda_coding tool，参数：
- generation_request: "<生成指令>"
- project_id: "<project_id>"
- name: "<面向人类可读的应用名称>"
- description: "<根据用户需求整理的一句话简介，单行，80 字以内>"
- target: "user:<sender_id>"

如果 reference/ 目录已有参考资料，tool 会自动提示 code agent 查阅。

tool 会返回结构化 JSON（status/appId/finalText/output 等）。

tool 返回的 JSON 里如果有 `hint` 字段，严格按 hint 指示行事。

不要调 message tool（主 agent 会处理消息投递）。
```

**修改已有项目：**

1. 如有新反馈/调整，先调 `miaoda_write_reference`（category="feedback"，mode 按需选 append 或 replace）
2. 调 `sessions_spawn`，task 内容：

```
你只能调用以下两个 tool，按顺序执行，不得使用任何其他 tool（exec、ls、read 等均禁止）：

1. 调用 list_projects tool，无需任何参数。
2. 从返回的 projects 数组中找到与用户需求匹配的项目，取其 project_id。
3. 调用 miaoda_coding tool，参数：
   - generation_request: "<修改要求>"
   - project_id: "<上一步取到的 project_id>"
   - target: "user:<sender_id>"

tool 会返回结构化 JSON（status/appId/finalText/output 等）。

tool 返回的 JSON 里如果有 `hint` 字段，严格按 hint 指示行事。

不要调 message tool（主 agent 会处理消息投递）。
```

`<sender_id>` 从消息上下文的 sender_id 字段获取（格式如 `ou_xxx`）。

`<project_id>` 仅允许小写字母、数字和短横线，创建新项目时根据用户需求生成，例如：
- "帮我做一个 hello world 网页" → `hello-world-webpage`
- "做一个计算器" → `calculator`
- "做一个贪吃蛇游戏" → `snake-game`

## 你（主 agent）的行为

1. 读完这个 skill 后，判断是否需要写参考资料，需要则调 `miaoda_write_reference`
2. 调 sessions_spawn
3. 回复用户"交给妙搭了，稍等"
4. **不要** 调 sessions_history、subagents、或任何 poll 操作
5. subagent announce 回来后，**只发一条总结消息**：简短总结做了什么
   - **不需要发预览链接** — 预览链接由插件自动投递给用户，你不需要从 output/finalText 中提取
   - **严禁发多条消息**
   - 不要提系统、子任务、announce、subagent 等内部细节
6. `miaoda_check_progress` 用于两种场景：(a) 用户主动问进度时，(b) 任务失败且结果中有 `hint` 建议查进度时
7. **不要** 调 message tool 自己推送消息，所有回复通过正常对话投递
8. **不要** 自己写代码或用 exec/write 生成 HTML/JS/CSS 文件

## 处理失败和异常

subagent 返回的结果 JSON 中可能包含 `status: "error"` 或 `status: "timeout"`。按以下规则处理：

1. **`retryable: true` + `hint` 字段存在**：告诉用户遇到了问题（用通俗语言，不要说"网络连接中断"这种技术细节），然后按 `hint` 的建议执行（通常是先调 `miaoda_check_progress` 查看状态）
   - 如果 progress 显示已完成 → 正常回复结果
   - 如果 progress 显示仍在运行 → 告诉用户"还在处理中，稍后再查"
   - 如果 progress 显示失败 → 问用户是否要重试
2. **`hint` 包含"createSubApp 失败"**：createSubApp 是创建应用的前置步骤，失败原因可能是用户额度不足、权限不够、或服务异常等。根据 `error` 字段的具体内容用通俗语言告诉用户（如"额度用完了"、"没有权限"、"服务暂时不可用"），**不要重试，不要调 miaoda_check_progress**
3. **`retryable: false` 或无 `retryable` 字段**：直接告诉用户失败了，附上错误信息，问用户怎么处理
4. **结果里没有预览链接**（`hint` 提到"未检测到预览链接"）：调 `miaoda_check_progress` 查看最新状态，可能链接还没生成

**禁止行为**：
- 不要在用户不知情的情况下自动重试——先告诉用户情况，等用户确认
- 不要把 `retryable`、`hint`、`logId` 等内部字段暴露给用户
- 不要说"stream disconnected"、"reconnect exhausted"等技术术语
