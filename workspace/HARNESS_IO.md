# Harness.io 学习笔记

> 来源：官方文档 + 技术博客
> 日期：2026-04-10

---

## 一、Harness.io 是什么

Harness.io 是一个**企业级智能软件交付平台**，核心理念是"平台化 DevOps"——把构建、测试、部署、验证、监控、优化整个交付生命周期统一在一个智能平台中，用 AI 驱动每一个环节。

**对比传统工具：**

| | Jenkins | GitLab CI | Harness.io |
|---|---|---|---|
| 架构理念 | 插件化自动化服务器 | 集成化 CI/CD | 平台化软件交付 |
| 配置方式 | Groovy 脚本 | YAML | 声明式 YAML + 可视化 |
| 部署策略 | 需自定义脚本 | 基础策略 | 内置金丝雀、蓝绿、滚动 |
| 智能特性 | 无 | 基础缓存 | AI 驱动优化、智能测试选择 |
| 安全治理 | 插件依赖 | 基础 RBAC | 策略即代码（OPA） |
| 运维成本 | 高 | 中 | 低 |

---

## 二、七大核心模块

### 1. 持续集成（CI）

**职责：** 代码构建、测试、打包

**核心能力：**
- 增量构建：基于代码变更只构建受影响部分
- 智能缓存：避免重复下载依赖，构建时间减少 70%+
- 并行执行：充分利用多核 CPU
- 容器原生：天然适配 Docker 和 Kubernetes

**典型流程：**
```
代码提交 → Git Webhook 触发 → 拉取代码 → 执行构建步骤 → 运行测试 → 推送镜像到制品库
```

### 2. 持续交付（CD）

**职责：** 把构建产物部署到目标环境

**核心能力：**
- 多种部署策略：金丝雀（Canary）、蓝绿（Blue/Green）、滚动更新（Rolling）
- 自动化验证：部署后自动执行测试和健康检查
- 智能回滚：异常检测与自动回滚
- GitOps 集成：声明式基础设施即代码

**CD 建模四要素：**
```
Pipeline（流水线）
  └── Stage（阶段）
        ├── Service（部署什么）
        ├── Environment（部署到哪）
        └── Execution（如何执行）
```

**部署策略详解：**

- **滚动更新（Rolling）：** 逐批替换旧版本实例，简单但风险高
- **蓝绿部署（Blue/Green）：** 两套环境并行，切换流量，无缝回滚
- **金丝雀发布（Canary）：** 小流量验证，逐步放大，发现问题快速回滚

### 3. 功能标记（Feature Flags）

**职责：** 渐进式功能发布、A/B 测试

**核心能力：**
- 按用户群体、地理位置逐步发布
- 无需重新部署的动态功能控制
- 数据驱动的功能决策

### 4. 云成本管理（Cloud Cost Management）

**职责：** 多云成本可视化、优化建议

**核心能力：**
- AWS、Azure、GCP 多云成本统一视图
- 团队/项目级成本追踪与标签分配
- AI 驱动的优化建议：闲置资源识别、预留实例优化
- 预算告警：超支前预警

### 5. 安全测试编排（STO）

**职责：** 把安全扫描集成到 CI/CD 流水线

**核心能力：**
- SAST（静态应用安全测试）：代码级漏洞扫描
- DAST（动态应用安全测试）：运行时安全检测
- SCA（软件组分分析）：依赖库安全扫描
- 策略即代码（OPA）：安全策略自动化执行

### 6. 混沌工程（Chaos Engineering）

**职责：** 故障注入实验，验证系统弹性

**核心能力：**
- 自动化故障注入实验
- 验证系统容错和恢复能力

### 7. 工程洞察（Engineering Insights）

**职责：** 交付效能可视化

**核心能力：**
- DORA 指标：部署频率、变更前置时间、恢复时间、变更失败率
- 团队效率分析

---

## 三、核心概念速查

### Connector（连接器）

连接 Harness 与外部资源的桥梁：
- **Kubernetes Cluster Connector**：连接 K8s 集群
- **Git Connector**：连接 GitHub/GitLab/Bitbucket
- **Docker Registry Connector**：连接镜像仓库（Docker Hub、ECR、GCR、ACR）
- **Cloud Connector**：连接 AWS/Azure/GCP
- **Secret Manager**：存储密钥（SSH Key、Access Token 等）

### Delegate（代理）

运行在用户自己基础设施中的轻量级代理，负责：
- 在目标环境执行部署命令
- 连接制品仓库、云平台
- 所有操作通过 HTTPS 出站，防火墙友好

### Trigger（触发器）

自动化流水线执行的条件：
- Git Webhook 触发（代码提交/PR）
- 制品变更触发
- 定时触发（cron）
- 手动触发

### Approval（审批）

在流水线中插入人工审批步骤：
- 任意阶段可加审批门
- 支持邮件/Slack 通知
- 审批后可继续或终止流水线

### Template（模板）

可复用的流水线组件：
- **Pipeline Template**：整个流水线模板
- **Stage Template**：阶段模板（Golden Stage）
- 模板支持参数化，通过 `templateInputs` 传入变量

---

## 四、流水线执行状态机

```
Created → Validating → Queued → Running → Completed
                ↓           ↓        ↓
            Failed      Cancelled  Paused → Running
                                   ↓
                               Failed/Cancelled
```

---

## 五、环境类型

| 类型 | 用途 |
|------|------|
| Production | 生产环境 |
| Pre-Production | 预发布/灰度环境 |

Environment 中定义 Infrastructure（基础设施定义），关联具体的 K8s 集群/VM/云服务。

---

## 六、声明式配置示例

```yaml
pipeline:
  name: Deploy to Production
  stages:
    - stage:
        name: Build and Deploy
        type: Deployment
        spec:
          deploymentType: Kubernetes
          services:
            values:
              - nginx-service
          environments:
            values:
              - production
          execution:
            steps:
              - stepGroup:
                  name: Pre-Deploy
                  steps:
                    - step:
                        type: K8sApply
                        name: Apply Manifests
              - stepGroup:
                  name: Post-Deploy
                  steps:
                    - step:
                        type: Http
                        name: Health Check
```

---

## 七、DORA 指标

| 指标 | 定义 | 优秀标准 |
|------|------|----------|
| 部署频率 | 代码提交到生产的频率 | 按需（一天多次） |
| 变更前置时间 | 提交到生产的时间 | < 1 小时 |
| 恢复时间（MTTR） | 故障后恢复时间 | < 1 小时 |
| 变更失败率 | 变更导致生产失败的比例 | < 15% |

---

## 八、与 Harness Engineering 的区别

| | Harness Engineering（驾驭工程） | Harness.io（DevOps 平台） |
|---|---|---|
| 定位 | AI Agent 的运行管控系统 | CI/CD 持续交付平台 |
| 解决的问题 | 让 AI 可靠地完成复杂任务 | 让软件可靠地交付到生产环境 |
| 核心公式 | Agent = Model + Harness | Pipeline = Build + Test + Deploy + Verify |
| 层级框架 | 约束层→信息层→验证层→修正层 | CI → CD → GitOps → STO |
