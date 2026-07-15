import { useState, useEffect, useCallback } from 'react';
import RecordItem from './RecordItem';
import EmptyRecords from './EmptyRecords';
import { fetchHabitRecords, NetworkError } from '../../services/habitRecords';
import type { HabitRecord } from '../../services/habitRecords';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface RecentRecordsListProps {
  /** 习惯 ID */
  habitId: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

/**
 * 最近打卡记录列表
 * - 自动请求 API 获取最近记录
 * - 加载中：显示旋转加载指示器
 * - 空态：显示 EmptyRecords 组件
 * - 错误：显示错误提示与重试按钮
 */
export default function RecentRecordsList({ habitId }: RecentRecordsListProps) {
  const [records, setRecords] = useState<HabitRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await fetchHabitRecords(habitId, { perPage: 20 });
      setRecords(data.records);
    } catch (err: unknown) {
      if (err instanceof NetworkError) {
        setError(err.message);
      } else {
        setError('获取打卡记录失败，请稍后重试');
      }
    } finally {
      setLoading(false);
    }
  }, [habitId]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  /* ---------- 加载中 ---------- */

  if (loading) {
    return (
      <div className="recent-records">
        <h3 className="recent-records__title">最近打卡记录</h3>
        <div className="recent-records__loading" role="status">
          <span className="spinner" aria-hidden="true" />
          <span className="recent-records__loading-text">加载中…</span>
        </div>
      </div>
    );
  }

  /* ---------- 错误 ---------- */

  if (error) {
    return (
      <div className="recent-records">
        <h3 className="recent-records__title">最近打卡记录</h3>
        <div className="recent-records__error">
          <p className="recent-records__error-text">{error}</p>
          <button
            type="button"
            className="recent-records__retry-btn"
            onClick={loadRecords}
          >
            重新加载
          </button>
        </div>
      </div>
    );
  }

  /* ---------- 空态 ---------- */

  if (records.length === 0) {
    return (
      <div className="recent-records">
        <h3 className="recent-records__title">最近打卡记录</h3>
        <EmptyRecords />
      </div>
    );
  }

  /* ---------- 列表 ---------- */

  return (
    <div className="recent-records">
      <h3 className="recent-records__title">最近打卡记录</h3>
      <div className="recent-records__list">
        {records.map((record) => (
          <RecordItem key={record.id} record={record} />
        ))}
      </div>
    </div>
  );
}
