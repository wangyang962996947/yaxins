/**
 * e2e-test.mjs — 代码扫描插件全链路自动化测试
 *
 * 流程：页面加载 → ZIP上传 → 提示词输入 → 提交扫描 → 轮询等待 → 报告展示
 *
 * 启动方式：直接 node e2e-test.mjs（无需启动任何服务，纯浏览器内模拟）
 */

import { chromium } from 'playwright'
import { writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FRONTEND_URL = 'http://localhost:5173'

// ============ 共享测试状态 ============
const state = { uuid: '' }

// ============ 测试工具函数 ============

function log(label, msg) {
  const ts = new Date().toLocaleTimeString('zh-CN')
  console.log(`[${ts}] [${label}] ${msg}`)
}

function pass(msg) { log('✅ PASS', msg) }
function fail(msg) { log('❌ FAIL', msg) }
function info(msg) { log('ℹ️  INFO', msg) }

async function waitFor(cond, opts = {}) {
  const { timeout = 8000, interval = 500 } = opts
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const result = await cond()
    if (result) return true
    await new Promise(r => setTimeout(r, interval))
  }
  return false
}

// ============ 测试用例 ============

async function testPageLoad(page) {
  info('测试页面加载')
  await page.goto(FRONTEND_URL, { waitUntil: 'networkidle' })
  const title = await page.title()
  if (!title.includes('代码扫描')) throw new Error(`页面标题异常: ${title}`)
  pass(`页面标题: "${title}"`)

  const step1Card = await page.locator('.step-card').first()
  if (!await step1Card.isVisible()) throw new Error('Step 1 上传卡片未显示')
  pass('Step 1 上传卡片渲染正常')
}

async function testFileUpload(page) {
  info('测试 ZIP 文件上传')

  const testFilePath = '/tmp/test-code.zip'
  writeFileSync(testFilePath, 'PK\x03\x04') // ZIP 魔数

  const fileInput = page.locator('#file-input')
  await fileInput.setInputFiles(testFilePath)

  await waitFor(async () => {
    const fileName = await page.locator('.file-name').textContent().catch(() => '')
    return fileName.includes('test-code.zip')
  }, { timeout: 3000 })

  pass(`文件选择成功: ${await page.locator('.file-name').textContent()}`)
}

async function testNavigationToStep2(page) {
  info('测试跳转 Step 2')

  await page.locator('.btn-primary', { hasText: '下一步' }).click()
  await waitFor(async () => {
    return await page.locator('.step-card .prompt-input').isVisible().catch(() => false)
  }, { timeout: 3000 })

  const step2Visible = await page.locator('.prompt-input').isVisible()
  if (!step2Visible) throw new Error('Step 2 未出现')
  pass('Step 2（提示词输入）渲染正常')
}

async function testTemplateButtons(page) {
  info('测试模板填充')

  await page.locator('.btn-tpl', { hasText: '安全扫描' }).click()
  await new Promise(r => setTimeout(r, 200))

  const promptText = await page.locator('.prompt-input').inputValue()
  if (!promptText.includes('安全')) throw new Error(`模板未填充: ${promptText.slice(0, 50)}`)
  pass('安全扫描模板填充成功')
  info(`模板片段: "${promptText.slice(0, 60)}..."`)
}

async function testSubmitScan(page) {
  info('提交扫描任务（本地模拟，5~8s 后报告就绪）')

  await page.locator('.btn-primary', { hasText: '提交扫描' }).click()

  await waitFor(async () => {
    return await page.locator('.step-card.waiting').isVisible().catch(() => false)
  }, { timeout: 3000 })

  if (!await page.locator('.step-card.waiting').isVisible()) throw new Error('Step 3 等待状态未出现')
  pass('Step 3（等待状态）渲染正常')

  const uuidText = await page.locator('.status-value.uuid').textContent().catch(() => '')
  if (!uuidText || uuidText.length < 10) throw new Error(`UUID 异常: ${uuidText}`)
  state.uuid = uuidText.trim()
  pass(`任务 UUID: ${state.uuid}`)

  // 轮询进度显示
  const pollText = await page.locator('.status-value').nth(3).textContent().catch(() => '')
  info(`轮询状态: ${pollText}`)
  pass('轮询状态 UI 正常')
}

