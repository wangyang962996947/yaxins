/**
 * simulator.ts — 浏览器端本地模拟器
 *
 * 作用：完全在浏览器内模拟"后端处理 + MinIO 存储"的完整流程
 * 行为：submitScanTask → 存储报告到内存 Map → 5~8s 后标记为就绪
 *        waitForResult → 轮询内存 Map → 文件就绪后返回 MD 内容
 *
 * 移除 USE_MOCK 开关，所有逻辑走这里，真实对接时替换本文件即可
 */

// ============= 内存中的"MinIO"存储 =============

type ScanFile = {
  content: string
  ready: boolean
}

const fileStore = new Map<string, ScanFile>()

// ============= 假报告生成器 =============

function generateFakeReport(uuid: string, originalPrompt: string): string {
  // 根据提示词类型生成不同的报告风格
  const isSecurity = originalPrompt.includes('安全') || originalPrompt.includes('SQL') || originalPrompt.includes('XSS')
  const isQuality = originalPrompt.includes('质量') || originalPrompt.includes('可维护性')
  const isBestPractice = originalPrompt.includes('工程') || originalPrompt.includes('CI/CD')

  const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })

  if (isSecurity) {
    return `# 🔒 代码安全扫描报告

**任务 ID：** ${uuid}
**扫描时间：** ${timestamp}
**扫描类型：** 安全扫描
**状态：** ✅ 扫描完成

---

## 📊 扫描概要

| 指标 | 数量 |
|------|------|
| 扫描文件总数 | ${Math.floor(Math.random() * 50 + 20)} |
| 高危问题 | ${Math.floor(Math.random() * 5 + 1)} |
| 中危问题 | ${Math.floor(Math.random() * 10 + 3)} |
| 低危问题 | ${Math.floor(Math.random() * 15 + 5)} |

---

## 🚨 高危问题（必须修复）

### 1. SQL 注入风险
- **文件：** \`src/database/query.ts:23\`
- **描述：** 用户输入直接拼接到 SQL 语句，未使用参数化查询
- **严重程度：** 高危
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
- **严重程度：** 高危
- **建议：** 迁移到环境变量或密钥管理服务

---

### 3. XSS 跨站脚本
- **文件：** \`src/api/user.ts:88\`
- **描述：** 用户输入未经过滤直接输出到 HTML
- **严重程度：** 高危
- **建议：** 使用 DOMPurify 或转义输出

---

## ⚠️ 中危问题

| 编号 | 文件 | 问题类型 | 建议 |
|------|------|---------|------|
| M-1 | src/auth/jwt.ts | JWT 密钥强度不足 | 使用 RS256 |
| M-2 | src/api/payment.ts | 缺少金额校验 | 添加金额上限检查 |
| M-3 | src/utils/crypto.ts | 使用弱加密算法 | 迁移到 AES-256-GCM |

---

## ℹ️ 低危问题

- 未使用 \`const\` 的变量声明（${Math.floor(Math.random() * 10 + 3)} 处）
- 缺少 JSDoc 注释的函数（${Math.floor(Math.random() * 15 + 5)} 个）
- 未处理的 Promise rejection（${Math.floor(Math.random() * 5 + 1)} 处）

---

## ✅ 总结

本次扫描共发现 **${Math.floor(Math.random() * 25 + 10)}** 个问题，其中：
- **高危** 需**立即修复**
- **中危** 建议**本周内修复**
- **低危** 可**安排迭代处理**

> 💡 建议：将此扫描集成到 CI/CD 流水线，每次提交自动触发。

---
*报告由 AI 代码扫描插件自动生成 | ${timestamp}*
`
  }

  if (isQuality) {
    return `# 📋 代码质量评估报告

**任务 ID：** ${uuid}
**扫描时间：** ${timestamp}
**扫描类型：** 代码质量评估
**状态：** ✅ 评估完成

---

## 📊 质量概要

| 指标 | 评分 | 等级 |
|------|------|------|
| 代码重复率 | ${(Math.random() * 15 + 5).toFixed(1)}% | ${Math.random() > 0.5 ? '🟡 需改进' : '🟢 良好'} |
| 注释覆盖率 | ${(Math.random() * 40 + 30).toFixed(1)}% | 🟡 需改进 |
| 圈复杂度 | ${Math.floor(Math.random() * 10 + 3)} | 🟢 良好 |
| 模块化评分 | ${(Math.random() * 3 + 7).toFixed(1)}/10 | 🟡 中等 |

---

## 🔍 主要发现

### 代码重复
- \`src/utils/*.ts\` 中有 ${Math.floor(Math.random() * 8 + 3)} 处重复代码
- 建议提取公共函数到 shared 模块

### 命名规范
- ${Math.floor(Math.random() * 15 + 5)} 个变量命名不符合 camelCase 规范
- ${Math.floor(Math.random() * 8 + 2)} 个函数缺少有意义的命名

### 注释覆盖率
- 当前注释覆盖率：${(Math.random() * 40 + 30).toFixed(1)}%
- 目标：> 60%

---

## 💡 改进建议

1. **提取公共代码**：将重复的格式化、校验逻辑提取为独立函数
2. **增加单元测试**：当前测试覆盖率约 ${(Math.random() * 30 + 20).toFixed(0)}%
3. **重构复杂函数**：${Math.floor(Math.random() * 5 + 1)} 个函数圈复杂度超过 10

---
*报告由 AI 代码扫描插件自动生成 | ${timestamp}*
`
  }

  // 默认通用报告
  return `# 📝 代码扫描报告

**任务 ID：** ${uuid}
**扫描时间：** ${timestamp}
**扫描类型：** 综合扫描
**状态：** ✅ 扫描完成

---

## 📊 扫描概要

| 指标 | 数量 |
|------|------|
| 扫描文件总数 | ${Math.floor(Math.random() * 50 + 20)} |
| 发现问题 | ${Math.floor(Math.random() * 30 + 5)} |
| 建议项 | ${Math.floor(Math.random() * 15 + 3)} |

---

## 🔍 扫描详情

### 文件结构分析
- 共扫描 ${Math.floor(Math.random() * 30 + 10)} 个 TypeScript/JavaScript 文件
- 平均文件行数：${Math.floor(Math.random() * 100 + 50)} 行

### 主要发现
- 安全相关问题：${Math.floor(Math.random() * 8 + 1)} 项
- 代码质量问题：${Math.floor(Math.random() * 12 + 3)} 项
- 最佳实践建议：${Math.floor(Math.random() * 10 + 2)} 项

---

## ✅ 总结

扫描完成，建议对高优先级问题进行修复。

---
*报告由 AI 代码扫描插件自动生成 | ${timestamp}*
`
}

