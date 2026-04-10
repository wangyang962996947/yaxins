#!/usr/bin/env node
/**
 * push-via-api.mjs
 * 通过 GitHub Contents API 推送文件到仓库
 * 绕过 git 协议，用 HTTPS REST API
 */
import fs from 'fs'
import path from 'path'
import https from 'https'

const TOKEN = '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'
const OWNER = 'wangyang962996947'
const REPO = 'yaxins'
const BRANCH = 'main'

const BASE_URL = `https://api.github.com`

function api(method, path2, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path2, BASE_URL)
    const opts = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'yaxin-agent',
      }
    }
    if (body) {
      opts.headers['Content-Type'] = 'application/json'
    }
    const req = https.request(opts, res => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) })
        } catch {
          resolve({ status: res.statusCode, data })
        }
      })
    })
    req.on('error', reject)
    if (body) req.write(JSON.stringify(body))
    req.end()
  })
}

async function getSha(filePath) {
  const res = await api('GET', `/repos/${OWNER}/${REPO}/contents/${filePath}?ref=${BRANCH}`)
  if (res.status === 404) return null
  if (res.status !== 200) throw new Error(`getSha ${filePath} failed: ${JSON.stringify(res.data)}`)
  return res.data.sha || null
}

async function uploadFile(filePath, content) {
  const encodedPath = filePath.replace(/\\/g, '/')
  const body = {
    message: `feat: add ${encodedPath}`,
    content: content.toString('base64'),
    branch: BRANCH
  }
  const sha = await getSha(encodedPath)
  if (sha) body.sha = sha

  const res = await api('PUT', `/repos/${OWNER}/${REPO}/contents/${encodedPath}`, body)
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`${res.status}: ${JSON.stringify(res.data)}`)
  }
  return res
}

async function walk(dir, base = '') {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const files = []
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.git') continue
    const fp = path.join(dir, e.name)
    const rp = path.join(base, e.name)
    if (e.isDirectory()) files.push(...(await walk(fp, rp)))
    else files.push(rp)
  }
  return files
}

async function main() {
  const base = '/home/gem/workspace/agent/workspace'
  const items = [
    ['HARNESS_ENGINEERING.md', 'HARNESS_ENGINEERING.md'],
    ['HARNESS_IO.md', 'HARNESS_IO.md'],
    ['.gitignore', '.gitignore'],
  ]

  // 添加 agents 目录
  const agentsDir = path.join(base, 'agents')
  if (fs.existsSync(agentsDir)) {
    const files = await walk(agentsDir, 'agents')
    for (const f of files) items.push([f, f])
  }

  // 添加 projects 目录
  const projectsDir = path.join(base, 'projects')
  if (fs.existsSync(projectsDir)) {
    const files = await walk(projectsDir, 'projects')
    for (const f of files) items.push([f, f])
  }

  // 添加 code-scanning-plugin
  const csDir = path.join(base, 'code-scanning-plugin')
  if (fs.existsSync(csDir)) {
    const files = await walk(csDir, 'code-scanning-plugin')
    for (const f of files) items.push([f, f])
  }

  // 添加 HARNESS-AGENT
  const harnessDir = path.join(base, 'HARNESS-AGENT')
  if (fs.existsSync(harnessDir)) {
    const files = await walk(harnessDir, 'HARNESS-AGENT')
    for (const f of files) items.push([f, f])
  }

  console.log(`📦 共 ${items.length} 个文件待推送\n`)

  let ok = 0, fail = 0
  for (const [srcPath, dstPath] of items) {
    const fullSrc = path.join(base, srcPath)
    if (!fs.existsSync(fullSrc)) continue
    try {
      const content = fs.readFileSync(fullSrc)
      await uploadFile(dstPath, content)
      console.log(`  ✅ ${dstPath}`)
      ok++
    } catch (e) {
      console.log(`  ❌ ${dstPath}: ${e.message}`)
      fail++
    }
    await new Promise(r => setTimeout(r, 300))
  }

  console.log(`\n📊 完成: 成功 ${ok} / 失败 ${fail}`)
}

main().catch(console.error)
