import React from 'react';

interface PromptInputProps {
  disabled: boolean;
  value: string;
  onChange: (val: string) => void;
  showInjectionHint?: boolean;
}

const INJECTION_PREVIEW = `（提交时自动追加：上传报告至 MinIO，UUID 命名）`;

export const PromptInput: React.FC<PromptInputProps> = ({
  disabled,
  value,
  onChange,
  showInjectionHint = false,
}) => {
  return (
    <div className="prompt-input-wrapper">
      <div className="prompt-label">
        <span>🔍</span> 扫描提示词
      </div>
      <textarea
        className="prompt-textarea"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="输入扫描指令，例如：分析这段代码的安全漏洞..."
        disabled={disabled}
        rows={5}
      />
      {showInjectionHint && value.trim() && (
        <div className="injection-hint">
          <span className="hint-icon">💉</span>
          <span className="hint-text">
            提交时将在末尾自动注入 MinIO 上传指令
          </span>
        </div>
      )}
    </div>
  );
};
