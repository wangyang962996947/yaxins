/**
 * mockMinio.ts — 本地模拟 MinIO Server
 *
 * 功能：模拟 MinIO 的桶操作 API（statObject、getObject、putObject）
 * 数据存储在本地 /tmp/code-scanning-mock/ 目录
 *
 * 启动方式：
 *   npx tsx server/mockMinio.ts
 *   默认监听 9000 端口
 *
 * 替换真实 MinIO 后，只需把 USE_MOCK=true 去掉即可
 */

import http from 'http'
import fs from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'

const PORT = 9000
const BUCKET = 'code-scanning'
const DATA_DIR = '/tmp/code-scanning-mock'

// 确保存储目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

// ============= MinIO API 模拟 =============

  // ============ 辅助命令接口 ============

/**
 * GET /seed?uuid=xxx — 往 MinIO（9000主服务）注入一个 MD 文件
 * 用于 E2E 测试：先调用 seed，再轮询 GET /xxx 直到文件出现
 */
function handleSeed(res: http.ServerResponse, uuid: string) {
  const filePath = getObjectPath(uuid)
  const fakeReport = `# 代码扫描报告（Mock）

**任务 ID：** ${uuid}
**扫描时间：** ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
**数据来源：** 本地模拟 MinIO

---

## 📊 扫描概要

| 指标 | 数量 |
|------|------|
| 扫描文件总数 | 42 |
| 高危问题 | 3 |
| 中危问题 | 7 |
| 低危问题 | 12 |

---

## 🚨 高危问题

### 1. SQL 注入风险
- **文件：** \`src/database/query.ts:23\`
- **描述：** 用户输入直接拼接到 SQL 语句

### 2. 硬编码密钥
- **文件：** \`src/config/secrets.ts:5\`

---

*此为 Mock 数据，用于开发调试*
`
  fs.writeFileSync(filePath, Buffer.from(fakeReport, 'utf-8'))
  const stat = fs.statSync(filePath)
  sendJSON(res, 200, { uuid, seeded: true, path: filePath, size: stat.size })
}

function sendJSON(res: http.ServerResponse, status: number, data: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': '*',
  })
  res.end(JSON.stringify(data))
}

function sendEmpty(res: http.ServerResponse, status: number) {
  res.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': '*',
  })
  res.end()
}

function getObjectPath(objectName: string): string {
  return path.join(DATA_DIR, objectName)
}

