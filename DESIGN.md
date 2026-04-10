# 代码扫描插件设计方案

> 流程：上传 ZIP → 补充提示词提交 → 异步轮询 MinIO → 下载 MD → MD 转 HTML → 页面展示

---

## 一、整体架构

```
用户上传 ZIP
    ↓
前端拼接提示词（含 MinIO 上传指令）
    ↓
调用后端提交扫描任务（返回 UUID）
    ↓
前端轮询 MinIO（定时查桶，文件名=UUID）
    ↓
文件出现 → 下载 MD 内容
    ↓
marked.js 转 HTML
    ↓
渲染到插件页面
```

---

## 二、MinIO 工具函数

```typescript
// minio.ts
import * as Minio from 'minio'

const minioClient = new Minio.Client({
  endPoint: '10.28.198.153',
  port: 9010,
  useSSL: false,
  accessKey: 'admin',
  secretKey: 'A12345678',
})

const BUCKET = 'code-scanning'

/**
 * 检查文件是否存在
 */
export async function fileExists(uuid: string): Promise<boolean> {
  try {
    await minioClient.statObject(BUCKET, uuid)
    return true
  } catch (err: any) {
    if (err.code === 'NotFound') return false
    throw err
  }
}

/**
 * 下载文件内容
 */
export async function downloadFile(uuid: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    minioClient.getObject(BUCKET, uuid, (err, stream) => {
      if (err) return reject(err)
      stream.on('data', (chunk) => chunks.push(chunk))
      stream.on('end', () => resolve(Buffer.concat(chunks)))
      stream.on('error', reject)
    })
  })
}
```

---

## 三、核心业务逻辑

```typescript
// scanService.ts
import { v4 as uuidv4 } from 'uuid'
import { fileExists, downloadFile } from './minio'
import axios from 'axios'

const BACKEND_URL = '/api/scan/submit'   // 后端提交接口（可模拟）
const POLL_INTERVAL_MS = 10_000         // 轮询间隔 10 秒
const MAX_WAIT_MS = 15 * 60 * 1000       // 最多等 15 分钟

/** 生成 UUID */
export function generateUUID(): string {
  return uuidv4()
}

/** 拼接提示词：追加 MinIO 上传指令 */
export function buildPromptWithUploadInstruction(
  originalPrompt: string,
  uuid: string
): string {
  return `${originalPrompt}\n\n请将生成的代码扫描报告文件上传到 MinIO 对象存储。\n- MinIO 地址：10.28.198.153:9010\n- 用户名：admin\n- 密码：A12345678\n- 存储桶：code-scanning\n- 文件名：${uuid}\n（请直接上传，不要做任何格式转换或压缩）`
}

/** 提交扫描任务到后端 */
export async function submitScanTask(
  zipFile: File,
  prompt: string
): Promise<{ uuid: string }> {
  // ========== 真实后端调用 ==========
  const formData = new FormData()
  formData.append('file', zipFile)
  formData.append('prompt', prompt)
  formData.append('uuid', generateUUID())

  const response = await axios.post(BACKEND_URL, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return response.data   // { uuid: "xxx" }

  // ========== 模拟实现（开发调试用）==========
  // const mockUUID = generateUUID()
  // setTimeout(() => simulateFileUpload(mockUUID), 30_000) // 30秒后"生成"文件
  // return { uuid: mockUUID }
}

/** 轮询等待文件出现 */
export async function waitForResult(
  uuid: string,
  onProgress?: (elapsed: number) => void
): Promise<string> {
  const startTime = Date.now()
  const deadline = startTime + MAX_WAIT_MS

  while (Date.now() < deadline) {
    const exists = await fileExists(uuid)
    if (exists) {
      const buffer = await downloadFile(uuid)
      return buffer.toString('utf-8')
    }

    onProgress?.(Date.now() - startTime)
    await sleep(POLL_INTERVAL_MS)
  }

  throw new Error(`扫描超时（超过 ${MAX_WAIT_MS / 1000}s），请稍后重试`)
}

/** 取消轮询 */
let _canceled = false
export function cancelWait(): void { _canceled = true }
export function resetCancel(): void { _canceled = false }

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
```

---

## 四、前端组件（Vue 3 示例）

