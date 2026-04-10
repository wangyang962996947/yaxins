<!--
  CodeScanner.vue — 代码扫描插件前端组件
  流程：上传 ZIP → 输入提示词 → 提交扫描 → 轮询等待 → 展示 HTML 报告
-->
<template>
  <div class="scanner-plugin">
    <div class="plugin-header">
      <h2>🔍 代码扫描插件</h2>
    </div>

    <!-- Step 1: 上传 ZIP -->
    <div v-if="step === 1" class="step-card">
      <div class="step-title">
        <span class="step-num">①</span>
        <span>上传代码包</span>
      </div>
      <div class="step-body">
        <div class="file-upload-area" @dragover.prevent @drop.prevent="onDrop">
          <input type="file" accept=".zip" id="file-input" @change="onFileChange" />
          <label for="file-input" class="upload-label">
            <span v-if="!selectedFile">📦 点击选择或拖拽 ZIP 文件到这里</span>
            <span v-else class="file-name">✅ {{ selectedFile.name }}</span>
          </label>
        </div>
        <p class="file-hint">支持 .zip 格式，建议上传前压缩代码目录</p>
        <button class="btn-primary" :disabled="!selectedFile" @click="step = 2">
          下一步：输入提示词 →
        </button>
      </div>
    </div>

    <!-- Step 2: 输入提示词 -->
    <div v-if="step === 2" class="step-card">
      <div class="step-title">
        <span class="step-num">②</span>
        <span>输入扫描提示词</span>
      </div>
      <div class="step-body">
        <div class="prompt-templates">
          <span class="label">快速模板：</span>
          <button class="btn-tpl" @click="useTemplate('security')">🔒 安全扫描</button>
          <button class="btn-tpl" @click="useTemplate('quality')">📋 代码质量</button>
          <button class="btn-tpl" @click="useTemplate('best-practice')">✨ 最佳实践</button>
        </div>
        <textarea
          v-model="prompt"
          rows="10"
          placeholder="请输入代码扫描指令，例如：&#10;对这个代码仓库进行全面的安全扫描，检查 SQL 注入、XSS、硬编码密钥等安全问题..."
          class="prompt-input"
        />
        <p class="prompt-hint">
          提示：提示词末尾将自动追加 MinIO 上传指令，扫描完成后直接保存到对象存储。
        </p>
        <div class="btn-row">
          <button class="btn-secondary" @click="step = 1">← 上一步</button>
          <button class="btn-primary" :disabled="!prompt.trim()" @click="submitScan">
            🚀 提交扫描
          </button>
        </div>
      </div>
    </div>

    <!-- Step 3: 轮询等待 -->
    <div v-if="step === 3" class="step-card waiting">
      <div class="step-title">
        <span class="step-num spinning">⏳</span>
        <span>扫描进行中</span>
      </div>
      <div class="step-body">
        <div class="status-grid">
          <div class="status-item">
            <span class="status-label">任务 ID</span>
            <span class="status-value uuid">{{ taskUUID }}</span>
          </div>
          <div class="status-item">
            <span class="status-label">已等待</span>
            <span class="status-value">{{ formatElapsed(elapsedMs) }}</span>
          </div>
          <div class="status-item">
            <span class="status-label">预计耗时</span>
            <span class="status-value">10~15 分钟</span>
          </div>
          <div class="status-item">
            <span class="status-label">轮询状态</span>
            <span class="status-value">第 {{ pollCount }} 次查询</span>
          </div>
        </div>
        <div class="progress-bar-wrap">
          <div class="progress-bar" :style="{ width: progressPercent + '%' }" />
        </div>
        <p class="hint">请勿关闭或刷新页面，扫描完成后将自动展示报告</p>
        <button class="btn-cancel" @click="cancelScan">取消扫描</button>
      </div>
    </div>

    <!-- Step 4: 展示结果 -->
    <div v-if="step === 4" class="step-card result">
      <div class="step-title">
        <span class="step-num">✅</span>
        <span>扫描结果</span>
        <span class="elapsed-badge">耗时 {{ formatElapsed(totalMs) }}</span>
      </div>
      <div class="step-body">
        <div class="result-actions">
          <button class="btn-secondary" @click="downloadMd">📥 下载 MD 原文</button>
          <button class="btn-secondary" @click="reset">🔄 重新扫描</button>
        </div>
        <div class="report-container">
          <div class="report-content markdown-body" v-html="reportHtml" />
        </div>
      </div>
    </div>

    <!-- Error 态 -->
    <div v-if="step === 'error'" class="step-card error-card">
      <div class="step-title">
        <span class="step-num">❌</span>
        <span>扫描异常</span>
      </div>
      <div class="step-body">
        <p class="error-message">{{ errorMessage }}</p>
        <button class="btn-primary" @click="reset">重新扫描</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { marked } from 'marked'
