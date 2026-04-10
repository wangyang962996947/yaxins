#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import https from 'https'

const T = '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'
const OWN = 'wangyang962996947'
const REPO = 'yaxins'
const BR = 'main'

function req(method, p, body = null) {
  return new Promise((res, rej) => {
    const h = {
      'Authorization': `Bearer ${T}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'yaxin'
    }
    if (body) h['Content-Type'] = 'application/json'
    const r = https.request({ hostname: 'api.github.com', path: p, method, headers: h }, resp => {
      let d = ''
      resp.on('data', c => d += c)
      resp.on('end', () => {
        try { res({ s: resp.statusCode, b: JSON.parse(d) }) }
        catch { res({ s: resp.statusCode, b: d }) }
      })
    })
    r.on('error', rej)
    if (body) r.write(JSON.stringify(body))
    r.end()
  })
}

async function listAll(fp = '') {
  const r = await req('GET', `/repos/${OWN}/${REPO}/contents/${fp}?ref=${BR}`)
  if (r.s === 404) return []
  if (r.s !== 200) throw new Error(`list ${fp}: ${r.s}`)
  return r.b
}

// 递归收集所有文件 path+sha
async function collectFiles(fp = '') {
  const items = await listAll(fp)
  const result = []
  for (const item of items) {
    if (item.type === 'file') {
      result.push({ path: item.path, sha: item.sha })
    } else if (item.type === 'dir') {
      result.push(...(await collectFiles(item.path)))
    }
  }
  return result
}

async function del(fp, sha) {
  const r = await req('DELETE', `/repos/${OWN}/${REPO}/contents/${fp}`, {
    message: `chore: remove ${fp}`, sha, branch: BR
  })
  if (r.s !== 200 && r.s !== 204) throw new Error(`del ${fp}: ${r.s}`)
}

async function put(fp, content) {
  const body = { message: `feat: ${fp}`, content: Buffer.from(content).toString('base64'), branch: BR }
  const r2 = await req('GET', `/repos/${OWN}/${REPO}/contents/${fp}?ref=${BR}`)
  if (r2.s === 200 && r2.b.sha) body.sha = r2.b.sha
  const r = await req('PUT', `/repos/${OWN}/${REPO}/contents/${fp}`, body)
  if (r.s !== 200 && r.s !== 201) throw new Error(`put ${fp}: ${r.s}`)
}

async function walkFilesLocal(dir, base = '') {
  const result = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const e of entries) {
    if (['node_modules', '.git', 'dist'].includes(e.name)) continue
    const fp = path.join(dir, e.name), rp = path.join(base, e.name)
    if (e.isDirectory()) result.push(...(await walkFilesLocal(fp, rp)))
    else result.push(rp)
  }
  return result
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)) }

async function main() {
  const projectDir = '/home/gem/workspace/agent/workspace/projects/code-scanner-plugin'

  console.log('🗑️  第一步：收集仓库中所有文件...\n')
  const remoteFiles = await collectFiles('')
  console.log(`共 ${remoteFiles.length} 个远程文件待删除\n`)

  console.log('🗑️  第二步：逐个删除...\n')
  let delOk = 0, delFail = 0
  for (const f of remoteFiles) {
    try {
      await del(f.path, f.sha)
      console.log(`  🗑️  ${f.path}`)
      delOk++
    } catch (e) {
      console.log(`  ❌ ${f.path}: ${e.message}`)
      delFail++
    }
    await delay(400)
  }
  console.log(`\n删除完成: ${delOk} 成功 / ${delFail} 失败\n`)

  console.log('📤 第三步：推送 projects/code-scanner-plugin/...\n')
  const localFiles = await walkFilesLocal(projectDir, '')
  console.log(`共 ${localFiles.length} 个本地文件待推送\n`)
  let pushOk = 0, pushFail = 0
  for (const fp of localFiles) {
    const full = path.join(projectDir, fp)
    try {
      await put(fp, fs.readFileSync(full))
      console.log(`  ✅ ${fp}`)
      pushOk++
    } catch (e) {
      console.log(`  ❌ ${fp}: ${e.message}`)
      pushFail++
    }
    await delay(400)
  }
  console.log(`\n📊 推送完成: ${pushOk} 成功 / ${pushFail} 失败`)
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
