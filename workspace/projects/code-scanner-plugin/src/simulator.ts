/// <reference types="vite/client" />

/**
 * simulator.ts — 浏览器端本地模拟器
 *
 * 作用：完全在浏览器内模拟"后端处理 + MinIO 存储"的完整流程
 * 行为：submitScanTask → 存储报告列表到内存 Map → 5~8s 后标记为就绪
 *        waitForResult → 返回报告列表（含序号/文件名/生成时间/HTML内容）
 */

import type { ReportItem } from './scanService'

// ============= 内存中的"MinIO"存储 =============

type StoredReports = {
  items: ReportItem[]
  ready: boolean
}

const fileStore = new Map<string, StoredReports>()

// ============= 全局 seed 入口（供 E2E 测试调用） =============
// 直接在 window 上暴露，无需 import
declare global {
  interface Window {
    __simulatorSeed?: (uuid: string, items: ReportItem[]) => void
  }
}

window.__simulatorSeed = (uuid: string, items: ReportItem[]) => {
  fileStore.set(uuid, { items, ready: true })
  console.info(`[Simulator] seed 注入 uuid=${uuid}, ${items.length} 份报告`)
}

// ============= 内嵌两份示例报告（Vite glob 静态导入） =============

// 使用 import.meta.glob 静态导入 public 目录下的 HTML 文件（构建时内联）
const SAMPLE_REPORTS: Record<string, string> = import.meta.glob('/public/sample-reports/*.html', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

function getSampleReports(): { html1: string; html2: string } {
  const keys = Object.keys(SAMPLE_REPORTS).sort()
  return {
    html1: SAMPLE_REPORTS[keys[0]] ?? '',
    html2: SAMPLE_REPORTS[keys[1]] ?? '',
  }
}

// ============= 模拟后端：生成报告列表 =============

function buildReportList(uuid: string): ReportItem[] {
  const { html1, html2 } = getSampleReports()
  const now = new Date()
  const pad = (n: number) => n.toString().padStart(2, '0')
  const timeStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`

  return [
    {
      index: 1,
      filename: '携转用户开户-业务逻辑安全分析报告.html',
      generateTime: timeStr,
      htmlContent: html1,
    },
    {
      index: 2,
      filename: '携转用户开户-业务逻辑说明文档.html',
      generateTime: timeStr,
      htmlContent: html2,
    },
  ]
}

// ============= 模拟后端提交接口 =============

export async function submitScanTask(
  zipFile: File,
  enrichedPrompt: string,
  uuid: string
): Promise<{ uuid: string; status: string; message: string }> {
  const delayMs = 5000 + Math.random() * 3000 // 5~8 秒

  setTimeout(() => {
    const items = buildReportList(uuid)
    fileStore.set(uuid, { items, ready: true })
    console.info(`[Simulator] 报告列表已生成 uuid=${uuid} (延迟 ${(delayMs / 1000).toFixed(1)}s)`)
  }, delayMs)

  return {
    uuid,
    status: 'accepted',
    message: '扫描任务已提交，后台处理中（约 5~8 秒）',
  }
}

// ============= 模拟 MinIO fileExists =============

export async function fileExists(uuid: string): Promise<boolean> {
  // E2E 测试通过 window.__simulatorSeed 注入时会提前设置 ready=true
  const store = fileStore.get(uuid)
  return store?.ready === true
}

// ============= 模拟 MinIO downloadReportList =============

export async function downloadReportList(uuid: string): Promise<ReportItem[]> {
  const store = fileStore.get(uuid)
  if (!store || !store.ready) {
    throw new Error(`报告列表不存在或未就绪: ${uuid}`)
  }
  return store.items
}

// ============= 轮询配置 =============

export const POLL_INTERVAL_MS = 2_000
export const MAX_WAIT_MS = 10 * 60 * 1000
