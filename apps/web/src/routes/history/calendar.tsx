/**
 * 打卡日历页面路由
 *
 * 通过 URL 参数 `?yearMonth=2026-07` 控制当前显示的月份，
 * 实现 URL 与月份状态的双向绑定。
 *
 * @module routes/history/calendar
 */

import { useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  useCalendarMonth,
  isValidYearMonth,
  getCurrentYearMonth,
  type UseCalendarMonthReturn,
} from '@habit-tracking/core';

// ---------------------------------------------------------------------------
// 日历网格状态标识的颜色映射
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  completed: '#22c55e',   // 绿色 - 已打卡
  missed: '#e5e7eb',      // 灰色 - 未打卡
  not_required: '#d1d5db', // 淡化 - 无需执行
};

// ---------------------------------------------------------------------------
// 组件
// ---------------------------------------------------------------------------

/**
 * 打卡日历页面
 *
 * 路由参数：
 * - `:habitId` — 习惯 ID
 *
 * URL 查询参数：
 * - `yearMonth` — 当前月份，格式 yyyy-MM（可选，默认为当月）
 */
export function CalendarPage() {
  const { habitId } = useParams<{ habitId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlYearMonth = searchParams.get('yearMonth');

  // 当月份切换时同步到 URL（使用 replaceState 避免增加历史栈噪音）
  const handleMonthChange = useCallback(
    (yearMonth: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('yearMonth', yearMonth);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const calendar = useCalendarMonth(habitId ?? '', {
    urlMonth: urlYearMonth,
    onMonthChange: handleMonthChange,
  });

  // 无效 habitId
  if (!habitId) {
    return (
      <div style={{ padding: '24px', color: '#ef4444' }}>
        <h2>参数错误</h2>
        <p>缺少习惯标识，请从习惯列表页进入。</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '16px', maxWidth: '480px', margin: '0 auto' }}>
      <CalendarHeader calendar={calendar} />
      <CalendarBody calendar={calendar} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 日历头部：月份切换导航
// ---------------------------------------------------------------------------

function CalendarHeader({ calendar }: { calendar: UseCalendarMonthReturn }) {
  const { currentMonth, goToPrevMonth, goToNextMonth, goToToday } = calendar;

  // 格式化显示：2026-07 → 2026年7月
  const [year, month] = currentMonth.split('-');
  const displayLabel = `${year}年${parseInt(month, 10)}月`;

  const isCurrentMonth = currentMonth === getCurrentYearMonth();

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '20px',
      }}
    >
      <button
        onClick={goToPrevMonth}
        aria-label="上一个月"
        style={navButtonStyle}
      >
        ‹
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
          {displayLabel}
        </h2>
        {!isCurrentMonth && (
          <button
            onClick={goToToday}
            style={{
              ...smallButtonStyle,
              fontSize: '12px',
              padding: '2px 8px',
            }}
          >
            今天
          </button>
        )}
      </div>

      <button
        onClick={goToNextMonth}
        aria-label="下一个月"
        style={navButtonStyle}
      >
        ›
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 日历主体：展示加载/错误/数据
// ---------------------------------------------------------------------------

function CalendarBody({ calendar }: { calendar: UseCalendarMonthReturn }) {
  const { monthData, loading, error, retry } = calendar;

  // 加载中
  if (loading) {
    return <CalendarSkeleton />;
  }

  // 错误状态
  if (error) {
    return <CalendarError message={error} onRetry={retry} />;
  }

  // 无数据
  if (!monthData || monthData.days.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', color: '#6b7280' }}>
        <p>暂无打卡数据</p>
      </div>
    );
  }

  return <CalendarGrid days={monthData.days} summary={monthData.summary} />;
}

// ---------------------------------------------------------------------------
// 骨架屏
// ---------------------------------------------------------------------------

function CalendarSkeleton() {
  return (
    <div style={{ padding: '20px 0' }} aria-label="加载中">
      {/* 星期行骨架 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: '4px',
          marginBottom: '8px',
        }}
      >
        {['一', '二', '三', '四', '五', '六', '日'].map((d) => (
          <div
            key={d}
            style={{
              textAlign: 'center',
              padding: '4px',
              fontSize: '12px',
              color: '#9ca3af',
            }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* 日期骨架 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: '4px',
        }}
      >
        {Array.from({ length: 35 }).map((_, i) => (
          <div
            key={i}
            style={{
              aspectRatio: '1',
              borderRadius: '8px',
              backgroundColor: '#f3f4f6',
              animation: 'pulse 1.5s infinite',
            }}
          />
        ))}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 错误提示
// ---------------------------------------------------------------------------

function CalendarError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '40px 16px',
        color: '#6b7280',
      }}
    >
      <p style={{ color: '#ef4444', marginBottom: '16px' }}>{message}</p>
      <button onClick={onRetry} style={retryButtonStyle}>
        重新加载
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 日历网格
// ---------------------------------------------------------------------------

function CalendarGrid({
  days,
  summary,
}: {
  days: { date: string; status: string }[];
  summary: { total: number; completed: number; missed: number };
}) {
  // 计算当月第一天是星期几（0=日，1=一，...，6=六）
  const firstDay = new Date(days[0].date);
  const startDayOfWeek = firstDay.getDay(); // 0=Sunday
  // 调整为周一为一周开始：周一=0，周日=6
  const offset = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;

  // 计算当月天数
  const daysInMonth = days.length;

  return (
    <div>
      {/* 星期行 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: '4px',
          marginBottom: '8px',
        }}
      >
        {['一', '二', '三', '四', '五', '六', '日'].map((d) => (
          <div
            key={d}
            style={{
              textAlign: 'center',
              padding: '4px',
              fontSize: '12px',
              color: '#9ca3af',
              fontWeight: 600,
            }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* 日期网格 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: '4px',
        }}
      >
        {/* 月首空白填充 */}
        {Array.from({ length: offset }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}

        {/* 每日格子 */}
        {days.map((day) => {
          const dayNum = new Date(day.date).getDate();
          return (
            <div
              key={day.date}
              style={{
                aspectRatio: '1',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '8px',
                backgroundColor: STATUS_COLORS[day.status] || '#f9fafb',
                fontSize: '14px',
                fontWeight: 500,
                color: day.status === 'completed' ? '#fff' : '#374151',
                cursor: 'pointer',
                transition: 'opacity 0.2s',
              }}
              title={day.date}
            >
              {dayNum}
            </div>
          );
        })}
      </div>

      {/* 汇总 */}
      <CalendarSummary summary={summary} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 月度汇总
// ---------------------------------------------------------------------------

function CalendarSummary({
  summary,
}: {
  summary: { total: number; completed: number; missed: number };
}) {
  const completionRate =
    summary.total > 0
      ? Math.round((summary.completed / summary.total) * 100)
      : 0;

  return (
    <div
      style={{
        marginTop: '20px',
        padding: '12px 16px',
        backgroundColor: '#f9fafb',
        borderRadius: '8px',
        fontSize: '13px',
        color: '#6b7280',
        display: 'flex',
        justifyContent: 'space-between',
      }}
    >
      <span>完成率 {completionRate}%</span>
      <span>
        已完成 {summary.completed}/{summary.total} 天
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 样式
// ---------------------------------------------------------------------------

const navButtonStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  padding: '8px 16px',
  fontSize: '20px',
  cursor: 'pointer',
  lineHeight: 1,
  color: '#374151',
};

const smallButtonStyle: React.CSSProperties = {
  background: '#f3f4f6',
  border: '1px solid #e5e7eb',
  borderRadius: '6px',
  cursor: 'pointer',
  color: '#6b7280',
};

const retryButtonStyle: React.CSSProperties = {
  backgroundColor: '#3b82f6',
  color: '#fff',
  border: 'none',
  borderRadius: '8px',
  padding: '8px 24px',
  fontSize: '14px',
  cursor: 'pointer',
};
