/**
 * 用户数据模型
 */

import Database from 'better-sqlite3';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

export interface User {
  id: string;
  email: string;
  username: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// 模型
// ---------------------------------------------------------------------------

export class UserModel {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  findByEmail(email: string): User | undefined {
    const row = this.db
      .prepare('SELECT * FROM users WHERE email = ?')
      .get(email) as User | undefined;
    return row;
  }

  findById(id: string): User | undefined {
    const row = this.db
      .prepare('SELECT * FROM users WHERE id = ?')
      .get(id) as User | undefined;
    return row;
  }

  create(email: string, username: string, passwordHash: string): User {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    this.db
      .prepare(
        'INSERT INTO users (id, email, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(id, email, username, passwordHash, now, now);

    return { id, email, username, password_hash: passwordHash, created_at: now, updated_at: now };
  }
}
