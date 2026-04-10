# 代码扫描插件 - 前端实现方案

## 项目结构

```
src/
├── components/
│   └── CodeScanner/
│       ├── index.tsx              # 主组件入口
│       ├── UploadZone.tsx         # ZIP 上传区
│       ├── PromptInput.tsx        # 提示词输入区
│       ├── ScanStatus.tsx         # 扫描状态展示
│       ├── ResultViewer.tsx       # MD→HTML 结果展示
│       └── hooks/
│           ├── useScanTask.ts     # 扫描任务状态管理
│           └── useMinioPolling.ts # MinIO 文件轮询
├── services/
│   ├── scanApi.ts                 # 后端接口（模拟实现）
│   └── minioService.ts            # MinIO SDK 封装
├── utils/
│   └── markdownToHtml.ts          # MD → HTML 转换
├── types/
│   └── index.ts                   # 类型定义
└── App.tsx                        # 接入示例
```

---

## 1. 类型定义

```typescript
// src/components/CodeScanner/types/index.ts

export interface ScanTask {
  taskId: string;
  status: 'idle' | 'uploading' | 'scanning' | 'processing' | 'done' | 'error';
  progress: number; // 0-100
  message: string;
  uploadedFileName: string;
  prompt: string;
  resultMdContent?: string;   // 原始 MD 内容
  resultHtml?: string;       // 转换后的 HTML
  error?: string;
  startedAt?: number;
  finishedAt?: number;
}

export interface ScanRequest {
  file: File;
  prompt: string;
  // 内部自动注入上传指令，不需要用户感知
}

export interface ScanResponse {
  taskId: string;
  status: string;
  message: string;
}

export interface MinioFile {
  name: string;
  size: number;
  lastModified: Date;
  url: string;
}
```

---

## 2. MinIO 服务封装

```typescript
// src/components/CodeScanner/services/minioService.ts

import { MinioClient } from 'minio-js-sdk'; // 或使用替代库

// ⚠️ 生产环境请通过后端代理访问 MinIO，避免前端暴露凭证
const MINIO_CONFIG = {
  endPoint: '10.28.198.153',
  port: 9000,  // MinIO API 端口
  useSSL: false,
  accessKey: 'admin',
  secretKey: 'A12345678',
  bucket: 'code-scanning',
};

class MinioService {
  private client: MinioClient;

  constructor() {
    this.client = new MinioClient({
      endPoint: MINIO_CONFIG.endPoint,
      port: MINIO_CONFIG.port,
      useSSL: MINIO_CONFIG.useSSL,
      accessKey: MINIO_CONFIG.accessKey,
      secretKey: MINIO_CONFIG.secretKey,
    });
  }

  /**
   * 检查指定 UUID 文件是否存在
   */
  async fileExists(objectName: string): Promise<boolean> {
    try {
      await this.client.statObject(MINIO_CONFIG.bucket, objectName);
      return true;
    } catch (err: any) {
      if (err.code === 'NotFound') {
        return false;
      }
      throw err;
    }
  }

  /**
   * 下载文件内容（文本文件，如 MD）
   */
  async getFileContent(objectName: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const stream = this.client.getObject(MINIO_CONFIG.bucket, objectName);
      
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      stream.on('error', reject);
    });
  }

  /**
   * 获取文件下载 URL（预签名链接）
   */
  async getFileUrl(objectName: string, expirySeconds = 3600): Promise<string> {
    return this.client.presignedGetObject(
      MINIO_CONFIG.bucket,
      objectName,
      expirySeconds
    );
  }
}

export const minioService = new MinioService();
```

> **⚠️ 安全提示**：前端直接访问 MinIO 会暴露凭证。生产环境务必通过后端代理，参考架构：
> ```
> 前端 → 后端 API → MinIO（后端持有凭证）
> ```

---

## 3. 后端接口模拟（可替换为真实 API）

