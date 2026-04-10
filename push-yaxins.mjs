#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import https from 'https'

const TOKEN = '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'
const OWNER = 'wangyang962996947'
const REPO = 'yaxins'
const BRANCH = 'main'
const BASE_URL = 'https://api.github.com'

const filesMap = {
  'HARNESS_ENGINEERING.md': 'HARNESS_ENGINEERING.md',
  'HARNESS_IO.md': 'HARNESS_IO.md',
  '.gitignore': '.gitignore',
}

function api(method, path2, body = null) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'api.github.com',
      path: path2,
      method,
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'yaxin-agent',
      }
    }
    if (body) { opts.headers['Content-Type'] = 'application/json' }
    const req = https.request(opts, res => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d) }) }
        catch { resolve({ status: res.statusCode, data: d }) }
      })
    })
    req.on('error', reject)
    if (body) req.write(JSON.stringify(body))
    req.end()
  })
}

async function getSha(fp) {
  const r = await api('GET', `/repos/${OWNER}/${REPO}/contents/${fp}?ref=${BRANCH}`)
  if (r.status === 404) return null
  if (r.status !== 200) throw new Error(`getSha ${fp}: ${r.status}`)
  return r.data.sha || null
}

async function putFile(fp, content) {
  const body = { message: `feat: add ${fp}`, content: content.toString('base64'), branch: BRANCH }
  const sha = await getSha(fp)
  if (sha) body.sha = sha
  const r = await api('PUT', `/repos/${OWNER}/${REPO}/contents/${fp}`, body)
  if (r.status !== 200 && r.status !== 201) throw new Error(`${r.status}: ${JSON.stringify(r.data)}`)
}

async function walk(dir, base) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const files = []
  for (const e of entries) {
    if (['node_modules', '.git'].includes(e.name)) continue
    const fp = path.join(dir, e.name), rp = path.join(base, e.name)
    if (e.isDirectory()) files.push(...(await walk(fp, rp)))
    else files.push(rp)
  }
  return files
}

async function main() {
  const base = '/home/gem/workspace/agent/workspace'
  const dirs = ['agents', 'projects', 'code-scanning-plugin', 'HARNESS-AGENT']

  // 收集所有文件
  for (const d of dirs) {
    const dir = path.join(base, d)
    if (!fs.existsSync(dir)) continue
    const files = await walk(dir, d)
    for (const f of files) filesMap[f] = f
  }

  const entries = Object.entries(filesMap)
  console.log(`📦 共 ${entries.length} 个文件/目录待推送\n`)

  let ok = 0, fail = 0
  for (const [src, dst] of entries) {
    const fullSrc = path.join(base, src)
    if (!fs.existsSync(fullSrc)) continue
    if (!fs.statSync(fullSrc).isFile()) continue
    try {
      const content = fs.readFileSync(fullSrc)
      await putFile(dst, content)
      console.log(`  ✅ ${dst}`)
      ok++
    } catch (e) {
      console.log(`  ❌ ${dst}: ${e.message}`)
      fail++
    }
    await new Promise(r => setTimeout(r, 250))
  }

  console.log(`\n📊 完成: 成功 ${ok} / 失败 ${fail}`)
  if (fail > 0) process.exit(1)
}

main().catch(e => { console.error(e); process.exit(1) })
