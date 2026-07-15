/**
 * 打卡日历月份状态管理 Hook
 *
 * 管理当前月份、切换方向、加载状态、URL 参数同步。
 * 月份切换时仅请求目标月份数据，不预加载邻近月份。
 *
 * @module hooks/useCalendarMonth
 */

import { useCallback, useEffect, useReducer, useRef } from 'react';
import {
  CalendarMonthData,
  MonthState,
  UseCalendarMonthReturn,
} from '../types/calendar';
import {
  fetchCalendarMonth,
  getCurrentYearMonth,
  getNextYearMonth,
  getPrevYearMonth,
  isValidYearMonth,
} from '../api/calendar';

// ---------------------------------------------------------------------------
// Action 类型定义
// ---------------------------------------------------------------------------

type MonthAction =
  | { type: 'SET_MONTH'; payload: string }
  | { type: 'FETCH_START' }
  | { type: 'FETCH_SUCCESS'; payload: CalendarMonthData }
  | { type: 'FETCH_ERROR'; payload: string }
  | { type: 'CLEAR_ERROR' };

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

function monthReducer(state: MonthState, action: MonthAction): MonthState {
  switch (action.type) {
    case 'SET_MONTH':
      return {
        ...state,
        currentMonth: action.payload,
        // 切换月份时清除旧数据和错误，loading 由 FETCH_START 管理
      };
    case 'FETCH_START':
      return { ...state, loading: true, error: null };
    case 'FETCH_SUCCESS':
      return { ...state, loading: false, monthData: action.payload };
    case 'FETCH_ERROR':
      return { ...state, loading: false, error: action.payload };
    case 'CLEAR_ERROR':
      return { ...state, error: null };
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// 初始状态工厂
// ---------------------------------------------------------------------------

function createInitialState(urlMonth: string | null): MonthState {
  const currentMonth = urlMonth && isValidYearMonth(urlMonth)
    ? urlMonth
    : getCurrentYearMonth();

  return {
    currentMonth,
    monthData: null,
    loading: true, // 初始加载
    error: null,
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * 打卡日历月份状态管理
 *
 * @param habitId - 习惯 ID
 * @param options - 可选配置
 * @param options.urlMonth - URL 中的 yearMonth 参数值（外部传入以支持 SSR/SSG）
 * @param options.onMonthChange - 月份切换时的回调，用于同步 URL 参数
 */
export function useCalendarMonth(
  habitId: string,
  options?: {
    urlMonth?: string | null;
    onMonthChange?: (yearMonth: string) => void;
  },
): UseCalendarMonthReturn {
  const [state, dispatch] = useReducer(
    monthReducer,
    options?.urlMonth ?? null,
    createInitialState,
  );

  // 使用 ref 追踪当前月份，避免 effect 重复执行
  const habitIdRef = useRef(habitId);
  habitIdRef.current = habitId;

  const fetchingRef = useRef(false);

  // 标记最近一次月份变更是来自内部导航（非 URL 同步），
  // 避免 URL 同步 effect 将内部变更覆盖回旧值
  const internalNavRef = useRef(false);

  // -----------------------------------------------------------------------
  // 加载数据
  // -----------------------------------------------------------------------

  const loadMonth = useCallback(async (yearMonth: string) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    dispatch({ type: 'FETCH_START' });

    try {
      const data = await fetchCalendarMonth(habitIdRef.current, yearMonth);
      dispatch({ type: 'FETCH_SUCCESS', payload: data });
    } catch (err) {
      const message = err instanceof Error ? err.message : '获取打卡数据失败';
      dispatch({ type: 'FETCH_ERROR', payload: message });
    } finally {
      fetchingRef.current = false;
    }
  }, []);

  // -----------------------------------------------------------------------
  // URL 参数变化或初始挂载时加载数据
  // -----------------------------------------------------------------------

  useEffect(() => {
    loadMonth(state.currentMonth);
  }, [state.currentMonth, loadMonth]);

  // -----------------------------------------------------------------------
  // 外部 URL month 变化同步（当 URL 被外部修改时）
  // -----------------------------------------------------------------------

  useEffect(() => {
    // 内部导航引起的 state.currentMonth 变化不应被此 effect 覆盖
    if (internalNavRef.current) {
      internalNavRef.current = false;
      return;
    }

    const externalMonth = options?.urlMonth;
    if (
      externalMonth &&
      isValidYearMonth(externalMonth) &&
      externalMonth !== state.currentMonth
    ) {
      dispatch({ type: 'SET_MONTH', payload: externalMonth });
    }
  }, [options?.urlMonth, state.currentMonth]);

  // -----------------------------------------------------------------------
  // 切换月份
  // -----------------------------------------------------------------------

  const goToPrevMonth = useCallback(() => {
    const prev = getPrevYearMonth(state.currentMonth);
    internalNavRef.current = true;
    dispatch({ type: 'SET_MONTH', payload: prev });
    options?.onMonthChange?.(prev);
  }, [state.currentMonth, options]);

  const goToNextMonth = useCallback(() => {
    const next = getNextYearMonth(state.currentMonth);
    internalNavRef.current = true;
    dispatch({ type: 'SET_MONTH', payload: next });
    options?.onMonthChange?.(next);
  }, [state.currentMonth, options]);

  const goToToday = useCallback(() => {
    const today = getCurrentYearMonth();
    if (today !== state.currentMonth) {
      internalNavRef.current = true;
      dispatch({ type: 'SET_MONTH', payload: today });
      options?.onMonthChange?.(today);
    }
  }, [state.currentMonth, options]);

  // -----------------------------------------------------------------------
  // 重试
  // -----------------------------------------------------------------------

  const retry = useCallback(() => {
    loadMonth(state.currentMonth);
  }, [state.currentMonth, loadMonth]);

  // -----------------------------------------------------------------------
  // 返回
  // -----------------------------------------------------------------------

  return {
    currentMonth: state.currentMonth,
    monthData: state.monthData,
    loading: state.loading,
    error: state.error,
    goToPrevMonth,
    goToNextMonth,
    goToToday,
    retry,
  };
}