```typescript
// src/components/CodeScanner/services/scanApi.ts

import type { ScanRequest, ScanResponse } from '../types';

/**
 * 模拟后端接口：提交扫描任务
 * 真实场景：POST /api/scan/submit
 */
export async function submitScanTask(request: ScanRequest): Promise<ScanResponse> {
  // === 模拟网络延迟 ===
  await delay(800);

  // 生成任务 ID（真实场景由后端生成 UUID）
  const taskId = crypto.randomUUID();

  // === 模拟上传 ZIP 到 MinIO ===
  console.log(`[模拟] 上传文件 ${request.file.name}，提示词已注入 MinIO 上传指令`);

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

  // 模拟进度推进（真实场景由后端返回真实进度）
  return {
    status: 'scanning',
    progress: 50,
    message: '正在扫描代码...',
  };
}

// --- 工具 ---
function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

---

## 4. MinIO 轮询 Hook

```typescript
// src/components/CodeScanner/hooks/useMinioPolling.ts

import { useState, useEffect, useRef, useCallback } from 'react';
import { minioService } from '../services/minioService';

export interface PollingState {
  isPolling: boolean;
  found: boolean;
  checkedCount: number;
  error?: string;
}

export interface UseMinioPollingOptions {
  /** 要轮询的文件名（UUID） */
  objectName: string;
  /** 轮询间隔（ms），默认 10000 */
  interval?: number;
  /** 最大轮询次数，默认 90（约 15 分钟） */
  maxAttempts?: number;
  /** 找到文件后的回调 */
  onFound?: (content: string) => void;
  /** 超时回调 */
  onTimeout?: () => void;
  /** 轮询次数更新的回调 */
  onProgress?: (count: number) => void;
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

  const stopRef = useRef(false);
  const attemptsRef = useRef(0);

  const stop = useCallback(() => {
    stopRef.current = true;
    setState(s => ({ ...s, isPolling: false }));
  }, []);

  const start = useCallback(async () => {
    stopRef.current = false;
    attemptsRef.current = 0;
    setState({ isPolling: true, found: false, checkedCount: 0 });

    while (!stopRef.current && attemptsRef.current < maxAttempts) {
      attemptsRef.current++;
      setState(s => ({ ...s, checkedCount: attemptsRef.current }));
      onProgress?.(attemptsRef.current);

      try {
        const exists = await minioService.fileExists(objectName);

        if (exists) {
          setState(s => ({ ...s, isPolling: false, found: true }));
          const content = await minioService.getFileContent(objectName);
          onFound?.(content);
          return;
        }
      } catch (err: any) {
        // 网络抖动时继续轮询，不中断
        console.warn(`[MinIO Polling] 第${attemptsRef.current}次检查异常:`, err.message);
      }

      // 等待下一个轮询间隔
      await sleep(interval);
    }

    if (!stopRef.current) {
      setState(s => ({ ...s, isPolling: false }));
      onTimeout?.();
    }
  }, [objectName, interval, maxAttempts, onFound, onTimeout, onProgress]);

  useEffect(() => {
    return () => { stopRef.current = true; };
  }, []);

