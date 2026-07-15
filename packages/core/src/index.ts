/**
 * @habit-tracking/core — 习惯打卡核心模块
 *
 * 共享类型定义、API 调用封装和 React Hooks。
 */

export * from './habits/types/calendar';
export { fetchCalendarMonth, getCurrentYearMonth, isValidYearMonth } from './habits/api/calendar';
export { useCalendarMonth } from './habits/hooks/useCalendarMonth';
