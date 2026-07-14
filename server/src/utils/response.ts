/**
 * 标准化 JSON 响应工具
 *
 * 所有 API 响应遵循统一格式：
 * {
 *   "code": 0,          // 业务码，0 表示成功
 *   "message": "ok",    // 提示信息
 *   "data": { ... }     // 业务数据（可选）
 * }
 */
import { Response } from 'express';
import { ErrorCodes, ErrorMessages, AppError } from './errors';

export interface ApiResponseBody<T = unknown> {
  code: number;
  message: string;
  data?: T;
}

/**
 * 发送成功响应。
 * @param res  Express Response
 * @param data 业务数据（可选）
 * @param status HTTP 状态码（默认 200）
 */
export function sendSuccess<T>(
  res: Response,
  data?: T,
  status: number = 200,
): void {
  const body: ApiResponseBody<T> = {
    code: ErrorCodes.SUCCESS,
    message: ErrorMessages[ErrorCodes.SUCCESS],
  };
  if (data !== undefined) {
    body.data = data;
  }
  res.status(status).json(body);
}

/**
 * 发送错误响应。
 * @param res Express Response
 * @param err AppError 实例或普通 Error
 */
export function sendError(res: Response, err: Error): void {
  if (err instanceof AppError) {
    const body: ApiResponseBody = {
      code: err.code,
      message: err.message,
    };
    if (err.data !== undefined) {
      body.data = err.data;
    }
    res.status(err.httpStatus).json(body);
  } else {
    // 未预期的错误 → 500
    res.status(500).json({
      code: ErrorCodes.INTERNAL_ERROR,
      message: ErrorMessages[ErrorCodes.INTERNAL_ERROR],
    });
  }
}
