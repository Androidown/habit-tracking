/**
 * 习惯数据模型
 *
 * 提供习惯记录的数据库操作。
 */
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

export interface HabitRow {
  id: string;
  user_id: string;
  name: string;
  description: string;
  status: string; // 'active' | 'deleted'
  created_at: string;
  updated_at: string;
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
   * 创建一条习惯记录。
   */
  create(userId: string, name: string, description: string): HabitRow {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO habits (id, user_id, name, description, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'active', ?, ?)`,
      )
      .run(id, userId, name || '', description || '', now, now);

    return {
      id,
      user_id: userId,
      name,
      description: description || '',
      status: 'active',
      created_at: now,
      updated_at: now,
    };
  }
}