const server = http.createServer(async (req: http.IncomingMessage, res: http.ServerResponse) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`)
  const pathname = url.pathname

  // CORS 预检
  if (req.method === 'OPTIONS') {
    sendEmpty(res, 204)
    return
  }

  // GET /seed?uuid=xxx — 注入文件（测试用）
  if (pathname === '/seed' && req.method === 'GET') {
    const uuid = url.searchParams.get('uuid')
    if (!uuid) { sendJSON(res, 400, { error: 'missing uuid' }); return }
    handleSeed(res, uuid)
    return
  }

  // 解析路径：/bucket/objectName
  // MinIO 风格路径：/objectName 或 /BUCKET/objectName
  const parts = pathname.split('/').filter(Boolean)
  const objectName = parts[parts.length - 1]

  if (!objectName) {
    sendJSON(res, 400, { error: 'Missing object name' })
    return
  }

  const filePath = getObjectPath(objectName)

  // HEAD /bucket/objectName — 检查文件是否存在
  if (req.method === 'HEAD') {
    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath)
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': stat.size,
        'Access-Control-Allow-Origin': '*',
        'Last-Modified': stat.mtime.toUTCString(),
        'ETag': `"${objectName}"`,
      })
      res.end()
    } else {
      res.writeHead(404, { 'Access-Control-Allow-Origin': '*' })
      res.end()
    }
    return
  }

  // GET /bucket/objectName — 下载文件
  if (req.method === 'GET') {
    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath)
      const content = fs.readFileSync(filePath)
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': stat.size,
        'Access-Control-Allow-Origin': '*',
        'Last-Modified': stat.mtime.toUTCString(),
        'ETag': `"${objectName}"`,
      })
      res.end(content)
    } else {
      res.writeHead(404, { 'Access-Control-Allow-Origin': '*' })
      res.end(JSON.stringify({ Code: 'NoSuchKey', Message: 'Object does not exist' }))
    }
    return
  }

  // PUT /bucket/objectName — 上传文件
  if (req.method === 'PUT' || req.method === 'POST') {
    const chunks: Buffer[] = []
    for await (const chunk of req as AsyncIterable<Buffer>) {
      chunks.push(chunk)
    }
    const body = Buffer.concat(chunks)

    // 解析 query 参数（uploadId、partNumber 等，简化为直接写文件）
    fs.writeFileSync(filePath, body)
    const stat = fs.statSync(filePath)

    sendJSON(res, 200, {
      ETag: `"${objectName}"`,
      Size: stat.size,
      Location: `/${BUCKET}/${objectName}`,
    })
    return
  }

  sendJSON(res, 405, { error: 'Method not allowed' })
})

// ============= 辅助命令接口 =============

/**
 * GET / — 状态页
 * GET /health — 健康检查
 * POST /mock/seed?uuid=xxx — 往 MinIO 注入一个 MD 文件（用于测试）
 */
const extraServer = http.createServer(async (req: http.IncomingMessage, res: http.ServerResponse) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`)
  const pathname = url.pathname

  if (pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', bucket: BUCKET }))
    return
  }

  // POST /mock/seed?uuid=xxx — 注入假文件（模拟后端扫描完成）
  if (pathname === '/mock/seed' && req.method === 'POST') {
    const mockUuid = url.searchParams.get('uuid') || uuidv4()
    const fakeReport = `# 代码扫描报告（Mock）

**任务 ID：** ${mockUuid}
**扫描时间：** ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
**数据来源：** 本地模拟 MinIO

---

## 📊 扫描概要

| 指标 | 数量 |
|------|------|
| 扫描文件总数 | 42 |
| 高危问题 | 3 |
| 中危问题 | 7 |
| 低危问题 | 12 |

---

## 🚨 高危问题

### 1. SQL 注入风险
- **文件：** \`src/database/query.ts:23\`
- **描述：** 用户输入直接拼接到 SQL 语句

### 2. 硬编码密钥
- **文件：** \`src/config/secrets.ts:5\`

---

*此为 Mock 数据，用于开发调试*
`
    const filePath = getObjectPath(mockUuid)
    fs.writeFileSync(filePath, Buffer.from(fakeReport, 'utf-8'))
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ uuid: mockUuid, seeded: true, path: filePath }))
    return
  }

  // DELETE /mock/clear — 清空所有模拟文件
  if (pathname === '/mock/clear' && req.method === 'DELETE') {
    const files = fs.readdirSync(DATA_DIR)
    for (const f of files) {
      fs.unlinkSync(path.join(DATA_DIR, f))
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ cleared: files.length }))
    return
  }

  // 列出所有模拟文件
  if (pathname === '/mock/list' && req.method === 'GET') {
    const files = fs.readdirSync(DATA_DIR).map((f) => {
      const stat = fs.statSync(path.join(DATA_DIR, f))
      return { name: f, size: stat.size, modified: stat.mtime.toISOString() }
    })
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ files, count: files.length }))
    return
  }

  res.writeHead(200)
  res.end(`Mock MinIO Server (port ${PORT})
存储目录: ${DATA_DIR}

可用接口:
  HEAD/GET/PUT  /{objectName}     — MinIO 风格对象操作
  GET           /health            — 健康检查
  POST          /mock/seed?uuid=xxx — 注入假 MD 文件
  GET           /mock/list          — 列出所有模拟文件
  DELETE        /mock/clear         — 清空所有模拟文件
`)
})

// ============= 启动 =============

server.listen(PORT, () => {
  console.log(`\n🔧 Mock MinIO Server 已启动 (端口 ${PORT})`)
  console.log(`   模拟桶: ${BUCKET}`)
  console.log(`   存储目录: ${DATA_DIR}`)
  console.log(`   对象操作: http://localhost:${PORT}/{objectName}`)
  console.log(`   状态页:   http://localhost:${PORT}/\n`)
})

extraServer.listen(PORT + 1, () => {
  console.log(`   控制面板: http://localhost:${PORT + 1}/mock/`)
})

// 优雅退出
process.on('SIGINT', () => {
  console.log('\nMock MinIO 已关闭')
  server.close()
  extraServer.close()
  process.exit(0)
})
