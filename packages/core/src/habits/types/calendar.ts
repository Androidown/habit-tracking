/**
 * 打卡日历相关数据类型定义
 *
 * @module types/calendar
 */

/**
 * 每日打卡状态枚举
 *
 * - `completed`: 已完成打卡（绿色标识）
 * - `missed`: 未打卡（灰色标识）
 * - `not_required`: 无需执行（淡化/斜线标识）
 */
export enum DayStatus {
  Completed = 'completed',
  Missed = 'missed',
  NotRequired = 'not_required',
}

/**
 * 单日打卡数据
 */
export interface CalendarDay {
  /** ISO 日期字符串，格式 yyyy-MM-dd */
  date: string;
  /** 当日打卡状态 */
  status: DayStatus;
}

/**
 * 月度打卡汇总
 */
export interface CalendarSummary {
  /** 当月总天数 */
  total: number;
  /** 已完成打卡天数 */
  completed: number;
  /** 未打卡天数 */
  missed: number;
}

/**
 * 日历 API 返回的月度数据
 */
export interface CalendarMonthData {
  /** 当月每日打卡数据列表 */
  days: CalendarDay[];
  /** 当月汇总统计 */
  summary: CalendarSummary;
}

/**
 * API 响应信封（与后端约定一致）
 */
export interface ApiResponse<T> {
  code: number;
  message: string;
  data?: T;
}

/**
 * 当前月份状态
 */
export interface MonthState {
  /** 当前选中月份，格式 yyyy-MM */
  currentMonth: string;
  /** 当月日历数据 */
  monthData: CalendarMonthData | null;
  /** 是否正在加载 */
  loading: boolean;
  /** 错误信息（null 表示无错误） */
  error: string | null;
}

/**
 * useCalendarMonth Hook 的返回值
 */
export interface UseCalendarMonthReturn extends MonthState {
  /** 切换到上一个月 */
  goToPrevMonth: () => void;
  /** 切换到下一个月 */
  goToNextMonth: () => void;
  /** 跳转到当月 */
  goToToday: () => void;
  /** 重试加载当前月份数据 */
  retry: () => void;
}
