/**
 * 安全验证
 * 检查输出是否包含敏感信息或有害内容
 */

interface SecurityConfig {
  disallow_leak_system_prompt?: boolean;
  disallow_sensitive_content?: boolean;
  sensitive_patterns?: string[];
  disallow_harmful_content?: boolean;
}

interface CheckResult {
  errors: Array<{ type: string; message: string; severity: 'error' | 'warning' }>;
  warnings: Array<{ type: string; message: string }>;
}

// 默认敏感信息模式
const DEFAULT_SENSITIVE_PATTERNS = [
  '密码',
  'password',
  'token',
  '密钥',
  'secret',
  'api_key',
  'API_KEY',
  '身份证',
  '手机号',
  '银行卡',
];

export async function securityCheck(
  output: string,
  config?: SecurityConfig
): Promise<CheckResult> {
  const errors: CheckResult['errors'] = [];
  const warnings: CheckResult['warnings'] = [];

  if (!config) {
    return { errors, warnings };
  }

  const patterns = config.sensitive_patterns || DEFAULT_SENSITIVE_PATTERNS;

  // 检查敏感信息泄露
  if (config.disallow_sensitive_content !== false) {
    for (const pattern of patterns) {
      if (output.toLowerCase().includes(pattern.toLowerCase())) {
        errors.push({
          type: 'security',
          message: `输出可能包含敏感信息：${pattern}`,
          severity: 'error',
        });
      }
    }
  }

  // 检查是否泄露系统提示
  if (config.disallow_leak_system_prompt) {
    const systemPromptPatterns = ['SOUL.md', 'AGENTS.md', 'MEMORY.md', '提示词', 'system prompt'];
    for (const pattern of systemPromptPatterns) {
      if (output.includes(pattern)) {
        errors.push({
          type: 'security',
          message: '输出可能包含系统内部信息',
          severity: 'error',
        });
      }
    }
  }

  return { errors, warnings };
}
