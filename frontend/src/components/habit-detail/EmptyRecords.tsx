/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

/**
 * 空态占位组件
 * - 当习惯无打卡记录时展示
 * - 文案「还没有打卡记录」+ 占位插图
 */
export default function EmptyRecords() {
  return (
    <div className="empty-records">
      <div className="empty-records__illustration" aria-hidden="true">
        {/* 占位插图 — 后续版本可替换为实际 SVG */}
        <svg
          width="120"
          height="120"
          viewBox="0 0 120 120"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect
            x="20"
            y="30"
            width="80"
            height="60"
            rx="8"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
          />
          <path
            d="M45 55 L55 65 L75 45"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="60" cy="80" r="3" fill="currentColor" />
          <line
            x1="30"
            y1="50"
            x2="40"
            y2="50"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <line
            x1="30"
            y1="60"
            x2="38"
            y2="60"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <p className="empty-records__text">还没有打卡记录</p>
    </div>
  );
}
