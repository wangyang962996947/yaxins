/**
 * scanService.ts — 核心业务逻辑
 * 流程：提交任务 → 轮询 MinIO → 返回 MD 内容
 */

import axios from 'axios'
import { v4 as uuidv4 } from 'uuid'

// ============= 模式切换 =============
const USE_MOCK = true  // ← 改 false 使用真实 MinIO

// 动态导入，避免未安装 minio 时 build 报错
async function getMinioClient() {
  if (USE_MOCK) {
    const m = await import('./mockMinioClient')
    return { fileExists: m.fileExists, downloadTextFile: m.downloadTextFile }
  } else {
    const m = await import('./minio')
    return { fileExists: m.fileExists, downloadTextFile: m.downloadTextFile }
  }
}

// ============= 配置 =============
const BACKEND_SUBMIT_URL = USE_MOCK
  ? 'http://localhost:3001/api/scan/submit'
  : '/api/scan/submit'

const POLL_INTERVAL_MS = USE_MOCK ? 5_000 : 10_000
const MAX_WAIT_MS = USE_MOCK ? 5 * 60 * 1000 : 15 * 60 * 1000
// ==================================

let _canceled = false

// ============= 导出函数 =============

export function generateUUID(): string {
  return uuidv4()
}

export function buildPromptWithUploadInstruction(
  originalPrompt: string,
  _uuid: string
): string {
  if (USE_MOCK) {
    return `${originalPrompt}\n\n请生成一份中文 Markdown 格式的代码扫描报告。`
  }
  return `${originalPrompt}

请将生成的代码扫描报告文件上传到 MinIO 对象存储：
- MinIO 地址：10.28.198.153:9010
- 用户名：admin
- 密码：A12345678
- 存储桶：code-scanning
- 文件名：${_uuid}
（请直接上传原始 Markdown 文件，不要压缩）`
}

export async function submitScanTask(
  zipFile: File,
  enrichedPrompt: string,
  uuid: string
): Promise<{ uuid: string }> {
  const formData = new FormData()
  formData.append('file', zipFile)
  formData.append('prompt', enrichedPrompt)
  formData.append('uuid', uuid)

  const response = await axios.post(BACKEND_SUBMIT_URL, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 30_000,
  })
  return response.data
}

export async function waitForResult(
  uuid: string,
  onProgress?: (elapsedMs: number) => void,
  onTick?: () => void
): Promise<string> {
  _canceled = false
  const startTime = Date.now()
  const deadline = startTime + MAX_WAIT_MS
  const { fileExists, downloadTextFile } = await getMinioClient()

  while (!_canceled && Date.now() < deadline) {
    const elapsed = Date.now() - startTime
    onProgress?.(elapsed)

    try {
      const exists = await fileExists(uuid)
      if (exists) {
        const content = await downloadTextFile(uuid)
        return content
      }
    } catch (err) {
      console.warn(`[waitForResult] 轮询出错:`, err)
    }

    onTick?.()
    await sleep(POLL_INTERVAL_MS)
  }

  if (_canceled) throw new Error('用户取消了扫描')
  throw new Error(`扫描超时（等待超过 ${MAX_WAIT_MS / 1000} 秒）`)
}

export function cancelWait(): void {
  _canceled = true
}

export function resetCancel(): void {
  _canceled = false
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
