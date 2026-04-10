#!/usr/bin/env node
/**
 * reset-via-tree.mjs
 * 用 git tree API 重写仓库，只保留 projects/code-scanning-plugin/
 */
import fs from 'fs'
import path from 'path'
import https from 'https'

const T = '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'
const OWN = 'wangyang962996947'
const REPO = 'yaxins'
const BR = 'main'

function api(method, path2, body = null) {
  return new Promise((res, rej) => {
    const h = {
      'Authorization': `Bearer ${T}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'yaxin'
    }
    if (body) h['Content-Type'] = 'application/json'
    const r = https.request({ hostname: 'api.github.com', path: path2, method, headers: h }, resp => {
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

function base64(content) {
  return Buffer.from(content).toString('base64')
}

async function getRef() {
  const r = await api('GET', `/repos/${OWN}/${REPO}/git/refs/heads/${BR}`)
  if (r.s !== 200) throw new Error(`getRef: ${r.s}`)
  return r.b.object.sha  // commit SHA
}

async function getCommit(sha) {
  const r = await api('GET', `/repos/${OWN}/${REPO}/git/commits/${sha}`)
  if (r.s !== 200) throw new Error(`getCommit: ${r.s}`)
  return r.b
}

async function createBlob(content) {
  const r = await api('POST', `/repos/${OWN}/${REPO}/git/blobs`, {
    content: base64(content),
    encoding: 'base64'
  })
  if (r.s !== 201) throw new Error(`createBlob: ${r.s}`)
  return r.b.sha
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

async function createTree(baseTreeSha, files) {
  // files: [{path, sha, mode}]
  const r = await api('POST', `/repos/${OWN}/${REPO}/git/trees`, {
    base_tree: baseTreeSha,
    tree: files
  })
  if (r.s !== 201) throw new Error(`createTree: ${r.s}`)
  return r.b.sha
}

async function createCommit(treeSha, parentSha, msg) {
  const r = await api('POST', `/repos/${OWN}/${REPO}/git/commits`, {
    message: msg,
    tree: treeSha,
    parents: [parentSha]
  })
  if (r.s !== 201) throw new Error(`createCommit: ${r.s}`)
  return r.b.sha
}

async function updateRef(newCommitSha) {
  const r = await api('PATCH', `/repos/${OWN}/${REPO}/git/refs/heads/${BR}`, {
    sha: newCommitSha,
    force: false
  })
  if (r.s !== 200) throw new Error(`updateRef: ${r.s}`)
}

async function main() {
  const projectDir = '/home/gem/workspace/agent/workspace/projects/code-scanner-plugin'

  console.log('📋 收集本地文件...\n')
  const localFiles = await walkFilesLocal(projectDir, '')
  console.log(`共 ${localFiles.length} 个文件\n`)

  console.log('🌳 获取当前分支 HEAD commit...\n')
  const parentCommitSha = await getRef()
  const parentCommit = await getCommit(parentCommitSha)
  const baseTreeSha = parentCommit.tree.sha
  console.log(`  parent commit: ${parentCommitSha}`)
  console.log(`  base tree:    ${baseTreeSha}\n`)

  console.log('📦 创建 blob...\n')
  const blobs = []
  for (const fp of localFiles) {
    const full = path.join(projectDir, fp)
    if (!fs.existsSync(full)) continue
    const sha = await createBlob(fs.readFileSync(full))
    blobs.push({ path: fp, sha, mode: '100644' })
    console.log(`  ✅ ${fp}`)
    await new Promise(r => setTimeout(r, 100))
  }

  console.log(`\n🌲 创建新 tree (${blobs.length} 个文件)...\n`)
  const newTreeSha = await createTree(baseTreeSha, blobs)

  console.log('📝 创建新 commit...\n')
  const msg = `feat: code-scanner-plugin\n\n- Vue3 前端（ZIP上传/提示词/MD展示）\n- Mock MinIO Server（本地模拟对象存储）\n- Express Mock 后端（模拟异步扫描）\n- marked.js MD→HTML 渲染`
  const newCommitSha = await createCommit(newTreeSha, parentCommitSha, msg)

  console.log(`  新 commit: ${newCommitSha}\n`)
  console.log('🔄 更新 main 分支...\n')
  await updateRef(newCommitSha)

  console.log(`✅ 完成！\nhttps://github.com/${OWN}/${REPO}`)
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
