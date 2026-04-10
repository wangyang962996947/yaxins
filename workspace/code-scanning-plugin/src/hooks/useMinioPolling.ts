import { useState, useEffect, useRef, useCallback } from 'react';
import { minioService } from '../services/minioService';

export interface PollingState {
  isPolling: boolean;
  found: boolean;
  checkedCount: number;
  error?: string;
}

export interface UseMinioPollingOptions {
  objectName: string;
  /** 轮询间隔 ms，默认 10000 */
  interval?: number;
  /** 最大轮询次数，默认 90（约 15 分钟） */
  maxAttempts?: number;
  onFound?: (content: string) => void;
  onTimeout?: () => void;
  onProgress?: (count: number) => void;
}

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

export function useMinioPolling({
  objectName,
  interval = 10000,
  maxAttempts = 90,
  onFound,
  onTimeout,
  onProgress,
}: UseMinioPollingOptions) {
  const [state, setState] = useState<PollingState>({
    isPolling: false,
    found: false,
    checkedCount: 0,
  });

  const stoppedRef = useRef(false);

  const stop = useCallback(() => {
    stoppedRef.current = true;
    setState(s => ({ ...s, isPolling: false }));
  }, []);

  const start = useCallback(async () => {
    stoppedRef.current = false;
    let count = 0;

    setState({ isPolling: true, found: false, checkedCount: 0 });

    while (!stoppedRef.current && count < maxAttempts) {
      count++;
      setState(s => ({ ...s, checkedCount: count }));
      onProgress?.(count);

      try {
        const exists = await minioService.fileExists(objectName);

        if (exists) {
          setState({ isPolling: false, found: true, checkedCount: count });
          const content = await minioService.getFileContent(objectName);
          onFound?.(content);
          return;
        }
      } catch (err: any) {
        // 网络抖动不中断，继续轮询
        console.warn(`[MinIO] check #${count} failed:`, err.message);
      }

      await sleep(interval);
    }

    if (!stoppedRef.current) {
      setState({ isPolling: false, found: false, checkedCount: maxAttempts });
      onTimeout?.();
    }
  }, [objectName, interval, maxAttempts, onFound, onTimeout, onProgress]);

  useEffect(() => {
    return () => { stoppedRef.current = true; };
  }, []);

  return { ...state, start, stop };
}
