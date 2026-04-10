import React, { useState, useCallback } from 'react';
import { UploadZone } from './UploadZone';
import { PromptInput } from './PromptInput';
import { ScanStatus } from './ScanStatus';
import { ResultViewer } from './ResultViewer';
import { useScanTask } from '../../hooks/useScanTask';
import type { ScanTask } from '../../types';
import './styles.css';

// 步骤配置
const STEPS = [
  { number: 1, label: '上传文件' },
  { number: 2, label: '提交扫描' },
  { number: 3, label: '查看报告' },
];

const StepDot: React.FC<{
  number: number;
  label: string;
  active: boolean;
  done: boolean;
}> = ({ number, label, active, done }) => (
  <div className={`step-item ${done ? 'done' : active ? 'active' : 'pending'}`}>
    <div className="step-circle">
      {done ? '✓' : number}
    </div>
    <span className="step-label">{label}</span>
    {number < STEPS.length && <div className="step-connector" />}
  </div>
);

export const CodeScanner: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [prompt, setPrompt] = useState('');
  const { task, startScan, reset } = useScanTask();

  const isWorking = !['idle', 'done', 'error'].includes(task.status);
  const canSubmit = !!file && prompt.trim().length > 0 && !isWorking;

  const currentStep = task.status === 'idle' ? 1
    : ['uploading', 'scanning', 'processing'].includes(task.status) ? 2
    : task.status === 'done' ? 3
    : task.status === 'error' ? 2
    : 1;

  const handleSubmit = useCallback(() => {
    if (!file || !prompt.trim()) return;
    startScan(file, prompt.trim());
  }, [file, prompt, startScan]);

  const handleReset = useCallback(() => {
    reset();
    setFile(null);
    setPrompt('');
  }, [reset]);

  return (
    <div className="code-scanner">
      <div className="scanner-header">
        <h2 className="scanner-title">🔍 代码扫描插件</h2>
        <p className="scanner-subtitle">上传 ZIP → 输入提示词 → 自动扫描 → 查看报告</p>
      </div>

      {/* 步骤指示器 */}
      <div className="step-indicator">
        {STEPS.map(s => (
          <StepDot
            key={s.number}
            number={s.number}
            label={s.label}
            active={currentStep === s.number}
            done={currentStep > s.number}
          />
        ))}
      </div>

      {/* 上传区 */}
      <UploadZone
        disabled={isWorking}
        onFileSelected={setFile}
        acceptedFileName={file?.name}
      />

      {/* 提示词区 */}
      <PromptInput
        disabled={isWorking}
        value={prompt}
        onChange={setPrompt}
        showInjectionHint={true}
      />

      {/* 操作按钮 */}
      <div className="action-bar">
        <button
          className="btn-primary"
          disabled={!canSubmit}
          onClick={handleSubmit}
        >
          🚀 提交扫描任务
        </button>
        {(task.status === 'done' || task.status === 'error') && (
          <button className="btn-secondary" onClick={handleReset}>
            🔄 新建任务
          </button>
        )}
      </div>

      {/* 状态展示 */}
      {task.status !== 'idle' && (
        <ScanStatus task={task} onCancel={isWorking ? reset : undefined} />
      )}

      {/* 结果 */}
      {task.status === 'done' && task.resultHtml && (
        <ResultViewer
          html={task.resultHtml}
          mdContent={task.resultMdContent}
        />
      )}

      {/* 错误提示 */}
      {task.status === 'error' && (
        <div className="error-card">
          <span className="error-icon">⚠️</span>
          <span>{task.message}</span>
        </div>
      )}
    </div>
  );
};

export default CodeScanner;