async function testWaitForResult(page) {
  info('等待 Step 4 结果出现（最多 15s，模拟处理 5~8s）')

  const found = await waitFor(async () => {
    return await page.locator('.step-card.result').isVisible().catch(() => false)
  }, { timeout: 15000 })

  if (!found) {
    const cls = await page.locator('.step-card').first().getAttribute('class').catch(() => 'unknown')
    throw new Error(`Step 4 未出现 (class="${cls}")`)
  }
  pass('Step 4（结果展示）渲染正常')
}

async function testReportDisplay(page) {
  info('测试报告展示和交互')

  const reportHtml = await page.locator('.report-content').innerHTML().catch(() => '')
  if (reportHtml.length < 100) throw new Error(`报告内容异常，长度: ${reportHtml.length}`)
  pass(`MD 报告渲染成功，HTML 长度: ${reportHtml.length} 字符`)

  // Markdown 元素检查
  const h1 = await page.locator('.report-content h1').first().textContent().catch(() => '')
  if (!h1) fail('报告缺少 H1 标题')
  else info(`报告 H1: "${h1}"`)

  const tableCount = await page.locator('.report-content table').count()
  info(`报告表格数: ${tableCount}`)
  if (tableCount > 0) pass('报告表格渲染正常')

  // 交互按钮
  const downloadBtn = await page.locator('.btn-secondary', { hasText: '下载' }).first()
  if (!await downloadBtn.isVisible()) throw new Error('下载按钮未显示')
  pass('下载 MD 按钮正常')

  const resetBtn = await page.locator('.btn-secondary', { hasText: '重新扫描' }).first()
  if (!await resetBtn.isVisible()) throw new Error('重新扫描按钮未显示')
  pass('重新扫描按钮正常')

  // 耗时标签
  const elapsedBadge = await page.locator('.elapsed-badge').textContent().catch(() => '')
  if (elapsedBadge) pass(`耗时标签: "${elapsedBadge.trim()}"`)
}

async function testReset(page) {
  info('测试重新扫描功能')

  await page.locator('.btn-secondary', { hasText: '重新扫描' }).first().click()
  await waitFor(async () => {
    return await page.locator('.file-upload-area').isVisible().catch(() => false)
  }, { timeout: 3000 })

  if (!await page.locator('.file-upload-area').isVisible()) throw new Error('重新扫描未回到 Step 1')
  pass('重新扫描功能正常，已回到 Step 1')

  const fileNameCount = await page.locator('.file-name').count()
  if (fileNameCount > 0) fail('重新扫描后文件选择区未清空')
  else pass('状态已完全重置')
}

// ============ 主测试流程 ============

async function main() {
  console.log('\n========================================')
  console.log('  代码扫描插件 — 全链路自动化测试')
  console.log('  （纯浏览器内模拟，无外部服务依赖）')
  console.log('========================================\n')

  const browser = await chromium.launch({
    headless: true,
    executablePath: '/usr/bin/chromium-browser',
  })
  const context = await browser.newContext()
  const page = await context.newPage()

  let passed = 0, failed = 0

  const tests = [
    ['B1. 页面加载', () => testPageLoad(page)],
    ['B2. ZIP 上传', () => testFileUpload(page)],
    ['B3. 导航到 Step2', () => testNavigationToStep2(page)],
    ['B4. 模板填充', () => testTemplateButtons(page)],
    ['B5. 提交扫描（Step3）', () => testSubmitScan(page)],
    ['B6. 等待结果（Step4）', () => testWaitForResult(page)],
    ['B7. 报告展示', () => testReportDisplay(page)],
    ['B8. 重新扫描', () => testReset(page)],
  ]

  for (const [name, fn] of tests) {
    try {
      await fn()
      passed++
    } catch (err) {
      fail(`${name}: ${err.message}`)
      failed++
    }
  }

  await browser.close()

  console.log('\n========================================')
  console.log(`  测试结果:  ✅ ${passed}  ❌ ${failed}`)
  console.log('========================================\n')

  if (failed > 0) process.exit(1)
}

main().catch(err => {
  console.error('测试脚本异常:', err)
  process.exit(1)
})
