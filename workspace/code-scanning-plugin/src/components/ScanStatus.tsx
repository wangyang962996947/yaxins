import React from 'react';
import type { ScanTask } from '../types';

const STATUS_CONFIG: Record<ScanTask['status'], { label: string; color: string; icon: string }> = {
  idle:      { label: '等待中',   color: '#94a3b8', icon: '⏳' },
  uploading: { label: '上传中',   color: '#3b82f6', icon: '⬆️' },
  scanning:  { label: '扫描中',    color: '#8b5cf6', icon: '🔍' },
  processing:{ label: '处理中',    color: '#f59e0b', icon: '⚙️' },
  done:      { label: '已完成',   color: '#22c55e', icon: '✅' },
  error:     { label: '出错',     color: '#ef4444', icon: '❌' },
};

interface ScanStatusProps {
  task: ScanTask;
  onCancel?: () => void;
}

export const ScanStatus: React.FC<ScanStatusProps> = ({ task, onCancel }) => {
  const config = STATUS_CONFIG[task.status];
  const elapsed = task.startedAt
    ? Math.round((Date.now() - task.startedAt) / 1000)
    : 0;

  const isActive = ['uploading', 'scanning', 'processing'].includes(task.status);

  return (
    <div className="scan-status">
      <div className="status-header">
        <span className="status-icon">{config.icon}</span>
        <span className="status-label" style={{ color: config.color }}>
          {config.label}
        </span>
        {task.taskId && (
          <span className="task-id">Task: {task.taskId.slice(0, 8)}…</span>
        )}
        {isActive && (
          <span className="polling-indicator">
            <span className="dot" />
            轮询中
          </span>
        )}
      </div>

      {/* 进度条 */}
      {isActive && (
        <div className="progress-wrapper">
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${task.progress}%`, background: config.color }}
            />
          </div>
          <span className="progress-text">{task.progress}%</span>
        </div>
      )}

      <p className="status-message">{task.message}</p>

      <div className="status-footer">
        {task.startedAt && (
          <span className="elapsed">已耗时：{elapsed}s</span>
        )}
        {isActive && onCancel && (
          <button className="btn-cancel" onClick={onCancel}>
            取消
          </button>
        )}
      </div>

      {/* 错误信息 */}
      {task.status === 'error' && task.error && (
        <div className="error-detail">{task.error}</div>
      )}
    </div>
  );
};
