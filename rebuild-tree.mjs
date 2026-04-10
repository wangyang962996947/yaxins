#!/usr/bin/env node
/**
 * rebuild-tree.mjs
 * 用空的 base_tree 创建全新 tree，只包含 projects/code-scanner-plugin/
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

async function getParentSha() {
  const r = await api('GET', `/repos/${OWN}/${REPO}/git/refs/heads/${BR}`)
  if (r.s !== 200) throw new Error(`getRef: ${r.s}`)
  return r.b.object.sha
}

async function createBlob(content) {
  const r = await api('POST', `/repos/${OWN}/${REPO}/git/blobs`, {
    content: Buffer.from(content).toString('base64'),
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

async function createTree(entries) {
  // 不传 base_tree！这样只包含传入的 entries，干净的新树
  const r = await api('POST', `/repos/${OWN}/${REPO}/git/trees`, { tree: entries })
  if (r.s !== 201) throw new Error(`createTree: ${JSON.stringify(r.b)}`)
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

async function updateRef(newSha) {
  const r = await api('PATCH', `/repos/${OWN}/${REPO}/git/refs/heads/${BR}`, { sha: newSha })
  if (r.s !== 200) throw new Error(`updateRef: ${r.s}`)
}

async function main() {
  const projectDir = '/home/gem/workspace/agent/workspace/projects/code-scanner-plugin'

  console.log('📋 收集本地文件...\n')
  const localFiles = await walkFilesLocal(projectDir, '')
  console.log(`共 ${localFiles.length} 个文件\n`)

  console.log('🌳 获取当前 HEAD commit...\n')
  const parentSha = await getParentSha()
  console.log(`  parent: ${parentSha}\n`)

  console.log('📦 创建 blob...\n')
  const entries = []
  for (const fp of localFiles) {
    const full = path.join(projectDir, fp)
    if (!fs.existsSync(full)) continue
    const sha = await createBlob(fs.readFileSync(full))
    entries.push({ path: fp, sha, mode: '100644' })
    process.stdout.write(`  ✅ ${fp}\n`)
    await new Promise(r => setTimeout(r, 100))
  }

  console.log(`\n🌲 创建新 tree（无 base_tree）...\n`)
  const newTreeSha = await createTree(entries)
  console.log(`  tree: ${newTreeSha}\n`)

  console.log('📝 创建 commit...\n')
  const msg = `feat: code-scanner-plugin\n\n- Vue3 前端（ZIP上传/提示词提交/MD报告展示）\n- Mock MinIO Server（本地模拟对象存储 :9000/:9001）\n- Express Mock 后端（60s 后自动注入报告）\n- Harness 开发循环追踪文档`
  const newCommitSha = await createCommit(newTreeSha, parentSha, msg)
  console.log(`  commit: ${newCommitSha}\n`)

  console.log('🔄 更新 main 分支...\n')
  await updateRef(newCommitSha)

  console.log('✅ 完成！\nhttps://github.com/wangyang962996947/yaxins')
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