  return { ...state, start, stop };
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

---

## 5. 扫描任务 Hook

```typescript
// src/components/CodeScanner/hooks/useScanTask.ts

import { useState, useCallback, useRef } from 'react';
import { submitScanTask } from '../services/scanApi';
import { useMinioPolling } from './useMinioPolling';
import { markdownToHtml } from '../utils/markdownToHtml';
import type { ScanTask } from '../types';

// === MinIO 配置常量 ===
const MINIO_UPLOAD_INSTRUCTIONS = `，
请在扫描完成后将生成的报告文件上传到 MinIO 存储：
- MinIO 地址：10.28.198.153:9010
- 用户名：admin
- 密码：A12345678
- 桶名：code-scanning
- 文件名格式：{UUID}（使用生成的 UUID 作为文件名）
- 文件格式：.md`;

export function useScanTask() {
  const [task, setTask] = useState<ScanTask>({
    taskId: '',
    status: 'idle',
    progress: 0,
    message: '等待上传文件',
    uploadedFileName: '',
    prompt: '',
  });

  const objectNameRef = useRef<string>('');

  // MinIO 轮询
  const minioPolling = useMinioPolling({
    objectName: objectNameRef.current,
    interval: 10000,
    maxAttempts: 90,
    onFound: (mdContent) => {
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
        message: '扫描超时（超过15分钟），请稍后重试或联系管理员',
      }));
    },
    onProgress: (count) => {
      // 轮询进度映射到任务进度（0~70%）
      const progress = Math.min(Math.round((count / 90) * 70) + 10, 80);
      setTask(s => ({
        ...s,
        progress,
        message: `正在等待后端处理...（${count}/90，约 ${Math.round((90 - count) * 10 / 60)} 分钟）`,
      }));
    },
  });

  /**
   * 提交扫描任务
   * 关键：在用户提示词后自动注入 MinIO 上传指令
   */
  const startScan = useCallback(async (file: File, prompt: string) => {
    // 生成 UUID 作为 MinIO 文件名
    const uuid = crypto.randomUUID();
    objectNameRef.current = uuid;

    // 自动注入 MinIO 上传指令
    const fullPrompt = prompt + MINIO_UPLOAD_INSTRUCTIONS;

    setTask({
      taskId: uuid,
      status: 'uploading',
      progress: 5,
      message: '正在上传文件...',
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
        message: '任务已提交，开始扫描...',
        startedAt: Date.now(),
      }));

      // 2. 开始轮询 MinIO
      minioPolling.start();

    } catch (err: any) {
      setTask(s => ({
        ...s,
        status: 'error',
        message: `提交失败：${err.message}`,
        error: err.message,
      }));
    }
  }, [minioPolling]);

  /**
   * 重置任务
   */
  const reset = useCallback(() => {
    minioPolling.stop();
    setTask({
      taskId: '',
      status: 'idle',
      progress: 0,
      message: '等待上传文件',
      uploadedFileName: '',
      prompt: '',
    });
  }, [minioPolling]);

  return { task, startScan, reset, isPolling: minioPolling.isPolling };
}
```

---

## 6. MD → HTML 工具

```typescript
// src/components/CodeScanner/utils/markdownToHtml.ts

// 使用 marked.js + DOMPurify（防止 XSS）
import { marked } from 'marked';
import DOMPurify from 'dompurify';

// 配置 marked
marked.setOptions({
  gfm: true,       // GitHub Flavored Markdown
  breaks: true,   // 换行符转 <br>
});

// 代码高亮（可选，使用 highlight.js）
import hljs from 'highlight.js';
const renderer = new marked.Renderer();
renderer.code = ({ text, lang }: { text: string; lang?: string }) => {
  const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext';
  const highlighted = hljs.highlight(text, { language }).value;
  return `<pre><code class="hljs language-${language}">${highlighted}</code></pre>`;
};

export function markdownToHtml(markdown: string): string {
  const rawHtml = marked(markdown, { renderer }) as string;
  // 清理潜在 XSS
  return DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS: [
      'h1','h2','h3','h4','h5','h6','p','br','hr',
      'ul','ol','li','blockquote','pre','code',
      'strong','em','del','a','img',
      'table','thead','tbody','tr','th','td',
      'span','div',
    ],
    ALLOWED_ATTR: ['href','src','alt','class','target'],
  });
}
```

---

## 7. 子组件

### 7.1 上传区

```tsx
// src/components/CodeScanner/UploadZone.tsx

import React, { useCallback } from 'react';

interface Props {
  disabled: boolean;
  onFileSelected: (file: File) => void;
  acceptedFileName?: string;
}

export const UploadZone: React.FC<Props> = ({
  disabled,
  onFileSelected,
  acceptedFileName,
}) => {
  const [dragOver, setDragOver] = React.useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;

    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.zip')) {
      onFileSelected(file);
    }
  }, [disabled, onFileSelected]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFileSelected(file);
  }, [onFileSelected]);

  return (
    <div
      className={`upload-zone ${dragOver ? 'drag-over' : ''} ${disabled ? 'disabled' : ''}`}
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => !disabled && document.getElementById('zip-file-input')?.click()}
    >
      <input
        id="zip-file-input"
        type="file"
        accept=".zip"
        style={{ display: 'none' }}
        onChange={handleFileInput}
        disabled={disabled}
      />
      {acceptedFileName ? (
        <div className="file-ready">
          <span className="file-icon">📦</span>
          <span className="file-name">{acceptedFileName}</span>
          {!disabled && <span className="file-tip">（点击可重新选择）</span>}
        </div>
      ) : (
        <div className="placeholder">
          <span className="upload-icon">📁</span>
          <p>拖拽 ZIP 文件到此处，或<span>点击选择</span></p>
          <p className="hint">支持 .zip 格式</p>
        </div>
      )}
    </div>
  );
};
```

### 7.2 扫描状态展示

```tsx
// src/components/CodeScanner/ScanStatus.tsx

import React from 'react';
import type { ScanTask } from '../types';

const STATUS_CONFIG = {
  idle:      { label: '等待中',   color: '#999', icon: '⏳' },
  uploading: { label: '上传中',   color: '#1890ff', icon: '⬆️' },
  scanning:  { label: '扫描中',   color: '#722ed1', icon: '🔍' },
  processing:{ label: '处理中',   color: '#fa8c16', icon: '⚙️' },
  done:      { label: '已完成',   color: '#52c41a', icon: '✅' },
  error:     { label: '出错',     color: '#f5222d', icon: '❌' },
};

interface Props {
  task: ScanTask;
  onCancel?: () => void;
}

export const ScanStatus: React.FC<Props> = ({ task, onCancel }) => {
  const config = STATUS_CONFIG[task.status];

  return (
    <div className="scan-status">
      <div className="status-header">
        <span className="status-icon">{config.icon}</span>
        <span className="status-label" style={{ color: config.color }}>
          {config.label}
        </span>
        {task.taskId && (
          <span className="task-id">Task ID: {task.taskId.slice(0, 8)}...</span>
        )}
      </div>

      {/* 进度条 */}
      {task.status !== 'idle' && task.status !== 'done' && task.status !== 'error' && (
        <div className="progress-wrapper">
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{
                width: `${task.progress}%`,
                background: config.color,
              }}
            />
          </div>
          <span className="progress-text">{task.progress}%</span>
        </div>
      )}

      <p className="status-message">{task.message}</p>

      {/* 取消按钮 */}
      {(task.status === 'uploading' || task.status === 'scanning') && onCancel && (
        <button className="btn-cancel" onClick={onCancel}>
          取消任务
        </button>
      )}

      {/* 耗时 */}
      {task.startedAt && (
        <p className="elapsed-time">
          已耗时：{Math.round((Date.now() - task.startedAt) / 1000)}s
        </p>
      )}
    </div>
  );
};
```

### 7.3 结果展示组件

```tsx
// src/components/CodeScanner/ResultViewer.tsx

import React, { useMemo } from 'react';

interface Props {
  html: string;
  mdContent?: string;
  onDownloadMd?: () => void;
}

export const ResultViewer: React.FC<Props> = ({ html, mdContent, onDownloadMd }) => {
  return (
    <div className="result-viewer">
      <div className="result-toolbar">
        <span className="result-title">📋 扫描报告</span>
        <div className="toolbar-actions">
          {onDownloadMd && (
            <button className="btn-toolbar" onClick={onDownloadMd}>
              ⬇️ 下载 MD
            </button>
          )}
          <button
            className="btn-toolbar"
            onClick={() => navigator.clipboard.writeText(mdContent || '')}
          >
            📋 复制 MD
          </button>
        </div>
      </div>

      {/* 渲染 HTML */}
      <div
        className="report-content"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
};
```

---

## 8. 主组件入口

```tsx
// src/components/CodeScanner/index.tsx

import React, { useState, useCallback } from 'react';
import { UploadZone } from './UploadZone';
import { PromptInput } from './PromptInput';
import { ScanStatus } from './ScanStatus';
import { ResultViewer } from './ResultViewer';
import { useScanTask } from './hooks/useScanTask';
import type { ScanTask } from './types';

export const CodeScanner: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [prompt, setPrompt] = useState('');
  const { task, startScan, reset, isPolling } = useScanTask();

  const isWorking = task.status !== 'idle' && task.status !== 'done' && task.status !== 'error';
  const canSubmit = selectedFile !== null && prompt.trim().length > 0 && !isWorking;

  const handleSubmit = useCallback(() => {
    if (!selectedFile || !prompt.trim()) return;
    startScan(selectedFile, prompt.trim());
  }, [selectedFile, prompt, startScan]);

  const handleReset = useCallback(() => {
    reset();
    setSelectedFile(null);
    setPrompt('');
  }, [reset]);

  return (
    <div className="code-scanner">
      <h2 className="scanner-title">🔍 代码扫描插件</h2>

      {/* 步骤指示 */}
      <div className="step-indicator">
        <Step active={true} label="上传文件" number={1} current={task.status} />
        <Step active={task.status !== 'idle'} label="提交扫描" number={2} current={task.status} />
        <Step active={task.status === 'done'} label="查看报告" number={3} current={task.status} />
      </div>

      {/* 区域1: 上传 */}
      <UploadZone
        disabled={isWorking}
        onFileSelected={setSelectedFile}
        acceptedFileName={selectedFile?.name}
      />

      {/* 区域2: 提示词 */}
      <PromptInput
        disabled={isWorking}
        value={prompt}
        onChange={setPrompt}
        showInjectionHint={true}
      />

      {/* 区域3: 操作按钮 */}
      <div className="action-bar">
        <button
          className="btn-primary"
          disabled={!canSubmit}
          onClick={handleSubmit}
        >
          🚀 提交扫描任务
        </button>
        {(task.status === 'done' || task.status === 'error') && (
          <button className="btn-secondary" onClick={handleReset}>
            🔄 新建任务
          </button>
        )}
      </div>

      {/* 区域4: 状态 */}
      {task.status !== 'idle' && (
        <ScanStatus task={task} onCancel={reset} />
      )}

      {/* 区域5: 结果 */}
      {task.status === 'done' && task.resultHtml && (
        <ResultViewer
          html={task.resultHtml}
          mdContent={task.resultMdContent}
        />
      )}
    </div>
  );
};

// 步骤组件
const Step: React.FC<{
  number: number;
  label: string;
  active: boolean;
  current: ScanTask['status'];
}> = ({ number, label, active }) => (
  <div className={`step ${active ? 'active' : 'inactive'}`}>
    <div className="step-circle">{number}</div>
    <span className="step-label">{label}</span>
  </div>
);
```

---

## 9. 接入示例

```tsx
// src/App.tsx
import { CodeScanner } from './components/CodeScanner';

export default function App() {
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
      <CodeScanner />
    </div>
  );
}
```

---

## 架构总览

```
用户操作流程
│
├─ 1. 上传 ZIP ────→ UploadZone
│                        ↓
├─ 2. 填写提示词 ──→ PromptInput（自动注入 MinIO 上传指令）
│                        ↓
├─ 3. 点击提交 ────→ submitScanTask() [模拟后端]
│                        ↓
│  ┌─────────────────────┐
│  │   startScan()       │
│  │   ├─ POST 提交任务   │ ← 模拟接口，可替换真实 API
│  │  └─ minioPolling.start()    │
│  │       ├─ 轮询 MinIO fileExists(uuid)   │
│  │       │  每 10s × 90次 ≈ 15min         │
│  │       └─ 找到 → getFileContent() → md │
│  │                    ↓
│  │  └─ markdownToHtml() → HTML
│  └─────────────────────┘
│                        ↓
└─ 4. ResultViewer 展示 HTML
```

---

## 关键设计决策说明

| 决策 | 理由 |
|------|------|
| **UUID 作为 MinIO 文件名** | 避免文件名冲突，唯一标识任务 |
| **注入式而非拼接式** | MinIO 上传指令以 `，` 开头接到提示词末尾，对模型友好 |
| **轮询放在前端** | 后端压力小，前端感知进度体验更好 |
| **90次 × 10s = 15min** | 覆盖官方说的 10-15 分钟处理时长 |
| **MD→HTML 在前端做** | 减少后端依赖，支持离线预览 |
| **网络抖动不中断轮询** | `try/catch` 吞掉异常，继续轮询，避免偶发失败 |
| **凭证前端直连 MinIO（⚠️）** | 仅限 Demo，生产必须走后端代理 |