```vue
<!-- CodeScanner.vue -->
<template>
  <div class="scanner-plugin">
    <!-- Step 1: 上传 ZIP -->
    <div v-if="step === 1" class="step-box">
      <h3>① 上传代码包</h3>
      <input type="file" accept=".zip" @change="onFileChange" />
      <p v-if="selectedFile">已选: {{ selectedFile.name }}</p>
      <button :disabled="!selectedFile" @click="step = 2">下一步</button>
    </div>

    <!-- Step 2: 输入提示词 -->
    <div v-if="step === 2" class="step-box">
      <h3>② 输入扫描提示词</h3>
      <textarea v-model="prompt" rows="8" placeholder="请输入代码扫描指令..." />
      <div class="btn-row">
        <button @click="step = 1">上一步</button>
        <button :disabled="!prompt.trim()" @click="submitScan">提交扫描</button>
      </div>
    </div>

    <!-- Step 3: 轮询等待 -->
    <div v-if="step === 3" class="step-box waiting">
      <h3>③ 扫描进行中</h3>
      <p>任务 ID：{{ taskUUID }}</p>
      <p>已等待：{{ formatElapsed(elapsedMs) }}</p>
      <p class="hint">预计需要 10-15 分钟，请勿关闭页面</p>
      <button @click="cancelScan">取消</button>
    </div>

    <!-- Step 4: 展示结果 -->
    <div v-if="step === 4" class="step-box result">
      <h3>④ 扫描结果</h3>
      <button class="secondary" @click="reset">重新扫描</button>
      <div class="report-content" v-html="reportHtml" />
    </div>

    <!-- 错误态 -->
    <div v-if="step === 'error'" class="step-box error">
      <p>{{ errorMessage }}</p>
      <button @click="reset">重试</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { marked } from 'marked'
import {
  generateUUID,
  buildPromptWithUploadInstruction,
  submitScanTask,
  waitForResult,
  cancelWait,
  resetCancel,
} from './scanService'

const step = ref<1 | 2 | 3 | 4 | 'error'>(1)
const selectedFile = ref<File | null>(null)
const prompt = ref('')
const taskUUID = ref('')
const elapsedMs = ref(0)
const reportHtml = ref('')
const errorMessage = ref('')
let pollTimer: ReturnType<typeof setInterval> | null = null

function onFileChange(e: Event) {
  selectedFile.value = (e.target as HTMLInputElement).files?.[0] ?? null
}

async function submitScan() {
  step.value = 3
  elapsedMs.value = 0
  taskUUID.value = generateUUID()
  resetCancel()

  // 启动耗时计时
  const startTime = Date.now()
  pollTimer = setInterval(() => {
    elapsedMs.value = Date.now() - startTime
  }, 1000)

  try {
    // 拼接含 MinIO 上传指令的提示词
    const enrichedPrompt = buildPromptWithUploadInstruction(prompt.value, taskUUID.value)

    // 提交任务（后端开始异步处理）
    await submitScanTask(selectedFile.value!, enrichedPrompt)

    // 轮询等待 MinIO 文件出现
    const mdContent = await waitForResult(taskUUID.value)
    reportHtml.value = await marked(mdContent)
    step.value = 4
  } catch (err: any) {
    errorMessage.value = err.message
    step.value = 'error'
  } finally {
    if (pollTimer) clearInterval(pollTimer)
  }
}

function cancelScan() {
  cancelWait()
  if (pollTimer) clearInterval(pollTimer)
  reset()
}

function reset() {
  step.value = 1
  selectedFile.value = null
  prompt.value = ''
  taskUUID.value = ''
  elapsedMs.value = 0
  reportHtml.value = ''
  errorMessage.value = ''
}

function formatElapsed(ms: number): string {
  const mins = Math.floor(ms / 60000)
  const secs = Math.floor((ms % 60000) / 1000)
  return `${mins} 分 ${secs} 秒`
}
</script>

<style scoped>
.scanner-plugin { max-width: 800px; margin: 0 auto; }
.step-box { padding: 24px; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 16px; }
textarea { width: 100%; font-family: monospace; box-sizing: border-box; }
.btn-row { display: flex; gap: 12px; margin-top: 12px; }
.report-content { margin-top: 16px; line-height: 1.6; }
.hint { color: #888; font-size: 14px; }
button { padding: 8px 16px; cursor: pointer; }
button:disabled { opacity: 0.5; cursor: not-allowed; }
button.secondary { margin-bottom: 16px; }
</style>
```

