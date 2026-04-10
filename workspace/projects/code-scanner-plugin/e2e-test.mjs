/**
 * e2e-test.mjs — Playwright 自动化测试
 * 测试列表页 + Modal 弹框逻辑
 *
 * 流程：
 *   B1. 页面加载
 *   B2. ZIP 上传
 *   B3. 导航 Step2
 *   B4. 模板填充
 *   B5. 提交扫描 → Step3
 *   S1. seed fileStore → 轮询立刻就绪
 *   B6. Step4 列表出现
 *   B7. 列表 2 条记录，字段正确
 *   B8. 点击第一条 → Modal 打开
 *   B9. iframe 渲染 HTML 内容
 *   B10. 关闭 Modal
 *   B11. 点击第二条 → Modal 再次打开
 *   B12. 重新扫描 → 回到 Step1
 */

import { chromium } from '/home/gem/.npm-global/lib/node_modules/playwright/index.mjs'

const BASE = 'http://localhost:5173'

const SAMPLE_HTML_1 = `<!DOCTYPE html>
<html>
<head><title>携转用户开户-业务逻辑安全分析报告</title></head>
<body>
<h1>携转用户开户 业务逻辑安全分析报告</h1>
<table>
<tr><th>漏洞编号</th><th>漏洞名称</th><th>严重程度</th></tr>
<tr><td>VUL-001</td><td>开户提交接口重复提交（幂等性缺失）</td><td>高危</td></tr>
<tr><td>VUL-002</td><td>携入号码归属地校验硬编码绕过</td><td>高危</td></tr>
<tr><td>VUL-003</td><td>吉祥号码验证码授权仅前端控制</td><td>高危</td></tr>
</table>
</body>
</html>`

const SAMPLE_HTML_2 = `<!DOCTYPE html>
<html>
<head><title>携转用户开户-业务逻辑说明文档</title></head>
<body>
<h1>携转用户开户 业务逻辑说明文档</h1>
<p>携入号码校验流程、SIM卡读写、套餐和活动选择、提交开户等子流程。</p>
</body>
</html>`

function makeReportList(uuid) {
  const now = new Date()
  const pad = n => n.toString().padStart(2, '0')
  const t = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  return [
    { index: 1, filename: '携转用户开户-业务逻辑安全分析报告.html', generateTime: t, htmlContent: SAMPLE_HTML_1 },
    { index: 2, filename: '携转用户开户-业务逻辑说明文档.html', generateTime: t, htmlContent: SAMPLE_HTML_2 },
  ]
}

async function runStep(name, fn) {
  process.stdout.write(`[${new Date().toLocaleTimeString('zh-CN')}] [ℹ️  INFO] ${name}\n`)
  try {
    await fn()
    process.stdout.write(`[${new Date().toLocaleTimeString('zh-CN')}] [✅ PASS] ${name}\n`)
  } catch (err) {
    process.stdout.write(`[${new Date().toLocaleTimeString('zh-CN')}] [❌ FAIL] ${name}: ${err.message}\n`)
    throw err
  }
}

