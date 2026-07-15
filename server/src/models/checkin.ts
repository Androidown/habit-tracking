/**
 * 打卡记录数据模型
 *
 * 对应数据库中的 checkins 表，每条记录代表一次习惯打卡。
 */

import Database from 'better-sqlite3';

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

export type CheckinStatus = 'completed' | 'cancelled';

/**
 * 打卡记录（对应 checkins 表）
 */
export interface Checkin {
  id: string;
  habit_id: string;
  user_id: string;
  checkin_date: string;
  status: CheckinStatus;
  completed_at: string;
  created_at: string;
}

/**
 * 带习惯名称的打卡记录（用于列表查询 JOIN 结果）
 */
export interface CheckinWithHabitName extends Checkin {
  habit_name: string;
}

/**
 * 分页查询参数
 */
export interface CheckinListParams {
  page: number;
  perPage: number;
  habitName?: string;
}

/**
 * 分页查询结果
 */
export interface PaginatedCheckins {
  records: CheckinWithHabitName[];
  pagination: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
}

// ---------------------------------------------------------------------------
// 模型
// ---------------------------------------------------------------------------

export class CheckinModel {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * 分页查询用户的打卡记录，支持按习惯名称模糊搜索
   *
   * 通过 JOIN habits 表获取习惯名称，并按 completed_at 降序排列
   */
  listByUserID(userId: string, params: CheckinListParams): PaginatedCheckins {
    const { page, perPage, habitName } = params;

    // 构建 WHERE 条件
    const whereClauses: string[] = ['c.user_id = ?'];
    const bindings: unknown[] = [userId];

    if (habitName) {
      whereClauses.push('h.name LIKE ?');
      bindings.push(`%${habitName}%`);
    }

    const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // 查询总数
    const countSql = `
      SELECT COUNT(*) as total
      FROM checkins c
      JOIN habits h ON c.habit_id = h.id
      ${whereSQL}
    `;
    const countResult = this.db.prepare(countSql).get(...bindings) as { total: number };
    const total = countResult.total;

    // 查询分页数据
    const offset = (page - 1) * perPage;
    const dataSql = `
      SELECT c.id, c.habit_id, c.user_id, c.checkin_date, c.status, c.completed_at, c.created_at,
             h.name as habit_name
      FROM checkins c
      JOIN habits h ON c.habit_id = h.id
      ${whereSQL}
      ORDER BY c.completed_at DESC
      LIMIT ? OFFSET ?
    `;
    const records = this.db
      .prepare(dataSql)
      .all(...bindings, perPage, offset) as CheckinWithHabitName[];

    return {
      records,
      pagination: {
        page,
        perPage,
        total,
        totalPages: Math.ceil(total / perPage) || 0,
      },
    };
  }
}
