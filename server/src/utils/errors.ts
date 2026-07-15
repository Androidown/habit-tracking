/**
 * 标准化错误码与异常类
 *
 * 错误码规则：
 *   0      — 成功
 *   1001   — 请求参数校验失败（VALIDATION_ERROR）
 *   2001   — 习惯不存在（HABIT_NOT_FOUND）
 *   2002   — 无操作权限（FORBIDDEN）
 *   2003   — 习惯已删除（HABIT_DELETED）
 *   3001   — 未认证（UNAUTHORIZED）
 *   9999   — 服务器内部错误（INTERNAL_ERROR）
 */

export const ErrorCodes = {
  SUCCESS: 0,
  VALIDATION_ERROR: 1001,
  HABIT_NOT_FOUND: 2001,
  FORBIDDEN: 2002,
  HABIT_DELETED: 2003,
  UNAUTHORIZED: 3001,
  INTERNAL_ERROR: 9999,
} as const;

export const ErrorMessages: Record<number, string> = {
  [ErrorCodes.SUCCESS]: 'ok',
  [ErrorCodes.VALIDATION_ERROR]: 'VALIDATION_ERROR',
  [ErrorCodes.HABIT_NOT_FOUND]: 'HABIT_NOT_FOUND',
  [ErrorCodes.FORBIDDEN]: 'FORBIDDEN',
  [ErrorCodes.HABIT_DELETED]: 'HABIT_DELETED',
  [ErrorCodes.UNAUTHORIZED]: 'UNAUTHORIZED',
  [ErrorCodes.INTERNAL_ERROR]: 'INTERNAL_ERROR',
};

/**
 * 应用层业务异常。
 * 携带 code / message / data（可选），由错误处理中间件统一拾取并序列化。
 */
export class AppError extends Error {
  public readonly code: number;
  public readonly data?: unknown;

  constructor(code: number, message?: string, data?: unknown) {
    super(message || ErrorMessages[code] || 'UNKNOWN_ERROR');
    this.name = 'AppError';
    this.code = code;
    this.data = data;
  }

  /** HTTP 状态码映射 */
  get httpStatus(): number {
    switch (this.code) {
      case ErrorCodes.VALIDATION_ERROR:
        return 422;
      case ErrorCodes.UNAUTHORIZED:
        return 401;
      case ErrorCodes.FORBIDDEN:
        return 403;
      case ErrorCodes.HABIT_NOT_FOUND:
        return 404;
      case ErrorCodes.HABIT_DELETED:
        return 410;
      case ErrorCodes.INTERNAL_ERROR:
      default:
        return 500;
    }
  }
}
