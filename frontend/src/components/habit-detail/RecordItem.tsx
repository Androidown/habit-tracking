import { useCallback, useState, type MouseEvent } from 'react';
import type { HabitRecord } from '../../services/habitRecords';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface RecordItemProps {
  record: HabitRecord;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Format ISO datetime string to local time display.
 * Example: "2026-07-14 08:30"
 */
function formatLocalTime(isoString: string): string {
  const date = new Date(isoString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

/**
 * 单条打卡记录项
 * - 展示打卡时间（本地格式化）与状态标识
 * - 点击高亮反馈，暂不作跳转
 */
export default function RecordItem({ record }: RecordItemProps) {
  const [highlighted, setHighlighted] = useState(false);

  const isCompleted = record.status === 'completed';

  const handleClick = useCallback((_e: MouseEvent) => {
    setHighlighted(true);
    // 短暂高亮反馈后恢复
    setTimeout(() => setHighlighted(false), 300);
  }, []);

  return (
    <button
      type="button"
      className={`record-item${highlighted ? ' record-item--highlighted' : ''}${isCompleted ? '' : ' record-item--cancelled'}`}
      onClick={handleClick}
      disabled={false}
    >
      <span className="record-item__time">
        {formatLocalTime(record.completed_at)}
      </span>
      <span className={`record-item__status record-item__status--${isCompleted ? 'completed' : 'cancelled'}`}>
        {isCompleted ? '已完成' : '已取消'}
      </span>
    </button>
  );
}
