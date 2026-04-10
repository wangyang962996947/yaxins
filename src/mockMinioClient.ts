/**
 * mockMinioClient.ts — 连接本地 Mock MinIO Server 的客户端
 * 接口与 minio.ts 完全一致，开发调试用
 */

const MOCK_BASE = 'http://localhost:9000'

async function fetchRetry(
  input: string,
  init?: RequestInit,
  retries = 2
): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fetch(input, init as RequestInit)
    } catch (err) {
      if (i === retries) throw err
      await new Promise((r) => setTimeout(r, 500))
    }
  }
  throw new Error('unreachable')
}

/** 检查文件是否存在 */
export async function fileExists(objectName: string): Promise<boolean> {
  try {
    const res = await fetchRetry(`${MOCK_BASE}/${objectName}`, { method: 'HEAD' })
    return res.ok
  } catch {
    return false
  }
}

/** 下载文本文件 */
export async function downloadTextFile(objectName: string): Promise<string> {
  const res = await fetchRetry(`${MOCK_BASE}/${objectName}`, { method: 'GET' })
  if (!res.ok) {
    throw new Error(`文件不存在: ${objectName}`)
  }
  const ab = await res.arrayBuffer()
  return Buffer.from(ab).toString('utf-8')
}

/** 下载 Buffer */
export async function downloadBuffer(objectName: string): Promise<Buffer> {
  const res = await fetchRetry(`${MOCK_BASE}/${objectName}`, { method: 'GET' })
  if (!res.ok) throw new Error(`文件不存在: ${objectName}`)
  const ab = await res.arrayBuffer()
  return Buffer.from(ab)
}

/** 上传文本 */
export async function uploadTextFile(objectName: string, content: string): Promise<void> {
  const buffer = Buffer.from(content, 'utf-8')
  const res = await fetch(`${MOCK_BASE}/${objectName}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
    body: buffer,
  })
  if (!res.ok) throw new Error(`上传失败: HTTP ${res.status}`)
}

/** 上传 Buffer */
export async function uploadBuffer(
  objectName: string,
  buffer: Buffer,
  contentType = 'text/markdown; charset=utf-8'
): Promise<void> {
  const res = await fetch(`${MOCK_BASE}/${objectName}`, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: new Uint8Array(buffer),
  })
  if (!res.ok) throw new Error(`上传失败: HTTP ${res.status}`)
}
