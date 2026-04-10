# Harness 框架智能体模板

基于 Harness 工程四层架构实现的可落地智能体框架。

## 架构设计

严格遵循 Harness 工程四层架构：

```
用户输入
   ↓
┌─────────────┐  不符合 → 拒绝/转人工
│   约束层     │  符合 ↓
│ (系统边界)   │
└─────────────┘
   ↓
┌─────────────┐
│   信息层     │  提供上下文信息（RAG、历史管理、知识注入）
│ (上下文工程)  │
└─────────────┘
   ↓
┌─────────────┐
│   模型推理   │
└─────────────┘
   ↓
┌─────────────┐  失败 → ┌─────────────┐
│   验证层     │ ─────→ │   修正层     │
│ (质量检验)   │        │ (保底机制)   │
└─────────────┘        └─────────────┘
   ↓ 通过
  用户
```

## 目录结构

```
.
├── README.md              # 项目说明
├── constraints/            # 约束层
│   ├── role.yaml          # 角色约束
│   ├── format.yaml        # 输出格式约束
│   └── security.yaml      # 安全约束
├── context/               # 信息层（上下文工程）
│   ├── knowledge/         # 静态知识注入
│   ├── history/           # 历史会话管理
│   └── rag/               # RAG 配置
├── validation/            # 验证层
│   ├── format-check.ts    # 格式检查
│   ├── fact-check.ts      # 事实验证
│   ├── security-check.ts  # 安全验证
│   └── consistency-check.ts # 一致性验证
├── correction/            # 修正层
│   ├── retry.ts           # 重试策略
│   ├── fallback.ts        # 降级兜底
│   └── human-handoff.ts   # 人工转接
└── examples/              # 示例实现
```

## 使用说明

1. 在 `constraints/` 中定义三类约束：角色、输出格式、安全
2. 在 `context/` 中配置静态知识和动态 RAG
3. 在 `validation/` 中实现对应的检查规则
4. 在 `correction/` 中配置失败处理策略

## 约束层模板

### 角色约束 (`constraints/role.yaml`)

```yaml
name: "角色名称"
description: "角色职责描述"
scope:
  - "允许做的事情1"
  - "允许做的事情2"
forbidden:
  - "禁止做的事情1"
  - "禁止做的事情2"
tone: "友好/专业/简洁"
```

### 输出格式约束 (`constraints/format.yaml`)

```yaml
required: true
format: "json | markdown | plaintext"
schema: "JSON Schema 定义（当 format=json 时）"
examples:
  - 示例输出1
  - 示例输出2
```

### 安全约束 (`constraints/security.yaml`)

```yaml
disallow_leak_system_prompt: true
disallow_sensitive_content: true
disallow_harmful_content: true
allowlist_commands: []
blocklist_commands: []
```

## 验证层检查规则

| 检查类型 | 检查内容 | 失败处理 |
|---------|---------|---------|
| 格式检查 | 输出是否符合要求格式 | 重试 → 降级 |
| 事实验证 | 输出中的事实是否与数据源一致 | 修正 → 重试 |
| 安全验证 | 是否包含敏感/有害内容 | 拒绝 → 人工转接 |
| 一致性验证 | 是否自相矛盾/不一致 | 重试 → 降级 |

## 社区最佳实践整合

参考 Harness Engineering 社区最佳实践：

1. **多代理模式，职责分离**（可选）
   - Planner：规划任务规格
   - Generator：实现功能
   - Evaluator：验证质量

2. **状态持久化**
   - 任务列表使用 JSON 格式
   - 进度笔记记录每次会话
   - 仓库作为唯一真实来源

3. **会话协议**
   - 每个会话只处理一个任务
   - 构建前先验证基线
   - 完成后更新状态提交

4. **反馈循环**
   - 自动化验证作为反压
   - UI 自动化验证（如果需要）
   - 具体可评分标准

## 快速开始

1. 复制此目录到你的项目
2. 修改 `constraints/` 下的约束配置
3. 根据需要实现 `validation/` 中的检查
4. 配置 `correction/` 中的失败处理策略
5. 接入你的模型调用入口

## 示例实现

详见 `examples/` 目录。
