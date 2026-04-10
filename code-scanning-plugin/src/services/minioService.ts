// MinIO 配置
// ⚠️ 生产环境：通过后端代理访问 MinIO，禁止前端直接暴露凭证
const MINIO_CONFIG = {
  endPoint: '10.28.198.153',
  port: 9000,
  useSSL: false,
  accessKey: 'admin',
  secretKey: 'A12345678',
  bucket: 'code-scanning',
};

/**
 * 精简版 MinIO REST 客户端（fetch 实现，无 SDK 依赖）
 * 仅用于 Demo。生产请使用 minio-js-sdk 并通过后端代理。
 */
class MinioRestClient {
  private baseUrl: string;

  constructor() {
    const { endPoint, port, useSSL } = MINIO_CONFIG;
    this.baseUrl = `${useSSL ? 'https' : 'http'}://${endPoint}:${port}`;
  }

  private async request(
    method: string,
    path: string,
    body?: string
  ): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/octet-stream',
    };

    // 简易签名（MinIO 不支持完整 v4，Demo 用 Anonymous）
    // ⚠️ 真实 MinIO 需要正确签名的 Authorization 头
    const credentials = btoa(`${MINIO_CONFIG.accessKey}:${MINIO_CONFIG.secretKey}`);
    headers['Authorization'] = `Basic ${credentials}`;

    return fetch(url, { method, headers, body });
  }

  /** 检查对象是否存在 */
  async fileExists(objectName: string): Promise<boolean> {
    try {
      const resp = await this.request('HEAD', `/buckets/${MINIO_CONFIG.bucket}/objects/${objectName}`);
      return resp.ok;
    } catch {
      return false;
    }
  }

  /** 获取文本文件内容 */
  async getFileContent(objectName: string): Promise<string> {
    const resp = await this.request('GET', `/buckets/${MINIO_CONFIG.bucket}/objects/${objectName}`);
    if (!resp.ok) throw new Error(`MinIO GET failed: ${resp.status}`);
    return resp.text();
  }
}

export const minioService = new MinioRestClient();
