# 🔍 代码扫描插件

基于 Vue 3 + TypeScript 的前端代码扫描插件。上传 ZIP 包 → 输入提示词 → 提交扫描 → 异步等待 → MD 转 HTML 展示报告。

> **无需任何外部服务**，所有逻辑在浏览器内本地模拟。

## 功能流程

```
上传 ZIP → 输入提示词 → buildPromptWithUploadInstruction 追加 MinIO 上传指令
    → submitScanTask（本地模拟：存储报告到内存，5~8s 后就绪）
    → waitForResult 轮询内存状态（2s 间隔）
    → 文件就绪 → downloadTextFile → marked(MD→HTML) → 展示报告
    → 下载 MD / 重新扫描
```

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | Vue 3 + Composition API + `<script setup>` |
| 语言 | TypeScript（strict 模式） |
| 构建 | Vite 6 |
| Markdown 渲染 | marked |
| 样式 | 原生 CSS（Scoped + 全局 markdown-body） |
| 自动化测试 | Playwright E2E |

## 项目结构

```
projects/code-scanner-plugin/
├── src/
│   ├── App.vue                  # 根组件
│   ├── main.ts                  # 入口
│   ├── CodeScanner.vue         # 🔵 核心组件（4步状态机）
│   ├── scanService.ts          # 🔵 核心业务逻辑
│   │                               # - buildPromptWithUploadInstruction
│   │                               # - submitScanTask（调用 simulator）
│   │                               # - waitForResult（轮询内存状态）
│   ├── simulator.ts             # 🔵 本地模拟器（无外部依赖）
│   │                               # - submitScanTask：生成假报告，5~8s 后标记就绪
│   │                               # - fileExists：检查内存 Map
│   │                               # - downloadTextFile：返回内存中的 MD 内容
│   └── minio.ts                 # 真实 MinIO 客户端（真实对接时启用）
├── e2e-test.mjs                 # Playwright 全链路自动化测试
├── vite.config.ts              # Vite 配置
└── package.json
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

### 本地模拟器（simulator.ts）

`submitScanTask` 调用后：
1. 从提示词推断扫描类型（安全/质量/综合）
2. 生成对应风格的假 MD 报告（存储到内存 Map）
3. 5~8 秒后标记为就绪
4. `waitForResult` 轮询内存 Map，文件就绪后返回内容

报告风格：
- **安全扫描** → 🔒 安全扫描报告（H1 + 漏洞表格 + 代码修复示例）
- **代码质量** → 📋 质量评估报告（评分 + 复杂度分析）
- **综合扫描** → 📝 综合扫描报告（概要 + 主要发现）

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动开发服务器

```bash
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

> 无需启动任何额外服务！所有模拟逻辑在浏览器内运行。

## 真实后端对接

对接真实后端和 MinIO 时，修改 `src/scanService.ts` 中的两处调用：

```typescript
// 1. submitScanTask → 改为 axios POST 到真实接口
const formData = new FormData()
formData.append('file', zipFile)
formData.append('prompt', enrichedPrompt)
formData.append('uuid', uuid)
return axios.post('https://your-backend.com/api/scan/submit', formData, {
  headers: { 'Content-Type': 'multipart/form-data' },
  timeout: 30_000,
}).then(r => r.data)

// 2. fileExists / downloadTextFile → 改为 src/minio.ts 中的真实 MinIO 客户端
import { fileExists, downloadTextFile } from './minio'
```

真实 MinIO 配置：
- **地址**：10.28.198.153:9010
- **用户名**：admin
- **密码**：A12345678
- **存储桶**：code-scanning

## 测试覆盖

| 测试项 | 状态 |
|--------|------|
| TypeScript 编译（tsc --noEmit） | ✅ |
| Vue SFC 类型检查（vue-tsc） | ✅ |
| Vite 生产构建 | ✅ |
| ZIP 文件上传 UI | ✅ |
| 提示词模板填充 | ✅ |
| 提交扫描 → Step 3 | ✅ |
| 轮询等待（5~8s 模拟） → Step 4 | ✅ |
| MD 渲染 HTML（H1/表格） | ✅ |
| 下载 MD / 重新扫描按钮 | ✅ |
| 重新扫描状态重置 | ✅ |

## 轮询配置

| 参数 | 值 | 说明 |
|------|------|------|
| 轮询间隔 | 2 秒 | 本地模拟模式 |
| 最长等待 | 10 分钟 | 超时阈值 |
| 模拟处理时间 | 5~8 秒 | 随机延迟 |

## License

MIT
