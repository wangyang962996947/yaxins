import { useState, useCallback } from 'react';
import { submitScanTask } from '../services/scanApi';
import { useMinioPolling } from './useMinioPolling';
import { markdownToHtml } from '../utils/markdownToHtml';
import type { ScanTask } from '../types';

// 注入到用户提示词末尾的 MinIO 上传指令
const MINIO_INJECTION = `，
请在扫描完成后将生成的报告文件上传到 MinIO 存储：
- MinIO 地址：10.28.198.153:9010
- 用户名：admin
- 密码：A12345678
- 桶名：code-scanning
- 文件名格式：{UUID}（使用生成的 UUID 作为文件名）
- 文件格式：.md`;

const initialTask: ScanTask = {
  taskId: '',
  status: 'idle',
  progress: 0,
  message: '等待上传文件',
  uploadedFileName: '',
  prompt: '',
};

export function useScanTask() {
  const [task, setTask] = useState<ScanTask>(initialTask);

  const polling = useMinioPolling({
    objectName: '',
    interval: 10000,
    maxAttempts: 90,
    onFound: (mdContent: string) => {
      const html = markdownToHtml(mdContent);
      setTask(s => ({
        ...s,
        status: 'done',
        progress: 100,
        message: '扫描完成，报告已生成',
        resultMdContent: mdContent,
        resultHtml: html,
        finishedAt: Date.now(),
      }));
    },
    onTimeout: () => {
      setTask(s => ({
        ...s,
        status: 'error',
        message: '扫描超时（超过15分钟），请稍后重试',
      }));
    },
    onProgress: (count: number) => {
      const progress = Math.min(Math.round((count / 90) * 70) + 10, 80);
      const remainingMin = Math.round((90 - count) * 10 / 60);
      setTask(s => ({
        ...s,
        progress,
        message: `正在等待后端处理...（${count}/90，约剩${remainingMin}分钟）`,
      }));
    },
  });

  const startScan = useCallback(async (file: File, prompt: string) => {
    const uuid = crypto.randomUUID();

    // 注入 MinIO 上传指令
    const fullPrompt = prompt.trim() + MINIO_INJECTION;

    setTask({
      ...initialTask,
      taskId: uuid,
      status: 'uploading',
      progress: 5,
      message: '正在提交任务...',
      uploadedFileName: file.name,
      prompt: fullPrompt,
    });

    try {
      // 1. 提交任务
      const response = await submitScanTask({ file, prompt: fullPrompt });

      setTask(s => ({
        ...s,
        taskId: response.taskId,
        status: 'scanning',
        progress: 10,
        message: '任务已提交，等待后端处理...',
        startedAt: Date.now(),
      }));

      // 2. 开始轮询 MinIO
      polling.start();

    } catch (err: any) {
      setTask(s => ({
        ...s,
        status: 'error',
        message: `提交失败：${err.message}`,
        error: err.message,
      }));
    }
  }, [polling]);

  const reset = useCallback(() => {
    polling.stop();
    setTask(initialTask);
  }, [polling]);

  return { task, startScan, reset, isPolling: polling.isPolling };
}
