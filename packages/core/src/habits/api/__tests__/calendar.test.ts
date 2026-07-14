/**
 * 日历 API 调用测试
 *
 * @module api/__tests__/calendar.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// 在 fetch mock 前导入类型
import type { CalendarMonthData } from '../../types/calendar';
import {
  fetchCalendarMonth,
  isValidYearMonth,
  getCurrentYearMonth,
  getPrevYearMonth,
  getNextYearMonth,
  parseYearMonth,
} from '../calendar';

// ---------------------------------------------------------------------------
// 全局 fetch mock
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// ---------------------------------------------------------------------------
// Mock 数据工厂
// ---------------------------------------------------------------------------

function createMockMonthData(override?: Partial<CalendarMonthData>): CalendarMonthData {
  return {
    days: [
      { date: '2026-07-01', status: 'completed' },
      { date: '2026-07-02', status: 'missed' },
      { date: '2026-07-03', status: 'not_required' },
    ],
    summary: {
      total: 3,
      completed: 1,
      missed: 1,
    },
    ...override,
  };
}

function mockSuccessResponse(data: CalendarMonthData, code = 0, message = 'ok') {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue({ code, message, data }),
  };
}

function mockErrorResponse(status: number, code = 9999, message = 'error') {
  return {
    ok: false,
    status,
    json: vi.fn().mockResolvedValue({ code, message }),
  };
}

function mockNetworkError() {
  return Promise.reject(new TypeError('Failed to fetch'));
}

// ---------------------------------------------------------------------------
// 测试
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ===========================================================================
// 工具函数测试
// ===========================================================================

describe('工具函数', () => {
  describe('isValidYearMonth', () => {
    it('应接受合法的 yyyy-MM 格式', () => {
      expect(isValidYearMonth('2026-07')).toBe(true);
      expect(isValidYearMonth('2026-01')).toBe(true);
      expect(isValidYearMonth('2026-12')).toBe(true);
      expect(isValidYearMonth('2020-02')).toBe(true);
    });

    it('应拒绝非法格式', () => {
      expect(isValidYearMonth('2026-13')).toBe(false);  // 月份 > 12
      expect(isValidYearMonth('2026-00')).toBe(false);  // 月份 < 1
      expect(isValidYearMonth('2026-7')).toBe(false);   // 缺少前导零
      expect(isValidYearMonth('2026-07-01')).toBe(false); // 带日
      expect(isValidYearMonth('2026/07')).toBe(false);   // 分隔符错误
      expect(isValidYearMonth('')).toBe(false);          // 空字符串
      expect(isValidYearMonth('abc')).toBe(false);       // 非数字
    });
  });

  describe('parseYearMonth', () => {
    it('应正确解析合法字符串', () => {
      expect(parseYearMonth('2026-07')).toEqual({ year: 2026, month: 7 });
      expect(parseYearMonth('2026-01')).toEqual({ year: 2026, month: 1 });
      expect(parseYearMonth('2026-12')).toEqual({ year: 2026, month: 12 });
    });

    it('对非法格式应返回 null', () => {
      expect(parseYearMonth('invalid')).toBeNull();
      expect(parseYearMonth('2026-13')).toBeNull();
    });
  });

  describe('getCurrentYearMonth', () => {
    it('应返回 yyyy-MM 格式的当前月份', () => {
      const result = getCurrentYearMonth();
      expect(result).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
    });
  });

  describe('getPrevYearMonth', () => {
    it('应返回上一个月', () => {
      expect(getPrevYearMonth('2026-07')).toBe('2026-06');
      expect(getPrevYearMonth('2026-01')).toBe('2025-12'); // 跨年
      expect(getPrevYearMonth('2026-03')).toBe('2026-02');
    });

    it('对非法输入应回退到当月', () => {
      const result = getPrevYearMonth('invalid');
      expect(result).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
    });
  });

  describe('getNextYearMonth', () => {
    it('应返回下一个月', () => {
      expect(getNextYearMonth('2026-07')).toBe('2026-08');
      expect(getNextYearMonth('2026-12')).toBe('2027-01'); // 跨年
      expect(getNextYearMonth('2026-11')).toBe('2026-12');
    });

    it('对非法输入应回退到当月', () => {
      const result = getNextYearMonth('invalid');
      expect(result).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
    });
  });
});

// ===========================================================================
// fetchCalendarMonth 测试
// ===========================================================================

describe('fetchCalendarMonth', () => {
  const habitId = 'habit-123';
  const yearMonth = '2026-07';

  it('成功请求应返回 CalendarMonthData', async () => {
    const mockData = createMockMonthData();
    mockFetch.mockResolvedValue(mockSuccessResponse(mockData));

    const result = await fetchCalendarMonth(habitId, yearMonth);

    expect(result).toEqual(mockData);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining(`/api/v1/habits/${habitId}/records/calendar`),
      expect.objectContaining({
        method: 'GET',
        credentials: 'include',
      }),
    );
  });

  it('应 encodeURIComponent 处理 habitId 特殊字符', async () => {
    mockFetch.mockResolvedValue(mockSuccessResponse(createMockMonthData()));

    await fetchCalendarMonth('habit/123', '2026-07');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/habits/habit%2F123/records/calendar'),
      expect.any(Object),
    );
  });

  it('请求应包含正确的 yearMonth 参数', async () => {
    mockFetch.mockResolvedValue(mockSuccessResponse(createMockMonthData()));

    await fetchCalendarMonth(habitId, '2026-07');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('yearMonth=2026-07'),
      expect.any(Object),
    );
  });

  it('网络错误应抛出友好消息', async () => {
    mockFetch.mockImplementation(mockNetworkError);

    await expect(fetchCalendarMonth(habitId, yearMonth)).rejects.toThrow(
      '网络连接异常，请检查网络后重试',
    );
  });

  describe('HTTP 错误处理', () => {
    it('404 应抛出「习惯不存在或已停用」', async () => {
      mockFetch.mockResolvedValue(mockErrorResponse(404));
      await expect(fetchCalendarMonth(habitId, yearMonth)).rejects.toThrow(
        '习惯不存在或已停用',
      );
    });

    it('401 应抛出需要登录的错误', async () => {
      mockFetch.mockResolvedValue(mockErrorResponse(401));
      await expect(fetchCalendarMonth(habitId, yearMonth)).rejects.toThrow(
        '请先登录后再查看打卡记录',
      );
    });

    it('403 应抛出无权限错误', async () => {
      mockFetch.mockResolvedValue(mockErrorResponse(403));
      await expect(fetchCalendarMonth(habitId, yearMonth)).rejects.toThrow(
        '无权限查看该习惯的打卡记录',
      );
    });

    it('429 应抛出请求频繁错误', async () => {
      mockFetch.mockResolvedValue(mockErrorResponse(429));
      await expect(fetchCalendarMonth(habitId, yearMonth)).rejects.toThrow(
        '请求频繁，请稍后再试',
      );
    });

    it('500 应抛出服务器繁忙错误', async () => {
      mockFetch.mockResolvedValue(mockErrorResponse(500));
      await expect(fetchCalendarMonth(habitId, yearMonth)).rejects.toThrow(
        '服务器繁忙，请稍后重试',
      );
    });

    it('未映射的 4xx 应抛出通用错误', async () => {
      mockFetch.mockResolvedValue(mockErrorResponse(418)); // I'm a Teapot
      await expect(fetchCalendarMonth(habitId, yearMonth)).rejects.toThrow(
        '请求失败（418）',
      );
    });
  });

  describe('业务错误码处理', () => {
    it('非零 code 应抛出对应的错误消息', async () => {
      mockFetch.mockResolvedValue(
        mockSuccessResponse(createMockMonthData(), 2001, 'HABIT_NOT_FOUND'),
      );

      await expect(fetchCalendarMonth(habitId, yearMonth)).rejects.toThrow(
        'HABIT_NOT_FOUND',
      );
    });

    it('非零 code + 无 message 应抛出默认错误', async () => {
      mockFetch.mockResolvedValue(
        mockSuccessResponse(createMockMonthData(), 2001, ''),
      );

      await expect(fetchCalendarMonth(habitId, yearMonth)).rejects.toThrow(
        '获取打卡数据失败，请稍后再试',
      );
    });
  });

  describe('参数校验', () => {
    it('habitId 为空应抛出错误', async () => {
      await expect(fetchCalendarMonth('', yearMonth)).rejects.toThrow(
        '习惯 ID 不能为空',
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('无效 yearMonth 格式应抛出错误', async () => {
      await expect(fetchCalendarMonth(habitId, '2026-13')).rejects.toThrow(
        '月份格式无效',
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('空 yearMonth 应抛出错误', async () => {
      await expect(fetchCalendarMonth(habitId, '')).rejects.toThrow(
        '月份格式无效',
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('响应体异常处理', () => {
    it('服务端返回非 JSON 时应抛出格式错误', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected token')),
      });

      await expect(fetchCalendarMonth(habitId, yearMonth)).rejects.toThrow(
        '服务器返回数据格式异常，请稍后重试',
      );
    });

    it('data 为空时应抛出对应错误', async () => {
      mockFetch.mockResolvedValue(mockSuccessResponse(null as unknown as CalendarMonthData));

      await expect(fetchCalendarMonth(habitId, yearMonth)).rejects.toThrow(
        '服务器返回数据为空',
      );
    });
  });
});
