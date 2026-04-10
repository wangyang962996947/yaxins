import React, { useCallback, useRef } from 'react';

interface UploadZoneProps {
  disabled: boolean;
  onFileSelected: (file: File) => void;
  acceptedFileName?: string;
}

export const UploadZone: React.FC<UploadZoneProps> = ({
  disabled,
  onFileSelected,
  acceptedFileName,
}) => {
  const [dragOver, setDragOver] = React.useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    const file = e.dataTransfer.files[0];
    if (file?.name.endsWith('.zip')) {
      onFileSelected(file);
    } else if (file) {
      alert('仅支持 .zip 格式文件');
    }
  }, [disabled, onFileSelected]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFileSelected(file);
  }, [onFileSelected]);

  const handleClick = useCallback(() => {
    if (!disabled) inputRef.current?.click();
  }, [disabled]);

  return (
    <div
      className={`upload-zone ${dragOver ? 'drag-over' : ''} ${disabled ? 'disabled' : ''} ${acceptedFileName ? 'has-file' : ''}`}
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".zip"
        style={{ display: 'none' }}
        onChange={handleFileChange}
        disabled={disabled}
      />

      {acceptedFileName ? (
        <div className="file-ready">
          <span className="file-icon">📦</span>
          <span className="file-name">{acceptedFileName}</span>
          {!disabled && <span className="re-select">点击重新选择</span>}
        </div>
      ) : (
        <div className="placeholder">
          <div className="upload-icon">📁</div>
          <p className="upload-hint">拖拽 ZIP 文件到此处，或 <span>点击选择</span></p>
          <p className="upload-tip">支持 .zip 格式</p>
        </div>
      )}
    </div>
  );
};
