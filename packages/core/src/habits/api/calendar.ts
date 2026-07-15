/**
 * 打卡日历 API 调用封装
 *
 * 封装 `GET /api/v1/habits/{habitId}/records/calendar?yearMonth=` 的请求逻辑，
 * 处理 HTTP 错误并映射为友好的中文错误消息。
 *
 * @module api/calendar
 */

import { CalendarMonthData, ApiResponse } from '../types/calendar';

/**
 * API 基础路径，优先取环境变量，默认为相对路径（由反向代理处理）
 */
const API_BASE = (typeof process !== 'undefined' && process.env.API_BASE) || '';

/**
 * HTTP 状态码到友好错误消息的映射
 */
const HTTP_ERROR_MESSAGES: Record<number, string> = {
  400: '请求参数有误，请检查月份格式',
  401: '请先登录后再查看打卡记录',
  403: '无权限查看该习惯的打卡记录',
  404: '习惯不存在或已停用',
  429: '请求频繁，请稍后再试',
};

/**
 * 格式化 yearMonth 参数，确保为 yyyy-MM 格式
 */
function formatYearMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * 解析 API 返回的错误消息
 */
function extractErrorMessage(response: ApiResponse<unknown>): string {
  if (response.message && response.message !== 'ok') {
    return response.message;
  }
  return '获取打卡数据失败，请稍后再试';
}

/**
 * 获取当前月份的年月字符串（yyyy-MM）
 */
export function getCurrentYearMonth(): string {
  const now = new Date();
  return formatYearMonth(now.getFullYear(), now.getMonth() + 1);
}

/**
 * 校验 yearMonth 字符串是否为有效的 yyyy-MM 格式
 */
export function isValidYearMonth(yearMonth: string): boolean {
  const regex = /^\d{4}-(0[1-9]|1[0-2])$/;
  return regex.test(yearMonth);
}

/**
 * 从 yearMonth 字符串解析年份和月份
 */
export function parseYearMonth(yearMonth: string): { year: number; month: number } | null {
  if (!isValidYearMonth(yearMonth)) return null;
  const parts = yearMonth.split('-');
  return {
    year: parseInt(parts[0], 10),
    month: parseInt(parts[1], 10),
  };
}

/**
 * 计算上一个月的 yearMonth 字符串
 */
export function getPrevYearMonth(yearMonth: string): string {
  const parsed = parseYearMonth(yearMonth);
  if (!parsed) return getCurrentYearMonth();

  let { year, month } = parsed;
  month--;
  if (month < 1) {
    month = 12;
    year--;
  }
  return formatYearMonth(year, month);
}

/**
 * 计算下一个月的 yearMonth 字符串
 */
export function getNextYearMonth(yearMonth: string): string {
  const parsed = parseYearMonth(yearMonth);
  if (!parsed) return getCurrentYearMonth();

  let { year, month } = parsed;
  month++;
  if (month > 12) {
    month = 1;
    year++;
  }
  return formatYearMonth(year, month);
}

/**
 * 获取打卡日历月度数据
 *
 * @param habitId - 习惯 ID
 * @param yearMonth - 年月，格式 yyyy-MM（如 "2026-07"）
 * @returns 当月日历数据
 * @throws 网络异常或服务端错误时抛出可读的错误消息
 */
export async function fetchCalendarMonth(
  habitId: string,
  yearMonth: string,
): Promise<CalendarMonthData> {
  // 参数校验
  if (!habitId) {
    throw new Error('习惯 ID 不能为空');
  }
  if (!isValidYearMonth(yearMonth)) {
    throw new Error(`月份格式无效：${yearMonth}，应为 yyyy-MM 格式`);
  }

  const url = `${API_BASE}/api/v1/habits/${encodeURIComponent(habitId)}/records/calendar?yearMonth=${encodeURIComponent(yearMonth)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include', // 发送 cookie 鉴权
    });
  } catch (networkError) {
    // 网络层面异常（断网、DNS 解析失败等）
    throw new Error('网络连接异常，请检查网络后重试');
  }

  // HTTP 错误处理
  if (!response.ok) {
    const errorMessage =
      HTTP_ERROR_MESSAGES[response.status] ||
      (response.status >= 500
        ? '服务器繁忙，请稍后重试'
        : `请求失败（${response.status}）`);

    // 尝试解析服务端返回的错误详情
    try {
      const errorBody: ApiResponse<unknown> = await response.json();
      const serverMessage = extractErrorMessage(errorBody);
      throw new Error(serverMessage);
    } catch {
      // 如果解析失败，使用预设的友好消息
      throw new Error(errorMessage);
    }
  }

  // 解析成功响应
  let body: ApiResponse<CalendarMonthData>;
  try {
    body = await response.json();
  } catch {
    throw new Error('服务器返回数据格式异常，请稍后重试');
  }

  // 业务错误码检查
  if (body.code !== 0) {
    throw new Error(extractErrorMessage(body));
  }

  if (!body.data) {
    throw new Error('服务器返回数据为空');
  }

  return body.data;
}