---

## 五、后端接口模拟（Express）

```typescript
// server/routes/scan.ts
import express from 'express'
import multer from 'multer'
import * as Minio from 'minio'

const router = express.Router()
const upload = multer({ dest: '/tmp/uploads' })

const minioClient = new Minio.Client({
  endPoint: '10.28.198.153',
  port: 9010,
  useSSL: false,
  accessKey: 'admin',
  secretKey: 'A12345678',
})

/**
 * POST /api/scan/submit
 *
 * 模拟实现（开发调试用）：
 * 接收请求后，60 秒后自动在 MinIO 桶中生成一个假 MD 文件。
 * 实际项目中删除整个 setTimeout，
 * 改为真正调用代码扫描服务（可能需要 10-15 分钟）。
 */
router.post('/submit', upload.single('file'), async (req, res) => {
  const { uuid, prompt } = req.body

  // 模拟异步处理（实际项目去掉这段）
  setTimeout(async () => {
    const fakeReport = `# 代码扫描报告

## 概要

- 文件总数：42
- 高危问题：3
- 中危问题：7
- 低危问题：12

## 详情

| 文件 | 问题 | 级别 |
|------|------|------|
| src/auth.js | 硬编码密钥 | 高 |
| src/api.js | SQL 注入风险 | 高 |
`
    const buffer = Buffer.from(fakeReport, 'utf-8')
    await minioClient.putObject('code-scanning', uuid, buffer, buffer.length)
    console.log(`[Mock] 文件已上传到 MinIO: ${uuid}`)
  }, 60_000)

  res.json({ uuid, status: 'accepted' })
})

export default router
```

---

## 六、完整流程图

```
用户               前端                     后端                    MinIO
 │                  │                        │                       │
 │  上传 ZIP         │                        │                       │
 │─────────────────>│                        │                       │
 │                  │                        │                       │
 │  输入提示词         │                        │                       │
 │─────────────────>│                        │                       │
 │                  │                        │                       │
 │  点击"提交扫描"      │  生成 UUID              │                       │
 │─────────────────>│  拼接 MinIO 上传指令     │                       │
 │                  │  POST /api/scan/submit │                       │
 │                  │───────────────────────>│                       │
 │                  │                        │  异步处理（10-15min）  │
 │                  │                        │───────────────────────>│
 │                  │                        │                       │
 │  显示等待界面        │  开始轮询（每10秒）       │                       │
 │<─────────────────│  statObject(uuid)      │                       │
 │                  │───────────────────────>│                       │
 │                  │                        │        NotFound        │
 │                  │<───────────────────────│                       │
 │                  │  sleep(10s)             │                       │
 │                  │  statObject(uuid)      │                       │
 │                  │───────────────────────>│                       │
 │                  │                        │        NotFound        │
 │                  │  ...（重复轮询）          │                       │
 │                  │                        │                       │
 │                  │  statObject(uuid)     │                       │
 │                  │───────────────────────>│                       │
 │                  │                        │  文件存在 ✓           │
 │                  │  getObject(uuid)       │                       │
 │                  │───────────────────────>│                       │
 │                  │<───────────────────────│  返回 MD 文件内容       │
 │                  │                        │                       │
 │  渲染 HTML 报告     │  marked(MD) → HTML     │                       │
 │<─────────────────│                        │                       │
```

---

## 七、关键设计要点

| 要点 | 说明 |
|------|------|
| **UUID 贯穿全程** | ZIP 上传时生成 UUID → 拼入提示词 → 轮询文件名 = UUID |
| **提示词注入** | MinIO 上传指令由前端拼接进 prompt，确保扫描服务知道文件写到哪里 |
| **短轮询 MinIO** | 每 10s 调一次 `statObject`，文件存在即下载，避免 WebSocket 改造 |
| **超时保护** | 15 分钟超时，前端显示实时等待时间，中途可取消 |
| **MD → HTML** | 用 `marked`，生产环境可加 `DOMPurify` 过滤 XSS |
| **模拟/真实切换** | `submitScanTask` 里有两段代码，注释切换即可 |