async function main() {
  console.log('='.repeat(55))
  console.log('  代码扫描插件 — 全链路自动化测试')
  console.log('='.repeat(55))
  console.log()

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  const consoleErrors = []
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })

  // B1
  await runStep('B1. 页面加载', async () => {
    await page.goto(BASE, { waitUntil: 'networkidle' })
    const t = await page.title()
    if (!t.includes('代码扫描')) throw new Error(`标题异常: ${t}`)
    if (!(await page.locator('.step-card').first().isVisible())) throw new Error('Step1 未渲染')
  })

  // B2
  await runStep('B2. ZIP 文件选择', async () => {
    const buf = Buffer.from('PK\x03\x04')
    await page.locator('#file-input').setInputFiles({ name: 'test-code.zip', mimeType: 'application/zip', buffer: buf })
    const text = await page.locator('.file-name').textContent()
    if (!text?.includes('test-code.zip')) throw new Error(`文件名未显示: ${text}`)
  })

  // B3
  await runStep('B3. 导航 Step2', async () => {
    await page.click('.btn-primary')
    await page.waitForSelector('.prompt-input', { timeout: 3000 })
  })

  // B4
  await runStep('B4. 安全扫描模板填充', async () => {
    const btn = page.locator('.prompt-templates .btn-tpl').first()
    await btn.click()
    const val = await page.locator('.prompt-input').inputValue()
    if (!val.includes('安全')) throw new Error(`模板未填充: ${val.slice(0,30)}`)
  })

  // B5: 提交扫描 → Step3，获取 UUID
  let taskUUID = ''
  await runStep('B5. 提交扫描 + Step3 轮询状态', async () => {
    await page.click('.btn-primary')
    await page.waitForSelector('.spinning', { timeout: 3000 })
    taskUUID = await page.locator('.status-value.uuid').textContent()
    if (!taskUUID) throw new Error('UUID 未显示')
  })

  // S1: seed fileStore（让轮询立刻检测到数据就绪）
  await runStep('S1. 注入报告列表到内存（提前就绪）', async () => {
    // 等待 __simulatorSeed 可用（模块动态加载完成）
    await page.waitForFunction(() => typeof window.__simulatorSeed === 'function', { timeout: 10000 })
    const items = makeReportList(taskUUID.trim())
    await page.evaluate(([uuid, reportItems]) => {
      window.__simulatorSeed?.(uuid, reportItems)
    }, [taskUUID.trim(), items])
  })

  // B6: 等待 Step4 出现
  await runStep('B6. 轮询检测到就绪 → Step4 列表页', async () => {
    let visible = false
    for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(400)
      visible = await page.locator('.result').isVisible().catch(() => false)
      if (visible) break
    }
    if (!visible) throw new Error('Step4 未出现')
  })

  // B7
  await runStep('B7. 报告列表：2 条记录，字段正确', async () => {
    const count = await page.locator('.report-row').count()
    if (count !== 2) throw new Error(`期望 2 条，实际 ${count}`)
    const fn1 = await page.locator('.report-row').nth(0).locator('.filename').textContent()
    const fn2 = await page.locator('.report-row').nth(1).locator('.filename').textContent()
    if (!fn1?.includes('安全分析报告')) throw new Error(`文件名1异常: ${fn1}`)
    if (!fn2?.includes('业务逻辑说明')) throw new Error(`文件名2异常: ${fn2}`)
    const timeText = await page.locator('.report-row').first().locator('.time').textContent()
    if (!timeText?.match(/\d{4}-\d{2}-\d{2}/)) throw new Error(`时间格式异常: ${timeText}`)
  })

  // B8: 点击第一条
  await runStep('B8. 点击第一条 → Modal 弹框', async () => {
    await page.locator('.report-row').first().click()
    await page.waitForSelector('.modal-overlay', { timeout: 3000 })
    if (!(await page.locator('.modal-overlay').isVisible())) throw new Error('Modal 未显示')
    const title = await page.locator('.modal-title').textContent()
    if (!title?.includes('安全分析')) throw new Error(`Modal 标题: ${title}`)
  })

  // B9: iframe 渲染
  await runStep('B9. Modal iframe 渲染 HTML 内容', async () => {
    const iframe = page.locator('.html-iframe')
    if (!(await iframe.isVisible())) throw new Error('iframe 未显示')
    const srcdoc = await iframe.getAttribute('srcdoc')
    if (!srcdoc?.includes('<html>')) throw new Error('srcdoc 无 HTML')
    if (!srcdoc?.includes('VUL-001')) throw new Error('安全报告内容缺失')
  })

  // B10: 关闭
  await runStep('B10. 关闭 Modal', async () => {
    await page.click('.modal-close')
    await page.waitForTimeout(400)
    const vis = await page.locator('.modal-overlay').isVisible().catch(() => false)
    if (vis) throw new Error('Modal 未关闭')
  })

  // B11: 第二条
  await runStep('B11. 点击第二条 → Modal 再次打开', async () => {
    await page.locator('.report-row').nth(1).click()
    await page.waitForSelector('.modal-overlay', { timeout: 3000 })
    const title = await page.locator('.modal-title').textContent()
    if (!title?.includes('业务逻辑说明')) throw new Error(`Modal 标题: ${title}`)
    const srcdoc = await page.locator('.html-iframe').getAttribute('srcdoc')
    if (!srcdoc?.includes('携入号码校验')) throw new Error('第二条 HTML 内容缺失')
    await page.click('.modal-close')
  })

  // B12: 重新扫描
  await runStep('B12. 重新扫描 → 回到 Step1', async () => {
    await page.click('.btn-secondary')
    await page.waitForSelector('.upload-label', { timeout: 3000 })
    if (!(await page.locator('.step-card').first().isVisible())) throw new Error('未回到 Step1')
  })

  if (consoleErrors.length > 0) {
    console.log(`[🌐 WARN] ${consoleErrors.length} 条浏览器错误:`)
    consoleErrors.forEach(e => console.log(`  - ${e}`))
  } else {
    console.log('[🌐 OK] 无浏览器错误')
  }

  await browser.close()
  console.log()
  console.log('='.repeat(55))
  console.log('  ✅ 全部 12 步测试通过！')
  console.log('='.repeat(55))
}

main().catch(err => {
  console.error('\n测试失败:', err.message)
  process.exit(1)
})
