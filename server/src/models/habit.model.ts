/**
 * 习惯数据模型
 *
 * 提供习惯记录的数据库操作。
 */
import Database from 'better-sqlite3';

export interface HabitRow {
  id: string;
  user_id: string;
  name: string;
  description: string;
  status: string; // 'active' | 'inactive'
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ListHabitsParams {
  userId: string;
  status: 'active' | 'all' | 'archived';
  page: number;
  pageSize: number;
}

export interface ListHabitsResult {
  items: HabitRow[];
  total: number;
}

export class HabitModel {
  constructor(private db: Database.Database) {}

  /**
   * 根据 ID 查询习惯。
   */
  findById(id: string): HabitRow | null {
    const row = this.db
      .prepare('SELECT * FROM habits WHERE id = ?')
      .get(id) as HabitRow | undefined;
    return row || null;
  }

  /**
   * 根据 ID 和用户 ID 查询习惯。
   */
  findByIdAndUser(id: string, userId: string): HabitRow | null {
    const row = this.db
      .prepare('SELECT * FROM habits WHERE id = ? AND user_id = ?')
      .get(id, userId) as HabitRow | undefined;
    return row || null;
  }

  /**
   * 查询习惯列表（支持分页、状态筛选、软删除过滤）。
   *
   * 查询逻辑：
   *   - status=active（默认）：仅返回启用状态且未软删除的记录
   *   - status=all：返回所有未软删除的记录（含启用和停用）
   *   - status=archived：仅返回已软删除的记录
   *   - 始终按 created_at DESC 排序
   */
  list(params: ListHabitsParams): ListHabitsResult {
    const { userId, status, page, pageSize } = params;
    const offset = (page - 1) * pageSize;

    let whereClause = 'WHERE user_id = ?';
    const queryParams: (string | number)[] = [userId];

    switch (status) {
      case 'active':
        whereClause += ' AND deleted_at IS NULL AND status = ?';
        queryParams.push('active');
        break;
      case 'all':
        whereClause += ' AND deleted_at IS NULL';
        break;
      case 'archived':
        whereClause += ' AND deleted_at IS NOT NULL';
        break;
    }

    // 查询总数
    const countRow = this.db
      .prepare(`SELECT COUNT(*) as count FROM habits ${whereClause}`)
      .get(...queryParams) as { count: number };
    const total = countRow.count;

    // 查询数据（默认按 created_at DESC 排序）
    const items = this.db
      .prepare(
        `SELECT * FROM habits ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .all(...queryParams, pageSize, offset) as HabitRow[];

    return { items, total };
  }
}
