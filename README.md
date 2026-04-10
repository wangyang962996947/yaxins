# 🔍 代码扫描插件

基于 Vue 3 + TypeScript 的前端代码扫描插件。上传 ZIP 包 → 输入提示词 → 提交扫描 → 异步等待 MinIO 结果 → MD 转 HTML 展示报告。

## 功能流程

```
上传 ZIP → 输入提示词 → [buildPromptWithUploadInstruction 追加 MinIO 上传指令]
    → POST /api/scan/submit → 202 立即返回
    → waitForResult 轮询 MinIO (10.28.198.153:9010)
    → 文件出现 → downloadTextFile → marked(MD→HTML) → 展示报告
    → 下载 MD / 重新扫描
```

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | Vue 3 + Composition API + `<script setup>` |
| 语言 | TypeScript（strict 模式） |
| 构建 | Vite 6 |
| HTTP 客户端 | axios（提交） + fetch（Mock MinIO） |
| Markdown 渲染 | marked |
| 样式 | 原生 CSS（Scoped + 全局 markdown-body） |
| Mock 服务 | Express + tsx |
| 自动化测试 | Playwright E2E |

## 项目结构

```
projects/code-scanner-plugin/
├── src/
│   ├── App.vue                  # 根组件
│   ├── main.ts                  # 入口
│   ├── CodeScanner.vue          # 🔵 核心组件（4步状态机）
│   ├── scanService.ts           # 🔵 核心业务逻辑
│   │                               # - buildPromptWithUploadInstruction
│   │                               # - submitScanTask
│   │                               # - waitForResult（轮询 MinIO）
│   ├── minio.ts                 # 真实 MinIO 客户端（USE_MOCK=false）
│   ├── mockMinioClient.ts       # Mock MinIO 客户端（浏览器兼容）
│   └── minio.ts / mockMinioClient.ts
├── server/
│   ├── index.ts                 # Express Mock 后端
│   │                               # - POST /api/scan/submit → 202
│   │                               # - 60s 后上传 MD 到 Mock MinIO
│   └── mockMinio.ts             # Mock MinIO Server
│                                   # - PUT/HEAD/GET /{objectName}
│                                   # - GET /seed?uuid=   （测试注入）
│                                   # - GET /health
├── e2e-test.mjs                 # Playwright 全链路自动化测试
└── vite.config.ts               # Vite 配置
```

## 核心设计

### 状态机（CodeScanner.vue）

| 步骤 | 状态 | 说明 |
|------|------|------|
| ① | `step=1` | 上传 ZIP 文件（拖拽/点击） |
| ② | `step=2` | 输入提示词（3个快速模板） |
| ③ | `step=3` | 等待轮询（UUID/已等待/轮询次数） |
| ④ | `step=4` | 报告展示（HTML/下载/重新扫描） |
| error | `step='error'` | 异常处理 |

### MinIO 上传指令追加（buildPromptWithUploadInstruction）

提示词提交前自动追加以下内容，引导后端大模型将报告上传到 MinIO：

```
请将生成的代码扫描报告文件上传到 MinIO 对象存储：
- MinIO 地址：10.28.198.153:9010
- 用户名：admin
- 密码：A12345678
- 存储桶：code-scanning
- 文件名：${UUID}
（请直接上传原始 Markdown 文件，不要压缩）
```

### 轮询逻辑（waitForResult）

```
while (!canceled && now < deadline):
    if fileExists(uuid):         ← HEAD /{uuid} → 200
        return downloadText()    ← GET /{uuid} → MD 内容
    await sleep(5s)              ← Mock: 5s / 真实: 10s
```

- Mock 模式（`USE_MOCK=true`）：5 秒轮询，最多 5 分钟
- 真实模式（`USE_MOCK=false`）：10 秒轮询，最多 15 分钟

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动 Mock 服务（开发模式）

```bash
# 终端 1：Mock MinIO（端口 9000）
npm run mock-minio

# 终端 2：Mock 后端（端口 3001）
npm run mock-server

# 终端 3：前端热更新（端口 5173）
npm run dev
```

### 3. 打开页面

```
http://localhost:5173
```

### 4. 端到端测试

```bash
npm run e2e
```

## 真实环境切换

编辑 `src/scanService.ts`：

```typescript
const USE_MOCK = false  // ← 改为 false 使用真实 MinIO
```

真实模式下连接：
- **MinIO 地址**：10.28.198.153:9010
- **用户名**：admin
- **密码**：A12345678
- **存储桶**：code-scanning

## Mock MinIO 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| `HEAD` | `/{objectName}` | 检查文件是否存在 |
| `GET` | `/{objectName}` | 下载文件 |
| `PUT` | `/{objectName}` | 上传文件 |
| `GET` | `/seed?uuid=xxx` | 注入测试 MD 文件 |
| `GET` | `/health` | 健康检查 |

## Mock 后端接口

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/scan/submit` | 提交扫描任务，立即返回 202，约 60s 后注入 MD |

## 接口文档

### POST /api/scan/submit

**Request**（multipart/form-data）

| 字段 | 类型 | 说明 |
|------|------|------|
| `file` | File | ZIP 代码包 |
| `prompt` | string | 提示词（末尾已追加 MinIO 上传指令） |
| `uuid` | string | 任务唯一标识 |

**Response**（202 Accepted）

```json
{
  "uuid": "550e8400-e29b-41d4-a716-446655440000",
  "status": "accepted",
  "message": "扫描任务已提交，后台处理中"
}
```

## 测试覆盖

| 测试项 | 状态 |
|--------|------|
| TypeScript 编译（tsc --noEmit） | ✅ |
| Vue SFC 类型检查（vue-tsc） | ✅ |
| Vite 生产构建 | ✅ |
| Mock MinIO PUT/GET/HEAD | ✅ |
| Mock 后端提交接口 | ✅ |
| ZIP 文件上传 UI | ✅ |
| 提示词模板填充 | ✅ |
| 提交扫描 → Step 3 | ✅ |
| 轮询检测文件 → Step 4 | ✅ |
| MD 渲染 HTML（H1/表格/code） | ✅ |
| 重新扫描状态重置 | ✅ |

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `VITE_MOCK_MODE` | `true` | 是否使用 Mock 模式 |

## License

MIT
