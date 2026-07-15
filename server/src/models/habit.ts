/**
 * 习惯数据模型
 */

import Database from 'better-sqlite3';

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

export type HabitStatus = 'active' | 'deleted';

export interface Habit {
  id: string;
  user_id: string;
  name: string;
  schedule_expr: string;
  status: HabitStatus;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// 查询参数
// ---------------------------------------------------------------------------

export interface HabitQueryParams {
  nameKeyword?: string;
}

// ---------------------------------------------------------------------------
// 模型
// ---------------------------------------------------------------------------

export class HabitModel {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * 查找用户匹配条件的习惯（支持名称模糊搜索）
   */
  findByUserID(userId: string, params?: HabitQueryParams): Habit[] {
    let sql = 'SELECT * FROM habits WHERE user_id = ? AND status = ?';
    const bindings: unknown[] = [userId, 'active'];

    if (params?.nameKeyword) {
      sql += ' AND name LIKE ?';
      bindings.push(`%${params.nameKeyword}%`);
    }

    sql += ' ORDER BY created_at';

    return this.db.prepare(sql).all(...bindings) as Habit[];
  }

  findById(id: string): Habit | undefined {
    return this.db.prepare('SELECT * FROM habits WHERE id = ?').get(id) as Habit | undefined;
  }
}
