/**
 * 打卡记录数据模型
 *
 * 提供打卡记录的数据库操作。
 */
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

export interface CheckinRow {
  id: string;
  habit_id: string;
  user_id: string;
  checkin_date: string; // YYYY-MM-DD
  created_at: string;
}

export class CheckinModel {
  constructor(private db: Database.Database) {}

  /**
   * 查询某用户在某天对某习惯的打卡记录。
   */
  findOne(habitId: string, userId: string, date: string): CheckinRow | null {
    const row = this.db
      .prepare(
        'SELECT * FROM checkins WHERE habit_id = ? AND user_id = ? AND checkin_date = ?',
      )
      .get(habitId, userId, date) as CheckinRow | undefined;
    return row || null;
  }

  /**
   * 创建一条打卡记录。
   */
  create(habitId: string, userId: string, date: string): CheckinRow {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO checkins (id, habit_id, user_id, checkin_date, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(id, habitId, userId, date, now);

    return {
      id,
      habit_id: habitId,
      user_id: userId,
      checkin_date: date,
      created_at: now,
    };
  }
}
