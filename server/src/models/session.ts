/**
 * 会话数据模型
 */

import Database from 'better-sqlite3';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

export interface Session {
  id: string;
  user_id: string;
  expires_at: string;
}

// ---------------------------------------------------------------------------
// 模型
// ---------------------------------------------------------------------------

export class SessionModel {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  create(userId: string, expiresAt: string): Session {
    const id = crypto.randomUUID();
    this.db
      .prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
      .run(id, userId, expiresAt);
    return { id, user_id: userId, expires_at: expiresAt };
  }

  findById(id: string): Session | undefined {
    return this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Session | undefined;
  }

  deleteExpired(): void {
    this.db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();
  }
}
