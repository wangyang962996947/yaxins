/**
 * 格式检查
 * 验证输出是否符合要求的格式
 */

interface FormatConfig {
  format?: 'json' | 'markdown' | 'plaintext';
  max_length?: number;
  schema?: any;
}

interface CheckResult {
  errors: Array<{ type: string; message: string; severity: 'error' | 'warning' }>;
  warnings: Array<{ type: string; message: string }>;
}

export async function formatCheck(
  output: string,
  config?: FormatConfig
): Promise<CheckResult> {
  const errors: CheckResult['errors'] = [];
  const warnings: CheckResult['warnings'] = [];

  if (!config) {
    return { errors, warnings };
  }

  const { format, max_length } = config;

  // 检查格式
  if (format === 'json') {
    try {
      JSON.parse(output);
    } catch {
      errors.push({
        type: 'format',
        message: '输出必须是有效的 JSON 格式',
        severity: 'error',
      });
    }
  }

  // 检查长度
  if (max_length && output.length > max_length) {
    errors.push({
      type: 'format',
      message: `输出长度超过限制（${max_length}字符），当前${output.length}字符`,
      severity: 'error',
    });
  }

  return { errors, warnings };
}
