import { chromium } from 'playwright'

const uuid = 'debug-test-' + Date.now()

const browser = await chromium.launch({
  headless: true,
  executablePath: '/usr/bin/chromium-browser',
})

const context = await browser.newContext()
const page = await context.newPage()

// 监听控制台
page.on('console', msg => {
  console.log(`[BROWSER ${msg.type()}] ${msg.text()}`)
})

// 注入 seed
await fetch(`http://127.0.0.1:9000/seed?uuid=${uuid}`)
console.log('Seed done')

// 打开前端
await page.goto('http://localhost:5174', { waitUntil: 'networkidle' })

// 上传假文件 + 提示词
const testFile = '/tmp/test-code.zip'
await page.locator('#file-input').setInputFiles(testFile)
await page.locator('.btn-primary', { hasText: '下一步' }).click()
await page.locator('.prompt-input').fill('安全扫描测试')

// 拦截 fetch 到 9000 的请求
page.on('response', async resp => {
  const url = resp.url()
  if (url.includes('9000')) {
    console.log(`  [RESPONSE 9000] ${resp.status()} ${resp.request().method()} ${url}`)
  }
})

// 提交
await page.locator('.btn-primary', { hasText: '提交扫描' }).click()
await new Promise(r => setTimeout(r, 1000))

// 手动在浏览器中测试 fileExists
const result = await page.evaluate(async (uuid) => {
  const MOCK_BASE = 'http://localhost:9000'
  try {
    const res = await fetch(`${MOCK_BASE}/${uuid}`, { method: 'HEAD' })
    const ok = res.ok
    const status = res.status
    // also try GET
    const res2 = await fetch(`${MOCK_BASE}/${uuid}`)
    const text = await res2.text()
    return { ok, status, textLength: text.length, textSnippet: text.slice(0, 50) }
  } catch(e) {
    return { error: e.message }
  }
}, uuid)

console.log('Browser fileExists result:', JSON.stringify(result))

await browser.close()
