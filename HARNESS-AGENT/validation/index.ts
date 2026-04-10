/**
 * 验证层实现
 * 在模型输出到达用户之前进行质量检验
 */

import { formatCheck } from './format-check.js';
import { factCheck } from './fact-check.js';
import { securityCheck } from './security-check.js';
import { consistencyCheck } from './consistency-check.js';

export interface ValidationResult {
  passed: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  type: 'format' | 'fact' | 'security' | 'consistency';
  message: string;
  field?: string;
  severity: 'error' | 'warning';
}

export interface ValidationWarning {
  type: 'format' | 'fact' | 'security' | 'consistency';
  message: string;
  field?: string;
}

/**
 * 执行完整验证流程
 * 按顺序执行四类检查，任何一步失败都可以选择拒绝或修正
 */
export async function validate(
  input: string,
  output: string,
  context: {
    knowledgeBase?: Record<string, any>;
    securityConfig?: any;
    formatConfig?: any;
  }
): Promise<ValidationResult> {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // 1. 格式检查
  const formatResult = await formatCheck(output, context.formatConfig);
  errors.push(...formatResult.errors);
  warnings.push(...formatResult.warnings);

  // 2. 安全验证
  const securityResult = await securityCheck(output, context.securityConfig);
  errors.push(...securityResult.errors);
  warnings.push(...securityResult.warnings);

  // 3. 事实验证（如果提供了知识库）
  if (context.knowledgeBase) {
    const factResult = await factCheck(output, context.knowledgeBase);
    errors.push(...factResult.errors);
    warnings.push(...factResult.warnings);
  }

  // 4. 一致性验证
  const consistencyResult = await consistencyCheck(output, input);
  errors.push(...consistencyResult.errors);
  warnings.push(...consistencyResult.warnings);

  return {
    passed: errors.filter(e => e.severity === 'error').length === 0,
    errors,
    warnings,
  };
}

/**
 * 根据验证结果决定下一步
 */
export function decideNextStep(
  result: ValidationResult,
  options: {
    maxRetries?: number;
    currentRetry?: number;
  } = {}
): 'pass' | 'retry' | 'fallback' | 'reject' | 'human_handoff' {
  const { maxRetries = 3, currentRetry = 0 } = options;

  // 有错误，根据类型和重试次数决定
  if (!result.passed) {
    // 安全错误直接拒绝
    if (result.errors.some(e => e.type === 'security')) {
      return 'reject';
    }

    // 达到最大重试次数，尝试降级
    if (currentRetry >= maxRetries) {
      return 'fallback';
    }

    // 可以重试
    return 'retry';
  }

  // 通过验证，有警告时可选降级
  if (result.warnings.length > 0) {
    return 'fallback';
  }

  return 'pass';
}
