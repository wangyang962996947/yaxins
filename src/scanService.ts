/**
 * scanService.ts — 核心业务逻辑
 *
 * 所有请求完全在浏览器内模拟（simulator.ts）
 * 对接真实后端时：
 *   1. 将 submitScanTask 改为 axios POST 到真实接口
 *   2. 将 fileExists/downloadTextFile 改为真实 MinIO 客户端调用
 */

import {
  submitScanTask as simSubmit,
  fileExists,
  downloadTextFile,
  POLL_INTERVAL_MS,
  MAX_WAIT_MS,
} from './simulator'

// ============= 导出函数 =============

export function buildPromptWithUploadInstruction(
  originalPrompt: string,
  uuid: string
): string {
  // 追加 MinIO 上传指令，提示后端大模型将报告上传到 MinIO
  return `${originalPrompt}

请将生成的代码扫描报告文件上传到 MinIO 对象存储：
- MinIO 地址：10.28.198.153:9010
- 用户名：admin
- 密码：A12345678
- 存储桶：code-scanning
- 文件名：${uuid}
（请直接上传原始 Markdown 文件，不要压缩）`
}

/**
 * 提交扫描任务
 * - 提示词已在 CodeScanner.vue 中由 buildPromptWithUploadInstruction 追加指令
 * - 这里直接提交给本地模拟器（真实对接时改为 axios POST）
 */
export async function submitScanTask(
  zipFile: File,
  enrichedPrompt: string,
  uuid: string
): Promise<{ uuid: string; status: string; message: string }> {
  // 真实后端对接时替换为：
  // const formData = new FormData()
  // formData.append('file', zipFile)
  // formData.append('prompt', enrichedPrompt)
  // formData.append('uuid', uuid)
  // return axios.post('/api/scan/submit', formData, { ... }).then(r => r.data)
  return simSubmit(zipFile, enrichedPrompt, uuid)
}

/**
 * 轮询等待结果
 * - 轮询本地模拟器的内存存储（真实对接时改为真实 MinIO 客户端）
 */
let _canceled = false

export async function waitForResult(
  uuid: string,
  onProgress?: (elapsedMs: number) => void,
  onTick?: () => void
): Promise<string> {
  _canceled = false
  const startTime = Date.now()
  const deadline = startTime + MAX_WAIT_MS

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
