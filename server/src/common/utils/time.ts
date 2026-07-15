/**
 * 时区工具函数 — 基于 UTC+8（北京时间）
 *
 * 注意：Prisma 查询使用的是 UTC 时间，所有 Date 对象在存储和比较时均为 UTC。
 * 本工具将"UTC+8 自然周/天"的边界转换为对应的 UTC 时间戳用于数据库查询。
 */

/** UTC+8 时区偏移（毫秒） */
const TZ_OFFSET_MS = 8 * 60 * 60 * 1000;

/** 一天的毫秒数 */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 获取 UTC+8 当前时间的 Date 对象
 * 返回的是 UTC 时间，但数值上等于 UTC+8 的本地时间
 * 例如：UTC+8 时间 2026-07-14 10:00 → 返回 new Date('2026-07-14T02:00:00Z')（UTC 存储值）
 */
export function nowInUTC8(): Date {
  const now = new Date();
  // 将当前 UTC 时间加上 UTC+8 偏移，得到一个"数值上等于 UTC+8 时间"的 UTC Date
  return new Date(now.getTime() + TZ_OFFSET_MS);
}

/**
 * 将"UTC+8 本地日期"转换为真实的 UTC Date 用于数据库查询
 * 例如：UTC+8 日期 2026-07-14 → 返回 new Date('2026-07-13T16:00:00Z')
 */
export function utc8DateToUtc(year: number, month: number, day: number): Date {
  // 构建一个 UTC+8 的本地 Date（不带时区信息）
  const local = new Date(year, month, day);
  // 减去偏移得到真实 UTC
  return new Date(local.getTime() - TZ_OFFSET_MS);
}

/**
 * 获取当前 UTC+8 周一的 00:00:00（UTC 时间）
 * 自然周定义：周一（1）~ 周日（7），参考时区：UTC+8
 */
export function getWeekStartUTC(): Date {
  const now = new Date();
  // 转换到 UTC+8 的数值时间
  const utc8Now = now.getTime() + TZ_OFFSET_MS;
  const utc8Date = new Date(utc8Now);

  const dayOfWeek = utc8Date.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  // 转换为周一=0, 周二=1, ..., 周日=6
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  // 计算周一 00:00:00 UTC+8 的数值时间
  const mondayStartUTC8 =
    utc8Now - daysSinceMonday * DAY_MS - // 减去天数
    (utc8Date.getUTCHours() * 3600000 +
      utc8Date.getUTCMinutes() * 60000 +
      utc8Date.getUTCSeconds() * 1000 +
      utc8Date.getUTCMilliseconds()); // 减去当天已过时间

  // 转换为真实 UTC
  return new Date(mondayStartUTC8 - TZ_OFFSET_MS);
}

/**
 * 获取当前 UTC+8 周日的 23:59:59.999（UTC 时间）
 */
export function getWeekEndUTC(): Date {
  const weekStart = getWeekStartUTC();
  // 周一 00:00 UTC → 下周一 00:00 UTC = 7 天 → 周日 23:59:59.999 = 减去 1ms
  const mondayNext = new Date(weekStart.getTime() + 7 * DAY_MS);
  return new Date(mondayNext.getTime() - 1);
}

/**
 * 获取今天 00:00:00 UTC+8 对应的 UTC 时间
 */
export function getTodayStartUTC(): Date {
  const now = new Date();
  const utc8Now = now.getTime() + TZ_OFFSET_MS;
  const utc8Date = new Date(utc8Now);

  const todayStartUTC8 =
    utc8Now -
    (utc8Date.getUTCHours() * 3600000 +
      utc8Date.getUTCMinutes() * 60000 +
      utc8Date.getUTCSeconds() * 1000 +
      utc8Date.getUTCMilliseconds());

  return new Date(todayStartUTC8 - TZ_OFFSET_MS);
}

/**
 * 获取今天 23:59:59.999 UTC+8 对应的 UTC 时间
 */
export function getTodayEndUTC(): Date {
  const todayStart = getTodayStartUTC();
  return new Date(todayStart.getTime() + DAY_MS - 1);
}
