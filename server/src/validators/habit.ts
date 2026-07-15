/**
 * 习惯数据验证器
 *
 * 提供习惯创建和更新场景下的共享验证函数，
 * 确保周期表达式等字段在创建和更新时遵守相同的规则。
 */

// ---------------------------------------------------------------------------
// 周期表达式类型定义
// ---------------------------------------------------------------------------

/** 支持的周期类型 */
export type CycleType = 'daily' | 'weekly_days' | 'weekly_n_times';

/** 周期表达式结构 */
export interface CycleExpression {
  type: CycleType;
  params: CycleParams;
}

/** 周期参数 - 根据 type 不同有不同的结构 */
export type CycleParams =
  | DailyParams      // type === 'daily'
  | WeeklyDaysParams // type === 'weekly_days'
  | WeeklyNTimesParams; // type === 'weekly_n_times'

export interface DailyParams {
  // 每日习惯，无额外参数
}

export interface WeeklyDaysParams {
  days: number[]; // 1-7 表示周一至周日
}

export interface WeeklyNTimesParams {
  count: number; // 每周 N 次 (1-7)
}

// ---------------------------------------------------------------------------
// 验证错误
// ---------------------------------------------------------------------------

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

// ---------------------------------------------------------------------------
// 验证函数
// ---------------------------------------------------------------------------

const VALID_CYCLE_TYPES: CycleType[] = ['daily', 'weekly_days', 'weekly_n_times'];

/**
 * 验证周期表达式。
 *
 * 检查 type 是否为有效枚举值，并根据 type 验证 params 结构。
 * 可在创建和更新路由中复用。
 *
 * @param expression - 周期表达式对象（或 JSON 字符串）
 * @returns 验证结果
 */
export function validateCycleExpression(expression: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  // 解析输入
  let parsed: Record<string, unknown>;

  if (typeof expression === 'string') {
    try {
      parsed = JSON.parse(expression);
    } catch {
      errors.push({ field: 'cycle_expression', message: '周期表达式必须是有效的 JSON 字符串' });
      return { valid: false, errors };
    }
  } else if (typeof expression === 'object' && expression !== null) {
    parsed = expression as Record<string, unknown>;
  } else {
    errors.push({ field: 'cycle_expression', message: '周期表达式必须是对象或 JSON 字符串' });
    return { valid: false, errors };
  }

  // 验证 type 字段
  if (!parsed.type || typeof parsed.type !== 'string') {
    errors.push({ field: 'cycle_expression.type', message: '周期类型不能为空' });
    return { valid: false, errors };
  }

  if (!VALID_CYCLE_TYPES.includes(parsed.type as CycleType)) {
    errors.push({
      field: 'cycle_expression.type',
      message: `周期类型必须为以下之一：${VALID_CYCLE_TYPES.join(', ')}`,
    });
    return { valid: false, errors };
  }

  // 验证 params 字段
  const params = parsed.params as Record<string, unknown> | undefined;

  switch (parsed.type as CycleType) {
    case 'daily':
      // daily 不需要特殊参数
      break;

    case 'weekly_days':
      validateWeeklyDaysParams(params, errors);
      break;

    case 'weekly_n_times':
      validateWeeklyNTimesParams(params, errors);
      break;
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 验证 weekly_days 类型参数。
 */
function validateWeeklyDaysParams(
  params: Record<string, unknown> | undefined,
  errors: ValidationError[],
): void {
  if (!params || !Array.isArray(params.days)) {
    errors.push({ field: 'cycle_expression.params.days', message: 'weekly_days 类型需要 days 数组' });
    return;
  }

  if (params.days.length === 0) {
    errors.push({ field: 'cycle_expression.params.days', message: 'days 数组不能为空' });
    return;
  }

  for (const day of params.days) {
    if (typeof day !== 'number' || !Number.isInteger(day) || day < 1 || day > 7) {
      errors.push({ field: 'cycle_expression.params.days', message: 'days 中的值必须为 1-7 的整数' });
      return;
    }
  }
}

/**
 * 验证 weekly_n_times 类型参数。
 */
function validateWeeklyNTimesParams(
  params: Record<string, unknown> | undefined,
  errors: ValidationError[],
): void {
  if (!params || typeof params.count !== 'number') {
    errors.push({ field: 'cycle_expression.params.count', message: 'weekly_n_times 类型需要 count 字段（数字）' });
    return;
  }

  if (!Number.isInteger(params.count) || params.count < 1 || params.count > 7) {
    errors.push({ field: 'cycle_expression.params.count', message: 'count 必须为 1-7 的整数' });
    return;
  }
}
