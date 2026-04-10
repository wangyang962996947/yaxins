import React, { useCallback } from 'react';

interface ResultViewerProps {
  html: string;
  mdContent?: string;
}

export const ResultViewer: React.FC<ResultViewerProps> = ({ html, mdContent }) => {
  const handleDownloadMd = useCallback(() => {
    if (!mdContent) return;
    const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scan-report-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [mdContent]);

  const handleCopyMd = useCallback(() => {
    if (mdContent) {
      navigator.clipboard.writeText(mdContent);
    }
  }, [mdContent]);

  return (
    <div className="result-viewer">
      <div className="result-toolbar">
        <span className="result-title">📋 扫描报告</span>
        <div className="toolbar-actions">
          <button className="btn-toolbar" onClick={handleDownloadMd}>
            ⬇️ 下载 MD
          </button>
          <button className="btn-toolbar" onClick={handleCopyMd}>
            📋 复制 MD
          </button>
        </div>
      </div>

      <div
        className="report-content markdown-body"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
};
