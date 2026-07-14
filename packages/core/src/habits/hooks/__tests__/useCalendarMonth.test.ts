/**
 * useCalendarMonth Hook 测试
 *
 * 通过 mock fetch 来控制 API 返回值（不 mock 模块本身的工具函数）。
 *
 * @module hooks/__tests__/useCalendarMonth.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useCalendarMonth } from '../useCalendarMonth';
import { getCurrentYearMonth } from '../../api/calendar';
import type { CalendarMonthData, ApiResponse } from '../../types/calendar';

// ---------------------------------------------------------------------------
// 测试数据
// ---------------------------------------------------------------------------

const mockDays: CalendarMonthData = {
  days: [
    { date: '2026-07-01', status: 'completed' },
    { date: '2026-07-02', status: 'missed' },
    { date: '2026-07-03', status: 'not_required' },
  ],
  summary: { total: 3, completed: 1, missed: 1 },
};

function okResponse(data: CalendarMonthData = mockDays): Response {
  const body: ApiResponse<CalendarMonthData> = { code: 0, message: 'ok', data };
  return { ok: true, status: 200, json: () => Promise.resolve(body) } as Response;
}

function errResponse(status: number, message = ''): Response {
  const body: ApiResponse<null> = { code: status, message };
  return { ok: false, status, json: () => Promise.resolve(body) } as Response;
}

const REAL_CURRENT_MONTH = getCurrentYearMonth();

// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse());
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ===========================================================================
// 基础功能
// ===========================================================================

describe('基础功能', () => {
  it('初始状态应显示加载中', () => {
    const { result } = renderHook(() => useCalendarMonth('habit-1'));

    expect(result.current.loading).toBe(true);
    expect(result.current.monthData).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.currentMonth).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
  });

  it('成功加载后应返回月度数据', async () => {
    const { result } = renderHook(() => useCalendarMonth('habit-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.monthData).toEqual(mockDays);
    expect(result.current.error).toBeNull();
  });

  it('加载失败应设置错误信息', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network error'));

    const { result } = renderHook(() => useCalendarMonth('habit-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.monthData).toBeNull();
    // fetchCalendarMonth 将网络异常统一转换为友好消息
    expect(result.current.error).toBe('网络连接异常，请检查网络后重试');
  });
});

// ===========================================================================
// URL 参数同步
// ===========================================================================

describe('URL 参数同步', () => {
  it('传入 urlMonth 应以该月份初始化', () => {
    const { result } = renderHook(() =>
      useCalendarMonth('habit-1', { urlMonth: '2025-12' }),
    );

    expect(result.current.currentMonth).toBe('2025-12');
  });

  it('无效的 urlMonth 应退回当月', () => {
    const { result } = renderHook(() =>
      useCalendarMonth('habit-1', { urlMonth: 'invalid-date' }),
    );

    expect(result.current.currentMonth).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
  });

  it('urlMonth 变化时应同步到内部状态', async () => {
    const { result, rerender } = renderHook(
      ({ urlMonth }) => useCalendarMonth('habit-1', { urlMonth }),
      { initialProps: { urlMonth: '2026-06' } },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.currentMonth).toBe('2026-06');

    rerender({ urlMonth: '2026-08' });

    expect(result.current.currentMonth).toBe('2026-08');
    expect(result.current.loading).toBe(true);
  });
});

// ===========================================================================
// 月份切换
// ===========================================================================

describe('月份切换', () => {
  it('goToPrevMonth 应切换到上一个月', async () => {
    const { result } = renderHook(() =>
      useCalendarMonth('habit-1', { urlMonth: '2026-07' }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.goToPrevMonth());

    // SET_MONTH 是同步 dispatch，可直接断言
    expect(result.current.currentMonth).toBe('2026-06');
  });

  it('goToNextMonth 应切换到下一个月', async () => {
    const { result } = renderHook(() =>
      useCalendarMonth('habit-1', { urlMonth: '2026-07' }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.goToNextMonth());

    expect(result.current.currentMonth).toBe('2026-08');
  });

  it('跨年切换：12月 → 1月', async () => {
    const { result } = renderHook(() =>
      useCalendarMonth('habit-1', { urlMonth: '2026-12' }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.goToNextMonth());

    expect(result.current.currentMonth).toBe('2027-01');
  });

  it('跨年切换：1月 → 12月', async () => {
    const { result } = renderHook(() =>
      useCalendarMonth('habit-1', { urlMonth: '2026-01' }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.goToPrevMonth());

    expect(result.current.currentMonth).toBe('2025-12');
  });

  it('goToToday 应回到当月', async () => {
    const { result } = renderHook(() =>
      useCalendarMonth('habit-1', { urlMonth: '2026-06' }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.goToToday());

    await waitFor(() => {
      expect(result.current.currentMonth).toBe(REAL_CURRENT_MONTH);
    });
  });

  it('当月时 goToToday 不应触发新 fetch', async () => {
    const { result } = renderHook(() =>
      useCalendarMonth('habit-1', { urlMonth: REAL_CURRENT_MONTH }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    const fetchCallsBefore = vi.mocked(fetch).mock.calls.length;
    act(() => result.current.goToToday());

    await vi.waitFor(() => {
      expect(vi.mocked(fetch).mock.calls.length).toBe(fetchCallsBefore);
    });
  });
});

// ===========================================================================
// onMonthChange 回调
// ===========================================================================

describe('onMonthChange 回调', () => {
  it('goToPrevMonth 应触发 onMonthChange', async () => {
    const onMonthChange = vi.fn();

    const { result } = renderHook(() =>
      useCalendarMonth('habit-1', { urlMonth: '2026-07', onMonthChange }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.goToPrevMonth());

    await vi.waitFor(() => {
      expect(onMonthChange).toHaveBeenCalledWith('2026-06');
    });
  });

  it('goToNextMonth 应触发 onMonthChange', async () => {
    const onMonthChange = vi.fn();

    const { result } = renderHook(() =>
      useCalendarMonth('habit-1', { urlMonth: '2026-07', onMonthChange }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.goToNextMonth());

    await vi.waitFor(() => {
      expect(onMonthChange).toHaveBeenCalledWith('2026-08');
    });
  });

  it('goToToday 应触发 onMonthChange（非当月时）', async () => {
    const onMonthChange = vi.fn();

    const { result } = renderHook(() =>
      useCalendarMonth('habit-1', { urlMonth: '2026-06', onMonthChange }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.goToToday());

    await vi.waitFor(() => {
      expect(onMonthChange).toHaveBeenCalledWith(REAL_CURRENT_MONTH);
    });
  });
});

// ===========================================================================
// 重试机制
// ===========================================================================

describe('重试机制', () => {
  it('retry 应重新加载当前月份数据', async () => {
    // 第一次：网络异常；第二次：成功
    vi.mocked(fetch)
      .mockRejectedValueOnce(new Error('net'))
      .mockResolvedValueOnce(okResponse());

    const { result } = renderHook(() =>
      useCalendarMonth('habit-1', { urlMonth: '2026-07' }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('网络连接异常，请检查网络后重试');

    act(() => result.current.retry());
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.monthData).toEqual(mockDays);
  });

  it('retry 在正在加载时不应重复 fetch', () => {
    vi.mocked(fetch).mockReturnValue(new Promise<Response>(() => {}));

    const { result } = renderHook(() =>
      useCalendarMonth('habit-1', { urlMonth: '2026-07' }),
    );

    expect(result.current.loading).toBe(true);
    const fetchCallsBefore = vi.mocked(fetch).mock.calls.length;

    act(() => result.current.retry());

    expect(vi.mocked(fetch).mock.calls.length).toBe(fetchCallsBefore);
  });
});

// ===========================================================================
// 加载状态流转
// ===========================================================================

describe('加载状态流转', () => {
  it('加载完成后切换月份应再次进入加载状态', async () => {
    const { result } = renderHook(() =>
      useCalendarMonth('habit-1', { urlMonth: '2026-07' }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.goToPrevMonth());

    await waitFor(() => {
      expect(result.current.loading).toBe(true);
    });
  });

  it('从加载成功到加载失败应正确更新状态', async () => {
    // 第一次成功 → 第二次 HTTP 429
    vi.mocked(fetch)
      .mockResolvedValueOnce(okResponse())
      .mockResolvedValueOnce(errResponse(429));

    const { result } = renderHook(() =>
      useCalendarMonth('habit-1', { urlMonth: '2026-07' }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.monthData).toEqual(mockDays);

    act(() => result.current.goToPrevMonth());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe('请求频繁，请稍后再试');
    });
  });
});
