import type { ScanRequest, ScanResponse } from '../types';

/**
 * 模拟后端接口：提交扫描任务
 * 真实场景：POST /api/scan/submit
 */
export async function submitScanTask(request: ScanRequest): Promise<ScanResponse> {
  await delay(800);

  const taskId = crypto.randomUUID();

  console.log(`[Mock API] 提交扫描任务`);
  console.log(`[Mock API] 文件: ${request.file.name} (${formatBytes(request.file.size)})`);
  console.log(`[Mock API] 提示词长度: ${request.prompt.length} chars`);
  console.log(`[Mock API] Task ID: ${taskId}`);

  return {
    taskId,
    status: 'accepted',
    message: '扫描任务已提交，后台处理中',
  };
}

/**
 * 模拟后端接口：查询任务状态
 * 真实场景：GET /api/scan/status/:taskId
 */
export async function getScanStatus(taskId: string): Promise<{
  status: string;
  progress: number;
  message: string;
}> {
  await delay(300);
  return {
    status: 'scanning',
    progress: 50,
    message: '正在扫描代码...',
  };
}

function delay(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
