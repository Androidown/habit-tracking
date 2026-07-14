import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import EmptyRecords from '../EmptyRecords';

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */

describe('EmptyRecords', () => {
  it('renders the empty state text', () => {
    render(<EmptyRecords />);

    expect(screen.getByText('还没有打卡记录')).toBeInTheDocument();
  });

  it('renders an illustration SVG', () => {
    const { container } = render(<EmptyRecords />);

    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('has aria-hidden illustration', () => {
    const { container } = render(<EmptyRecords />);

    const illustration = container.querySelector('.empty-records__illustration');
    expect(illustration).toHaveAttribute('aria-hidden', 'true');
  });
});