import { v4 as uuidv4 } from 'uuid'
import {
  buildPromptWithUploadInstruction,
  submitScanTask,
  waitForResult,
  cancelWait,
  resetCancel,
} from './scanService'

// ============= 状态 =============
const step = ref<1 | 2 | 3 | 4 | 'error'>(1)
const selectedFile = ref<File | null>(null)
const prompt = ref('')
const taskUUID = ref('')
const elapsedMs = ref(0)
const totalMs = ref(0)
const pollCount = ref(0)
const reportHtml = ref('')
const reportMd = ref('')
const errorMessage = ref('')

let pollTimer: ReturnType<typeof setInterval> | null = null

// ============= 计算属性 =============
const MAX_DISPLAY_MS = 15 * 60 * 1000
const progressPercent = computed(() =>
  Math.min((elapsedMs.value / MAX_DISPLAY_MS) * 100, 100).toFixed(1)
)

// ============= 事件处理 =============
function onFileChange(e: Event) {
  selectedFile.value = (e.target as HTMLInputElement).files?.[0] ?? null
}

function onDrop(e: DragEvent) {
  const file = e.dataTransfer?.files[0]
  if (file?.name.endsWith('.zip')) {
    selectedFile.value = file
  }
}

function useTemplate(type: 'security' | 'quality' | 'best-practice') {
  const templates = {
    security: `请对这个代码仓库进行全面的安全扫描：
1. 检查 SQL 注入、XSS、CSRF 等常见 Web 安全漏洞
2. 检查硬编码密钥、API Token、密码等敏感信息泄露
3. 检查不安全的依赖库版本
4. 生成一份详细的安全问题报告，按严重程度分级（高/中/低）`,
    quality: `请对这个代码仓库进行代码质量评估：
1. 检查代码重复率
2. 检查命名规范和注释覆盖率
3. 检查圈复杂度和可维护性
4. 检查模块化和耦合度
5. 生成改进建议报告`,
    'best-practice': `请检查这个代码仓库的工程实践水平：
1. Git 提交规范和分支策略
2. CI/CD 流程配置
3. 测试覆盖率
4. 文档完整性
5. 给出综合评分和改进建议`,
  }
  prompt.value = templates[type]
}

async function submitScan() {
  if (!selectedFile.value || !prompt.value.trim()) return

  step.value = 3
  elapsedMs.value = 0
  totalMs.value = 0
  pollCount.value = 0
  reportHtml.value = ''
  reportMd.value = ''
  errorMessage.value = ''
  resetCancel()

  const uuid = uuidv4()
  taskUUID.value = uuid
  const enrichedPrompt = buildPromptWithUploadInstruction(prompt.value, uuid)

  // 启动耗时计时
  const startTime = Date.now()
  pollTimer = setInterval(() => {
    elapsedMs.value = Date.now() - startTime
  }, 1000)

  try {
    // 提交任务
    await submitScanTask(selectedFile.value, enrichedPrompt, uuid)

    // 轮询等待 MinIO 文件
    const mdContent = await waitForResult(
      uuid,
      (elapsed) => { elapsedMs.value = elapsed },
      () => { pollCount.value++ }
    )

    totalMs.value = elapsedMs.value
    reportMd.value = mdContent
    reportHtml.value = await marked(mdContent)
    step.value = 4
  } catch (err: any) {
    errorMessage.value = err.message || '扫描过程出现未知错误'
    step.value = 'error'
  } finally {
    if (pollTimer) clearInterval(pollTimer)
  }
}

function cancelScan() {
  cancelWait()
  if (pollTimer) clearInterval(pollTimer)
  reset()
}

function reset() {
  step.value = 1
  selectedFile.value = null
  prompt.value = ''
  taskUUID.value = ''
  elapsedMs.value = 0
  totalMs.value = 0
  pollCount.value = 0
  reportHtml.value = ''
  reportMd.value = ''
  errorMessage.value = ''
  if (pollTimer) clearInterval(pollTimer)
}

function downloadMd() {
  const blob = new Blob([reportMd.value], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `scan-report-${taskUUID.value}.md`
  a.click()
  URL.revokeObjectURL(url)
}

function formatElapsed(ms: number): string {
  const mins = Math.floor(ms / 60000)
  const secs = Math.floor((ms % 60000) / 1000)
  return `${mins} 分 ${secs.toString().padStart(2, '0')} 秒`
}
</script>

<style scoped>
.scanner-plugin {
  max-width: 860px;
  margin: 0 auto;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: #1f2937;
}

.plugin-header {
  margin-bottom: 20px;
}
.plugin-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

/* Step 卡片 */
.step-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 16px;
  transition: all 0.2s;
}

