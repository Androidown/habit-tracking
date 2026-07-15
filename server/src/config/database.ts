/**
 * 数据库配置与初始化
 *
 * 使用 SQLite（better-sqlite3）作为本地存储引擎。
 * 在测试环境中使用内存数据库，生产环境使用文件数据库。
 */

import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/habits.db');

let db: Database.Database | null = null;

/**
 * 获取数据库实例，如果尚未初始化则创建连接并执行迁移。
 */
export function getDatabase(): Database.Database {
  if (db) return db;

  const isTest = process.env.NODE_ENV === 'test';
  db = new Database(isTest ? ':memory:' : DB_PATH);

  // 启用 WAL 模式提升并发性能
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  runMigrations(db);
  return db;
}

/**
 * 执行数据库迁移。
 */
function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS habits (
      id            TEXT PRIMARY KEY,
      user_id       TEXT NOT NULL,
      name          TEXT NOT NULL,
      description   TEXT,
      cycle_expression TEXT NOT NULL,
      is_active     INTEGER NOT NULL DEFAULT 1,
      deleted_at    TEXT,
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_habits_user_id ON habits(user_id);
    CREATE INDEX IF NOT EXISTS idx_habits_user_active ON habits(user_id, deleted_at);
  `);
}

/**
 * 关闭数据库连接（主要用于测试清理）。
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
