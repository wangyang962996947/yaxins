// @ts-nocheck
/**
 * minio.ts — 真实 MinIO 客户端
 * 仅在 USE_MOCK=false 时使用
 * 构建时 minio 包由 rollup external 跳过，此文件不参与类型检查
 */
import * as Minio from 'minio'

export const minioClient = new Minio.Client({
  endPoint: '10.28.198.153',
  port: 9010,
  useSSL: false,
  accessKey: 'admin',
  secretKey: 'A12345678',
})

export const BUCKET = 'code-scanning'

export async function fileExists(objectName: string): Promise<boolean> {
  try {
    await minioClient.statObject(BUCKET, objectName)
    return true
  } catch (err: { code?: string }) {
    if (err.code === 'NotFound') return false
    throw err
  }
}

export async function downloadTextFile(objectName: string): Promise<string> {
  const buffer = await downloadBuffer(objectName)
  return buffer.toString('utf-8')
}

export async function downloadBuffer(objectName: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    minioClient.getObject(BUCKET, objectName, (err: Error | null, stream: NodeJS.ReadableStream) => {
      if (err) return reject(err)
      stream.on('data', (chunk: Buffer) => chunks.push(chunk))
      stream.on('end', () => resolve(Buffer.concat(chunks)))
      stream.on('error', reject)
    })
  })
}