.step-title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;
  font-size: 16px;
  font-weight: 600;
}

.step-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: #f3f4f6;
  border-radius: 50%;
  font-size: 14px;
  flex-shrink: 0;
}

.spinning {
  animation: spin 1.2s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 上传区 */
.file-upload-area {
  position: relative;
  margin-bottom: 12px;
}

.file-upload-area input[type="file"] {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
}

.upload-label {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  border: 2px dashed #d1d5db;
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
  font-size: 15px;
  color: #6b7280;
}

.upload-label:hover {
  border-color: #3b82f6;
  background: #eff6ff;
}

.file-name {
  color: #1d4ed8;
  font-weight: 500;
}

.file-hint {
  font-size: 13px;
  color: #9ca3af;
  margin: 0 0 16px;
}

/* 提示词 */
.prompt-templates {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.label {
  font-size: 13px;
  color: #6b7280;
}

.btn-tpl {
  padding: 4px 10px;
  border: 1px solid #d1d5db;
  border-radius: 16px;
  background: #f9fafb;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-tpl:hover {
  background: #eff6ff;
  border-color: #3b82f6;
  color: #1d4ed8;
}

.prompt-input {
  width: 100%;
  box-sizing: border-box;
  padding: 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-family: 'Monaco', 'Menlo', monospace;
  font-size: 13px;
  line-height: 1.6;
  resize: vertical;
  outline: none;
  transition: border-color 0.15s;
}

.prompt-input:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.prompt-hint {
  font-size: 12px;
  color: #9ca3af;
  margin: 8px 0 16px;
}

/* 按钮 */
.btn-row {
  display: flex;
  gap: 12px;
}

.btn-primary {
  padding: 10px 24px;
  background: #2563eb;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}

.btn-primary:hover:not(:disabled) { background: #1d4ed8; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-secondary {
  padding: 10px 20px;
  background: #fff;
  color: #374151;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-secondary:hover { background: #f9fafb; }

.btn-cancel {
  padding: 8px 16px;
  background: #fff;
  color: #dc2626;
  border: 1px solid #fca5a5;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  margin-top: 16px;
}

.btn-cancel:hover { background: #fef2f2; }

/* 等待状态 */
.status-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 20px;
}

.status-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  background: #f9fafb;
  border-radius: 8px;
}

.status-label {
  font-size: 12px;
  color: #6b7280;
}

.status-value {
  font-size: 15px;
  font-weight: 600;
  color: #1f2937;
}

.status-value.uuid {
  font-family: monospace;
  font-size: 12px;
  word-break: break-all;
}

.progress-bar-wrap {
  height: 6px;
  background: #e5e7eb;
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 12px;
}

.progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #3b82f6, #60a5fa);
  border-radius: 3px;
  transition: width 1s linear;
}

.hint {
  font-size: 13px;
  color: #9ca3af;
  margin: 0;
}

/* 结果 */
.elapsed-badge {
  margin-left: auto;
  font-size: 12px;
  font-weight: 400;
  color: #6b7280;
  background: #f3f4f6;
  padding: 2px 8px;
  border-radius: 12px;
}

.result-actions {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
}

.report-container {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: auto;
  max-height: 600px;
}

.report-content {
  padding: 24px;
}

/* 错误 */
.error-card {
  border-color: #fca5a5;
  background: #fef2f2;
}

.error-message {
  color: #dc2626;
  margin: 0 0 16px;
  font-size: 14px;
}
</style>

<!-- 全局 markdown 样式（可抽到单独的 CSS 文件） -->
<style>
.markdown-body {
  font-size: 14px;
  line-height: 1.7;
  color: #1f2937;
}
.markdown-body h1 { font-size: 22px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }
.markdown-body h2 { font-size: 18px; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; }
.markdown-body h3 { font-size: 16px; }
.markdown-body table { border-collapse: collapse; width: 100%; margin: 12px 0; }
.markdown-body th, .markdown-body td { border: 1px solid #d1d5db; padding: 8px 12px; text-align: left; }
.markdown-body th { background: #f9fafb; font-weight: 600; }
.markdown-body code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
.markdown-body pre { background: #1f2937; color: #f9fafb; padding: 16px; border-radius: 8px; overflow-x: auto; }
.markdown-body pre code { background: none; padding: 0; color: inherit; }
</style>
