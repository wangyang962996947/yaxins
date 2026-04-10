import { chromium } from 'playwright'

const browser = await chromium.launch({
  headless: true,
  executablePath: '/usr/bin/chromium-browser',
})
const context = await browser.newContext()
const page = await context.newPage()

page.on('console', msg => {
  const text = msg.text()
  if (text.includes('waitForResult') || text.includes('fileExists') || text.includes('poll')) {
    console.log(`[BROWSER] ${text}`)
  }
})
page.on('pageerror', err => console.log(`[PAGE ERROR] ${err.message}`))

// 监听 fetch 请求
page.on('response', async resp => {
  const url = resp.url()
  if (url.includes(':9000')) {
    const status = resp.status()
    const method = resp.request().method()
    console.log(`[FETCH ${method} ${status}] ${url}`)
  }
})

await page.goto('http://localhost:5174', { waitUntil: 'networkidle' })

// 上传文件、填提示词
const testFile = '/tmp/test-code.zip'
await page.locator('#file-input').setInputFiles(testFile)
await page.locator('.btn-primary', { hasText: '下一步' }).click()
await page.waitForSelector('.prompt-input', { timeout: 3000 })
await page.locator('.prompt-input').fill('安全扫描测试')
await page.locator('.btn-primary', { hasText: '提交扫描' }).click()
await page.waitForSelector('.step-card.waiting', { timeout: 5000 })

const uuid = (await page.locator('.status-value.uuid').textContent()).trim()
console.log(`[UUID] ${uuid}`)

// seed
await fetch(`http://localhost:9000/seed?uuid=${encodeURIComponent(uuid)}`)
console.log(`[SEED] Done`)

// 等待 Step 4
try {
  await page.waitForSelector('.step-card.result', { timeout: 20000 })
  console.log('[SUCCESS] Step 4 appeared!')
} catch(e) {
  const elapsed = await page.locator('.elapsed-badge').textContent().catch(() => 'n/a')
  console.log(`[FAIL] Step 4 did not appear. Elapsed: ${elapsed}`)
  
  // Check what's on the page
  const stepCard = await page.locator('.step-card').first().getAttribute('class')
  console.log(`[STATE] step-card class: ${stepCard}`)
  
  // Check poll count
  const pollText = await page.locator('.status-value').nth(3).textContent().catch(() => 'n/a')
  console.log(`[STATE] poll text: ${pollText}`)
}

await browser.close()
