import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RecordItem from '../RecordItem';
import type { HabitRecord } from '../../../services/habitRecords';

/* ------------------------------------------------------------------ */
/*  Test data                                                         */
/* ------------------------------------------------------------------ */

const completedRecord: HabitRecord = {
  id: 'rec-1',
  habit_id: 'habit-1',
  completed_at: '2026-07-14T08:30:00Z',
  status: 'completed',
  created_at: '2026-07-14T08:30:00Z',
};

const cancelledRecord: HabitRecord = {
  id: 'rec-2',
  habit_id: 'habit-1',
  completed_at: '2026-07-13T19:00:00Z',
  status: 'cancelled',
  created_at: '2026-07-13T19:00:00Z',
};

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */

describe('RecordItem', () => {
  it('renders completedAt time in local format', () => {
    render(<RecordItem record={completedRecord} />);

    // 2026-07-14T08:30:00Z in UTC+0 = 16:30 in UTC+8
    expect(screen.getByText(/2026-07-14/)).toBeInTheDocument();
  });

  it('renders "已完成" status badge for completed records', () => {
    render(<RecordItem record={completedRecord} />);

    expect(screen.getByText('已完成')).toBeInTheDocument();
  });

  it('renders "已取消" status badge for cancelled records', () => {
    render(<RecordItem record={cancelledRecord} />);

    expect(screen.getByText('已取消')).toBeInTheDocument();
  });

  it('applies cancelled class for cancelled records', () => {
    const { container } = render(<RecordItem record={cancelledRecord} />);

    expect(container.firstChild).toHaveClass('record-item--cancelled');
  });

  it('does not apply cancelled class for completed records', () => {
    const { container } = render(<RecordItem record={completedRecord} />);

    expect(container.firstChild).not.toHaveClass('record-item--cancelled');
  });

  it('triggers highlight feedback on click', async () => {
    const user = userEvent.setup();
    const { container } = render(<RecordItem record={completedRecord} />);
    const btn = container.querySelector('button')!;

    await user.click(btn);
    await waitFor(() => {
      expect(btn).toHaveClass('record-item--highlighted');
    });
  });

  it('is a button element for accessibility', () => {
    render(<RecordItem record={completedRecord} />);

    expect(screen.getByRole('button')).toBeInTheDocument();
  });
});
