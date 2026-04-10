/**
 * mockMinioClient.ts — 连接本地 Mock MinIO Server 的客户端
 * 接口与 minio.ts 完全一致，浏览器兼容（无 Buffer 依赖）
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

/** 下载文本文件（浏览器兼容） */
export async function downloadTextFile(objectName: string): Promise<string> {
  const res = await fetchRetry(`${MOCK_BASE}/${objectName}`, { method: 'GET' })
  if (!res.ok) {
    throw new Error(`文件不存在: ${objectName}`)
  }
  const ab = await res.arrayBuffer()
  // 使用 TextDecoder 而非 Buffer（浏览器兼容）
  return new TextDecoder('utf-8').decode(ab)
}

/** 下载 Buffer */
export async function downloadBuffer(objectName: string): Promise<Uint8Array> {
  const res = await fetchRetry(`${MOCK_BASE}/${objectName}`, { method: 'GET' })
  if (!res.ok) throw new Error(`文件不存在: ${objectName}`)
  const ab = await res.arrayBuffer()
  return new Uint8Array(ab)
}

/** 上传文本（浏览器兼容） */
export async function uploadTextFile(objectName: string, content: string): Promise<void> {
  // TextEncoder 输出 Uint8Array，fetch 原生接受
  const encoded = new TextEncoder().encode(content)
  const res = await fetch(`${MOCK_BASE}/${objectName}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
    body: encoded,
  })
  if (!res.ok) throw new Error(`上传失败: HTTP ${res.status}`)
}

/** 上传 Buffer（浏览器兼容） */
export async function uploadBuffer(
  objectName: string,
  buffer: Uint8Array | ArrayBuffer,
  contentType = 'text/markdown; charset=utf-8'
): Promise<void> {
  const data = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer
  const res = await fetch(`${MOCK_BASE}/${objectName}`, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: data as BodyInit,
  })
  if (!res.ok) throw new Error(`上传失败: HTTP ${res.status}`)
}
