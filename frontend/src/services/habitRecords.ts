/** Habit records service — fetch recent check-in records */

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

/** 打卡记录条目 */
export interface HabitRecord {
  id: string;
  habit_id: string;
  completed_at: string;
  status: 'completed' | 'cancelled';
  created_at: string;
}

export interface FetchHabitRecordsParams {
  perPage?: number;
}

export interface HabitRecordsResponse {
  records: HabitRecord[];
  total: number;
}

/** Error type for API-level failures. */
export class HabitRecordsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HabitRecordsError';
  }
}

/** Error type for network-level failures (timeout, unreachable). */
export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

/**
 * 获取指定习惯的最近打卡记录列表
 *
 * Returns the response data on success.
 * Throws `HabitRecordsError` on non-OK response.
 * Throws `NetworkError` on network failures.
 */
export async function fetchHabitRecords(
  habitId: string,
  params: FetchHabitRecordsParams = {},
): Promise<HabitRecordsResponse> {
  const { perPage = 20 } = params;
  let response: Response;

  try {
    response = await fetch(
      `${API_BASE}/api/v1/habits/${encodeURIComponent(habitId)}/records?perPage=${perPage}`,
      { signal: AbortSignal.timeout(10_000) },
    );
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new NetworkError('网络连接异常，请稍后重试');
    }
    throw new NetworkError('网络连接异常，请稍后重试');
  }

  if (!response.ok) {
    throw new HabitRecordsError('获取打卡记录失败');
  }

  return response.json();
}
