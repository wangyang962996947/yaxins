<!--
  CodeScanner.vue — 代码扫描插件前端组件
  流程：上传 ZIP → 输入提示词 → 提交扫描 → 轮询等待 → 报告列表 → 点击行弹出 Modal 展示 HTML
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
          <button class="btn-tpl" @click="useTemplate('biz-logic')">📄 业务逻辑说明文档</button>
          <button class="btn-tpl" @click="useTemplate('security-analysis')">🔒 业务逻辑安全分析</button>
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
        <p class="hint">请勿关闭或刷新页面，扫描完成后将自动展示报告列表</p>
        <button class="btn-cancel" @click="cancelScan">取消扫描</button>
      </div>
    </div>

    <!-- Step 4: 报告列表 -->
    <div v-if="step === 4" class="step-card result">
      <div class="step-title">
        <span class="step-num">✅</span>
        <span>扫描结果</span>
        <span class="elapsed-badge">共 {{ reportList.length }} 份报告 · 耗时 {{ formatElapsed(totalMs) }}</span>
      </div>
      <div class="step-body">
        <div class="result-actions">
          <button class="btn-secondary" @click="reset">🔄 重新扫描</button>
        </div>

        <!-- 报告列表 -->
        <div class="report-list-wrap">
          <table class="report-table">
            <thead>
              <tr>
                <th style="width:60px">序号</th>
                <th>文件名</th>
                <th style="width:180px">生成时间</th>
                <th style="width:100px">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="item in reportList"
                :key="item.index"
                class="report-row"
                @click="openModal(item)"
              >
                <td class="center">{{ item.index }}</td>
                <td class="filename">{{ item.filename }}</td>
                <td class="time">{{ item.generateTime }}</td>
                <td class="center">
                  <button class="btn-view" @click.stop="openModal(item)">查看</button>
                </td>
              </tr>
            </tbody>
          </table>
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

    <!-- HTML 预览 Modal -->
    <div v-if="modalVisible" class="modal-overlay" @click.self="closeModal">
      <div class="modal-box">
        <div class="modal-header">
          <span class="modal-title">{{ activeItem?.filename }}</span>
          <button class="modal-close" @click="closeModal">✕</button>
        </div>
        <div class="modal-body">
          <iframe
            v-if="activeItem"
            :srcdoc="activeItem.htmlContent"
            class="html-iframe"
            sandbox="allow-scripts"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import { bizLogicTemplate, securityAnalysisTemplate } from './promptTemplates'
import {
  buildPromptWithUploadInstruction,
  submitScanTask,
  waitForResult,
  cancelWait,
  resetCancel,
  type ReportItem,
} from './scanService'

// ============= 状态 =============
const step = ref<1 | 2 | 3 | 4 | 'error'>(1)
const selectedFile = ref<File | null>(null)
const prompt = ref('')
const taskUUID = ref('')
const elapsedMs = ref(0)
const totalMs = ref(0)
const pollCount = ref(0)
const reportList = ref<ReportItem[]>([])
const errorMessage = ref('')

// Modal 状态
const modalVisible = ref(false)
const activeItem = ref<ReportItem | null>(null)

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

function useTemplate(type: 'biz-logic' | 'security-analysis') {
  prompt.value = type === 'biz-logic' ? bizLogicTemplate : securityAnalysisTemplate
}

async function submitScan() {
  if (!selectedFile.value || !prompt.value.trim()) return

  step.value = 3
  elapsedMs.value = 0
  totalMs.value = 0
  pollCount.value = 0
  reportList.value = []
  errorMessage.value = ''
  resetCancel()

  const uuid = uuidv4()
  taskUUID.value = uuid
  const enrichedPrompt = buildPromptWithUploadInstruction(prompt.value, uuid)

  const startTime = Date.now()
  pollTimer = setInterval(() => {
    elapsedMs.value = Date.now() - startTime
  }, 1000)

  try {
    await submitScanTask(selectedFile.value, enrichedPrompt, uuid)

    const list = await waitForResult(
      uuid,
      (elapsed) => { elapsedMs.value = elapsed },
      () => { pollCount.value++ }
    )

    totalMs.value = elapsedMs.value
    reportList.value = list
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
  reportList.value = []
  errorMessage.value = ''
  closeModal()
  if (pollTimer) clearInterval(pollTimer)
}

// ============= Modal 操作 =============
function openModal(item: ReportItem) {
  activeItem.value = item
  modalVisible.value = true
}

function closeModal() {
  modalVisible.value = false
  activeItem.value = null
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

/* 结果列表 */
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

.report-list-wrap {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
}

.report-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.report-table thead tr {
  background: #f9fafb;
}

.report-table th {
  text-align: left;
  padding: 10px 16px;
  font-weight: 600;
  font-size: 13px;
  color: #6b7280;
  border-bottom: 1px solid #e5e7eb;
}

.report-table td {
  padding: 12px 16px;
  border-bottom: 1px solid #f3f4f6;
  color: #374151;
}

.report-row:last-child td {
  border-bottom: none;
}

.report-row {
  cursor: pointer;
  transition: background 0.15s;
}

.report-row:hover {
  background: #f0f7ff;
}

.report-row td.center {
  text-align: center;
}

.report-row td.filename {
  font-weight: 500;
  color: #1d4ed8;
}

.report-row td.time {
  font-size: 12px;
  color: #9ca3af;
  font-family: monospace;
}

.btn-view {
  padding: 4px 12px;
  background: #eff6ff;
  color: #2563eb;
  border: 1px solid #bfdbfe;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-view:hover {
  background: #2563eb;
  color: #fff;
  border-color: #2563eb;
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

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 24px;
}

.modal-box {
  background: #fff;
  border-radius: 12px;
  width: 100%;
  max-width: 960px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 25px 60px rgba(0,0,0,0.25);
}

.modal-header {
  display: flex;
  align-items: center;
  padding: 14px 20px;
  border-bottom: 1px solid #e5e7eb;
  background: #f9fafb;
  gap: 12px;
}

.modal-title {
  flex: 1;
  font-size: 15px;
  font-weight: 600;
  color: #1f2937;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.modal-close {
  width: 28px;
  height: 28px;
  border: none;
  background: #f3f4f6;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6b7280;
  transition: all 0.15s;
  flex-shrink: 0;
}

.modal-close:hover {
  background: #fee2e2;
  color: #dc2626;
}

.modal-body {
  flex: 1;
  overflow: hidden;
  padding: 0;
}

.html-iframe {
  width: 100%;
  height: 75vh;
  border: none;
  display: block;
}
</style>