// ============= 模拟后端 + MinIO =============

/**
 * 模拟后端提交接口：
 * - 立即返回 202（异步接受）
 * - 5~8 秒后在内存中"生成"MD 报告
 */
export async function submitScanTask(
  zipFile: File,
  enrichedPrompt: string,
  uuid: string
): Promise<{ uuid: string; status: string; message: string }> {
  // 从提示词中提取原始需求（去掉 MinIO 追加部分）
  const originalPrompt = enrichedPrompt.replace(
    /\n请将生成的代码扫描报告文件上传到 MinIO 对象存储：[\s\S*/]*$/,
    ''
  )

  // 模拟后端开始"处理"（生成报告）
  const delayMs = 5000 + Math.random() * 3000 // 5~8 秒

  // 立即返回 202
  setTimeout(() => {
    const content = generateFakeReport(uuid, originalPrompt)
    fileStore.set(uuid, { content, ready: true })
    console.info(`[Simulator] 报告已生成 uuid=${uuid} (延迟 ${(delayMs / 1000).toFixed(1)}s)`)
  }, delayMs)

  return {
    uuid,
    status: 'accepted',
    message: '扫描任务已提交，后台处理中（约 5~8 秒）',
  }
}

/**
 * 模拟 MinIO fileExists：检查内存中文件是否就绪
 */
export async function fileExists(uuid: string): Promise<boolean> {
  const file = fileStore.get(uuid)
  return file?.ready === true
}

/**
 * 模拟 MinIO downloadTextFile：从内存下载 MD 内容
 */
export async function downloadTextFile(uuid: string): Promise<string> {
  const file = fileStore.get(uuid)
  if (!file || !file.ready) {
    throw new Error(`文件不存在或未就绪: ${uuid}`)
  }
  return file.content
}

// ============= 轮询配置 =============

export const POLL_INTERVAL_MS = 2_000   // 本地模拟：2 秒轮询
export const MAX_WAIT_MS = 10 * 60 * 1000 // 最多等 10 分钟
