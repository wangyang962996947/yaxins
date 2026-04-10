export interface ScanTask {
  taskId: string;
  status: 'idle' | 'uploading' | 'scanning' | 'processing' | 'done' | 'error';
  progress: number; // 0-100
  message: string;
  uploadedFileName: string;
  prompt: string;
  resultMdContent?: string; // 原始 MD 内容
  resultHtml?: string; // 转换后的 HTML
  error?: string;
  startedAt?: number;
  finishedAt?: number;
}

export interface ScanRequest {
  file: File;
  prompt: string;
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
