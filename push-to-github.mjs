#!/usr/bin/env node
/**
 * push-to-github.mjs
 * 通过 GitHub Contents API 把本地文件推送到仓库
 * 绕过 git 协议，直接用 REST API
 *
 * 用法: node push-to-github.mjs
 */

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

const TOKEN = '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'
const OWNER = 'wangyang962996947'
const REPO = 'yaxin'
const BASE_URL = `https://api.github.com/repos/${OWNER}/${REPO}/contents`

const BRANCH = 'main'

const headers = {
  'Authorization': `Bearer ${TOKEN}`,
  'Accept': 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'yaxin-agent'
}

async function fileExistsOnRemote(filePath) {
  try {
    const res = await fetch(`${BASE_URL}/${filePath}?ref=${BRANCH}`, { headers })
    if (res.status === 404) return null
    const data = await res.json()
    return data.sha || null
  } catch {
    return null
  }
}

async function uploadFile(filePath, content) {
  const encodedPath = filePath.replace(/\\/g, '/')
  const url = `${BASE_URL}/${encodedPath}?ref=${BRANCH}`

  const body = {
    message: `feat: add ${filePath}`,
    content: content.toString('base64'),
    branch: BRANCH
  }

  const sha = await fileExistsOnRemote(encodedPath)
  if (sha) {
    body.sha = sha
  }

  const res = await fetch(url, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body)
  })

  const data = await res.json()
  if (!res.ok) {
    throw new Error(`Failed to upload ${filePath}: ${JSON.stringify(data)}`)
  }
  return data
}

async function walkDir(dir, base = '') {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue
    const full = path.join(dir, entry.name)
    const rel = path.join(base, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await walkDir(full, rel)))
    } else {
      files.push(rel)
    }
  }
  return files
}

async function main() {
  const workspaceDir = '/home/gem/workspace/agent/workspace'
  const targetFiles = [
    'HARNESS_ENGINEERING.md',
    'HARNESS_IO.md',
    'agents',
    'projects',
    'code-scanning-plugin',
    'HARNESS-AGENT',
    '.gitignore'
  ]

  console.log('🚀 开始推送到 GitHub...\n')

  // 获取当前 commit SHA（用于作为 tree 的 base）
  const refRes = await fetch(`${BASE_URL}?ref=${BRANCH}`, { headers })
  const refData = await refRes.json()
  console.log('仓库当前commit:', refData.commit?.sha || '无现有提交')

  let pushed = 0
  let skipped = 0
  let failed = 0

  for (const relPath of targetFiles) {
    const fullPath = path.join(workspaceDir, relPath)
    if (!fs.existsSync(fullPath)) {
      console.log(`⏭️  跳过（不存在）: ${relPath}`)
      skipped++
      continue
    }

    const stat = fs.statSync(fullPath)

    if (stat.isDirectory()) {
      const files = await walkDir(fullPath, relPath)
      for (const file of files) {
        const fileFull = path.join(workspaceDir, file)
        const content = fs.readFileSync(fileFull)
        try {
          await uploadFile(file, content)
          console.log(`  ✅ ${file}`)
          pushed++
        } catch (err) {
          console.log(`  ❌ ${file}: ${err.message}`)
          failed++
        }
        await new Promise(r => setTimeout(r, 500)) // 限速
      }
    } else {
      const content = fs.readFileSync(fullPath)
      try {
        await uploadFile(relPath, content)
        console.log(`✅ ${relPath}`)
        pushed++
      } catch (err) {
        console.log(`❌ ${relPath}: ${err.message}`)
        failed++
      }
      await new Promise(r => setTimeout(r, 500))
    }
  }

  console.log(`\n📊 推送完成:`)
  console.log(`  成功: ${pushed}`)
  console.log(`  跳过: ${skipped}`)
  console.log(`  失败: ${failed}`)
}

main().catch(console.error)
