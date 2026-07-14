/**
 * 数据库初始化与迁移管理
 *
 * 使用 better-sqlite3 管理 SQLite 数据库连接，
 * 并在首次启动时自动执行 schema 迁移。
 */

import Database from 'better-sqlite3';
import path from 'path';

// ---------------------------------------------------------------------------
// Schema 迁移定义
// ---------------------------------------------------------------------------

const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,

  `CREATE TABLE IF NOT EXISTS habits (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    schedule_expr TEXT NOT NULL DEFAULT 'daily',
    status TEXT NOT NULL DEFAULT 'active',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,

  `CREATE TABLE IF NOT EXISTS checkins (
    id TEXT PRIMARY KEY,
    habit_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    checkin_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'completed',
    completed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (habit_id) REFERENCES habits(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,

  `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_habits_user_id ON habits(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_checkins_user_date ON checkins(user_id, checkin_date)`,
  `CREATE INDEX IF NOT EXISTS idx_checkins_completed_at ON checkins(completed_at)`,
];

// ---------------------------------------------------------------------------
// 数据库连接管理
// ---------------------------------------------------------------------------

let db: Database.Database | null = null;

/**
 * 获取数据库实例（单例）
 * 首次调用时自动连接并执行迁移
 */
export function getDatabase(): Database.Database {
  if (db) return db;

  const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../../../data/habit-tracking.db');
  db = new Database(dbPath);

  // 开启 WAL 模式提升并发性能
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // 执行迁移
  runMigrations(db);

  return db;
}

/**
 * 创建内存数据库（用于测试）
 */
export function createTestDatabase(): Database.Database {
  const testDb = new Database(':memory:');
  testDb.pragma('foreign_keys = ON');

  for (const sql of MIGRATIONS) {
    testDb.exec(sql);
  }

  return testDb;
}

/**
 * 关闭数据库连接
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// ---------------------------------------------------------------------------
// 迁移执行
// ---------------------------------------------------------------------------

function runMigrations(database: Database.Database): void {
  for (const sql of MIGRATIONS) {
    database.exec(sql);
  }
}
