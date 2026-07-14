import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import RecentRecordsList from '../RecentRecordsList';

/* ------------------------------------------------------------------ */
/*  Mock habitRecords service                                         */
/* ------------------------------------------------------------------ */

const mockFetchHabitRecords = vi.fn<(...args: unknown[]) => Promise<unknown>>();

vi.mock('../../../services/habitRecords', () => ({
  fetchHabitRecords: (...args: unknown[]) => mockFetchHabitRecords(...args),
  NetworkError: class NetworkError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'NetworkError';
    }
  },
  HabitRecordsError: class HabitRecordsError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'HabitRecordsError';
    }
  },
}));

/* ------------------------------------------------------------------ */
/*  Test data                                                         */
/* ------------------------------------------------------------------ */

const sampleRecords = [
  {
    id: 'rec-1',
    habit_id: 'habit-1',
    completed_at: '2026-07-14T08:30:00Z',
    status: 'completed' as const,
    created_at: '2026-07-14T08:30:00Z',
  },
  {
    id: 'rec-2',
    habit_id: 'habit-1',
    completed_at: '2026-07-13T19:00:00Z',
    status: 'completed' as const,
    created_at: '2026-07-13T19:00:00Z',
  },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function renderList(habitId = 'habit-1') {
  return render(
    <MemoryRouter>
      <RecentRecordsList habitId={habitId} />
    </MemoryRouter>,
  );
}

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RecentRecordsList', () => {
  /* ---------- Loading ---------- */

  it('shows loading spinner on mount', () => {
    // Never resolve
    mockFetchHabitRecords.mockReturnValue(new Promise(() => {}));
    renderList();

    expect(screen.getByText('加载中…')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  /* ---------- Empty state ---------- */

  it('shows empty records placeholder when no records', async () => {
    mockFetchHabitRecords.mockResolvedValueOnce({ records: [], total: 0 });
    renderList();

    await waitFor(() => {
      expect(screen.getByText('还没有打卡记录')).toBeInTheDocument();
    });
  });

  /* ---------- List ---------- */

  it('renders record items from API response', async () => {
    mockFetchHabitRecords.mockResolvedValueOnce({
      records: sampleRecords,
      total: 2,
    });
    renderList();

    await waitFor(() => {
      expect(screen.getAllByText('已完成')).toHaveLength(2);
    });

    // Should render two record items
    const items = screen.getAllByRole('button');
    expect(items).toHaveLength(2);
  });

  it('passes habitId to the fetch call', async () => {
    mockFetchHabitRecords.mockResolvedValueOnce({ records: [], total: 0 });
    renderList('custom-habit-id');

    await waitFor(() => {
      expect(mockFetchHabitRecords).toHaveBeenCalledWith('custom-habit-id', {
        perPage: 20,
      });
    });
  });

  /* ---------- Error state ---------- */

  it('shows error message on network failure', async () => {
    const { NetworkError } = await import('../../../services/habitRecords');
    mockFetchHabitRecords.mockRejectedValueOnce(
      new NetworkError('网络连接异常，请稍后重试'),
    );
    renderList();

    await waitFor(() => {
      expect(screen.getByText('网络连接异常，请稍后重试')).toBeInTheDocument();
    });
  });

  it('shows generic error for API errors', async () => {
    mockFetchHabitRecords.mockRejectedValueOnce(new Error('server error'));
    renderList();

    await waitFor(() => {
      expect(
        screen.getByText('获取打卡记录失败，请稍后重试'),
      ).toBeInTheDocument();
    });
  });

  it('renders retry button on error', async () => {
    const user = userEvent.setup();
    const { NetworkError } = await import('../../../services/habitRecords');
    mockFetchHabitRecords
      .mockRejectedValueOnce(new NetworkError('网络连接异常，请稍后重试'))
      .mockResolvedValueOnce({ records: sampleRecords, total: 2 });

    renderList();

    // Wait for error to show
    await waitFor(() => {
      expect(screen.getByText('重新加载')).toBeInTheDocument();
    });

    // Click retry
    const retryBtn = screen.getByText('重新加载');
    await user.click(retryBtn);

    // Should now show records
    await waitFor(() => {
      expect(screen.getAllByText('已完成')).toHaveLength(2);
    });
  });

  /* ---------- Title ---------- */

  it('renders section title', () => {
    mockFetchHabitRecords.mockReturnValue(new Promise(() => {}));
    renderList();

    expect(screen.getByText('最近打卡记录')).toBeInTheDocument();
  });
});
