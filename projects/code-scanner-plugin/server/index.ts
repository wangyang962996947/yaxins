/**
 * server/index.ts — Express 模拟后端
 *
 * 作用：开发调试用，模拟真实代码扫描服务
 * 行为：POST /api/scan/submit → 立即返回 202，
 *        60秒后在本地 Mock MinIO（localhost:9000）注入 MD 报告文件
 */

import express from 'express'
import multer from 'multer'
import cors from 'cors'
import { v4 as uuidv4 } from 'uuid'
import {
  uploadTextFile,
} from '../src/mockMinioClient'

const app = express()
const PORT = 3001

app.use(cors())
app.use(express.json())
const upload = multer({ dest: '/tmp/scan-uploads' })

// ============= 生成假报告 =============

function generateFakeReport(uuid: string): string {
  return `# 代码安全扫描报告

**任务 ID：** ${uuid}
**扫描时间：** ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
**状态：** 扫描完成 ✅

---

## 📊 扫描概要

| 指标 | 数量 |
|------|------|
| 扫描文件总数 | 42 |
| 高危问题 | 3 |
| 中危问题 | 7 |
| 低危问题 | 12 |

---

## 🚨 高危问题（必须修复）

### 1. SQL 注入风险
- **文件：** \`src/database/query.ts:23\`
- **描述：** 用户输入直接拼接到 SQL 语句，未使用参数化查询
- **建议：** 使用 ORM 或参数化查询

\`\`\`typescript
// ❌ 危险写法
const query = "SELECT * FROM users WHERE id = " + userId

// ✅ 安全写法
const query = "SELECT * FROM users WHERE id = $1"
await db.query(query, [userId])
\`\`\`

---

### 2. 硬编码密钥
- **文件：** \`src/config/secrets.ts:5\`
- **描述：** 发现硬编码的 API 密钥和数据库密码
- **建议：** 迁移到环境变量或密钥管理服务

---

### 3. XSS 跨站脚本
- **文件：** \`src/api/user.ts:88\`
- **描述：** 用户输入未经过滤直接输出到 HTML
- **建议：** 使用 DOMPurify 或转义输出

---

## ⚠️ 中危问题

| 编号 | 文件 | 问题类型 |
|------|------|---------|
| M-1 | src/auth/jwt.ts | JWT 密钥强度不足 |
| M-2 | src/api/payment.ts | 缺少金额校验 |
| M-3 | src/utils/crypto.ts | 使用弱加密算法 |

---

## ✅ 总结

本次扫描共发现 **22** 个问题，其中：
- 3 个高危需**立即修复**
- 7 个中危建议**本周内修复**
- 12 个低危可**安排迭代处理**

> 💡 建议：将此扫描集成到 CI/CD 流水线，每次提交自动触发。

---
*报告由 AI 代码扫描插件自动生成*
`
}

// ============= 路由 =============

app.post('/api/scan/submit', upload.single('file'), async (req, res) => {
  const { uuid, prompt } = req.body as { uuid: string; prompt: string }

  if (!uuid) {
    res.status(400).json({ error: '缺少 uuid 参数' })
    return
  }

  console.log(`[Mock Server] 收到任务 uuid=${uuid}`)
  console.log(`[Mock Server] 提示词: ${prompt?.slice(0, 60)}...`)
  if (req.file) {
    console.log(`[Mock Server] 文件: ${req.file.originalname} (${(req.file.size / 1024).toFixed(1)} KB)`)
  }

  res.status(202).json({
    uuid,
    status: 'accepted',
    message: '扫描任务已提交，后台处理中',
  })

  // 60秒后生成报告，上传到本地 Mock MinIO
  setTimeout(async () => {
    console.log(`[Mock Server] 扫描完成，注入 MD 文件: ${uuid}`)
    const report = generateFakeReport(uuid)
    await uploadTextFile(uuid, report)
    console.log(`[Mock Server] ✅ 文件已注入: ${uuid}`)
  }, 60_000)
})

app.get('/api/scan/status/:uuid', (req, res) => {
  res.json({ uuid: req.params.uuid, status: 'processing' })
})

// =============

app.listen(PORT, () => {
  console.log(`\n🔧 Mock Server 启动 (端口 ${PORT})`)
  console.log(`   提交接口: POST http://localhost:${PORT}/api/scan/submit`)
  console.log(`   Mock MinIO: http://localhost:9000\n`)
})
