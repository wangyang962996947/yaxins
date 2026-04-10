/**
 * scanService.ts — 核心业务逻辑
 * 流程：提交任务 → 轮询 MinIO → 返回报告列表
 */

import { v4 as uuidv4 } from 'uuid'

// ============= 报告项类型 =============

export type ReportItem = {
  index: number          // 序号
  filename: string        // 文件名
  generateTime: string    // 生成时间
  htmlContent: string     // HTML 内容
}

// ============= 动态导入模拟器（真实对接时替换这里） =============

async function getSimulator() {
  const m = await import('./simulator')
  return {
    submitScanTask: m.submitScanTask,
    fileExists: m.fileExists,
    downloadReportList: m.downloadReportList,
  }
}

// ============= 配置 =============

const MINIO_UPLOAD_URL = 'http://10.28.198.153:9010/code-scanning/'

// ============= 提示词构造 =============

export function buildPromptWithUploadInstruction(prompt: string, uuid: string): string {
  return `${prompt}

请将生成的代码扫描报告文件上传到 MinIO 对象存储：
- 地址：${MINIO_UPLOAD_URL}
- 用户名：admin
- 桶名：code-scanning
- 文件名：${uuid}.md`
}

// ============= 提交扫描任务 =============

export async function submitScanTask(
  zipFile: File,
  enrichedPrompt: string,
  uuid: string
): Promise<{ uuid: string; status: string; message: string }> {
  // 使用浏览器端模拟器，避免依赖后端服务
  const sim = await getSimulator()
  return sim.submitScanTask(zipFile, enrichedPrompt, uuid)
}

// ============= 轮询等待结果（返回报告列表） =============

export async function waitForResult(
  uuid: string,
  onElapsed?: (ms: number) => void,
  onPoll?: () => void
): Promise<ReportItem[]> {
  const sim = await getSimulator()
  const startTime = Date.now()
  const MAX_WAIT_MS = 10 * 60 * 1000

  while (Date.now() - startTime < MAX_WAIT_MS) {
    onPoll?.()

    try {
      const ready = await sim.fileExists(uuid)
      if (ready) {
        const items = await sim.downloadReportList(uuid)
        console.info(`[scanService] 报告列表就绪，共 ${items.length} 份`)
        return items
      }
    } catch (err: any) {
      console.warn(`[scanService] 轮询出错: ${err.message}`)
    }

    onElapsed?.(Date.now() - startTime)
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 2000))
  }

  throw new Error('等待超时，报告未能在规定时间内生成')
}

// ============= 取消轮询 =============

let currentController: AbortController | null = null

export function cancelWait() {
  currentController?.abort()
}

export function resetCancel() {
  currentController = null
}
