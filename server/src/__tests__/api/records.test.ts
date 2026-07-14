/**
 * 打卡记录列表查询 API 测试
 *
 * 验证：
 * 1. 正常分页查询返回正确结构与数据量
 * 2. habitName 搜索过滤返回匹配习惯的记录
 * 3. 无匹配关键词时返回空记录列表
 * 4. 第 2 页数据不包含第 1 页数据
 * 5. perPage 超出上限返回 400 错误
 * 6. 未登录用户返回 401
 * 7. 搜索关键词为空字符串时等价于不传
 */

import express, { Express } from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import crypto from 'crypto';
import { authMiddleware } from '../../middleware/auth';
import { RecordsController } from '../../controllers/records';
import { RecordService } from '../../services/record-service';

// ---------------------------------------------------------------------------
// 测试数据库辅助函数
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
];

function createTestDB(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  for (const sql of MIGRATIONS) {
    db.exec(sql);
  }
  return db;
}

function seedData(db: Database.Database, userId: string) {
  // 创建 3 个习惯
  const habit1Id = crypto.randomUUID();
  const habit2Id = crypto.randomUUID();
  const habit3Id = crypto.randomUUID();

  const now = new Date();

  db.prepare(
    'INSERT INTO habits (id, user_id, name, schedule_expr, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(habit1Id, userId, '晨跑', 'daily', 'active', now.toISOString(), now.toISOString());

  db.prepare(
    'INSERT INTO habits (id, user_id, name, schedule_expr, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(habit2Id, userId, '阅读', 'daily', 'active', now.toISOString(), now.toISOString());

  db.prepare(
    'INSERT INTO habits (id, user_id, name, schedule_expr, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(habit3Id, userId, '冥想', 'daily', 'active', now.toISOString(), now.toISOString());

  // 为 habit1（晨跑）创建 10 条打卡记录
  for (let i = 0; i < 10; i++) {
    const checkinId = crypto.randomUUID();
    const completedAt = new Date(now.getTime() - i * 86400000);
    db.prepare(
      'INSERT INTO checkins (id, habit_id, user_id, checkin_date, status, completed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(checkinId, habit1Id, userId, completedAt.toISOString().slice(0, 10), 'completed', completedAt.toISOString(), completedAt.toISOString());
  }

  // 为 habit2（阅读）创建 5 条打卡记录
  for (let i = 0; i < 5; i++) {
    const checkinId = crypto.randomUUID();
    const completedAt = new Date(now.getTime() - i * 86400000);
    db.prepare(
      'INSERT INTO checkins (id, habit_id, user_id, checkin_date, status, completed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(checkinId, habit2Id, userId, completedAt.toISOString().slice(0, 10), 'completed', completedAt.toISOString(), completedAt.toISOString());
  }

  // 为 habit3（冥想）创建 3 条打卡记录（其中 1 条已取消）
  for (let i = 0; i < 3; i++) {
    const checkinId = crypto.randomUUID();
    const completedAt = new Date(now.getTime() - i * 86400000);
    const status = i === 0 ? 'cancelled' : 'completed';
    db.prepare(
      'INSERT INTO checkins (id, habit_id, user_id, checkin_date, status, completed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(checkinId, habit3Id, userId, completedAt.toISOString().slice(0, 10), status, completedAt.toISOString(), completedAt.toISOString());
  }
}

function createSession(db: Database.Database, userId: string): string {
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 86400000).toISOString();
  db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run(
    sessionId,
    userId,
    expiresAt,
  );
  return sessionId;
}

// ---------------------------------------------------------------------------
// 测试设置
// ---------------------------------------------------------------------------

function createTestApp(db: Database.Database): Express {
  const app = express();
  app.use(express.json());

  const recordService = new RecordService(db);
  const controller = new RecordsController(recordService);

  app.get('/api/v1/records', authMiddleware(db), controller.list);

  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/v1/records', () => {
  let db: Database.Database;
  let userId: string;
  let sessionId: string;

  beforeAll(() => {
    db = createTestDB();
    userId = crypto.randomUUID();

    db.prepare(
      'INSERT INTO users (id, email, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(userId, 'test@example.com', 'testuser', 'hash', new Date().toISOString(), new Date().toISOString());

    sessionId = createSession(db, userId);
    seedData(db, userId);
  });

  afterAll(() => {
    db.close();
  });

  // -----------------------------------------------------------------------
  // 1. 正常分页查询
  // -----------------------------------------------------------------------

  it('should return paginated records with correct structure', async () => {
    const app = createTestApp(db);

    const res = await request(app)
      .get('/api/v1/records')
      .set('Cookie', `session_id=${sessionId}`)
      .expect(200);

    expect(res.body.code).toBe(0);
    expect(res.body.message).toBe('ok');

    const data = res.body.data;
    expect(data).toBeDefined();

    // 验证 records 结构
    expect(Array.isArray(data.records)).toBe(true);
    expect(data.records.length).toBeLessThanOrEqual(20);

    if (data.records.length > 0) {
      const record = data.records[0];
      expect(record).toHaveProperty('id');
      expect(record).toHaveProperty('habit_id');
      expect(record).toHaveProperty('habit_name');
      expect(record).toHaveProperty('completed_at');
      expect(record).toHaveProperty('status');
      expect(['completed', 'cancelled']).toContain(record.status);
    }

    // 验证 pagination 结构
    expect(data.pagination).toHaveProperty('page');
    expect(data.pagination).toHaveProperty('perPage');
    expect(data.pagination).toHaveProperty('total');
    expect(data.pagination).toHaveProperty('totalPages');
    expect(data.pagination.page).toBe(1);
    expect(data.pagination.perPage).toBe(20);
    expect(data.pagination.total).toBe(18); // 10 + 5 + 3
  });

  // -----------------------------------------------------------------------
  // 2. habitName 搜索过滤
  // -----------------------------------------------------------------------

  it('should filter records by habit name keyword', async () => {
    const app = createTestApp(db);

    const res = await request(app)
      .get('/api/v1/records')
      .query({ habitName: '晨跑' })
      .set('Cookie', `session_id=${sessionId}`)
      .expect(200);

    expect(res.body.code).toBe(0);
    const data = res.body.data;
    expect(data.records.length).toBe(10);
    expect(data.pagination.total).toBe(10);

    for (const record of data.records) {
      expect(record.habit_name).toContain('晨跑');
    }
  });

  it('should filter records by partial habit name', async () => {
    const app = createTestApp(db);

    const res = await request(app)
      .get('/api/v1/records')
      .query({ habitName: '跑' })
      .set('Cookie', `session_id=${sessionId}`)
      .expect(200);

    expect(res.body.code).toBe(0);
    const data = res.body.data;
    expect(data.pagination.total).toBe(10);
    for (const record of data.records) {
      expect(record.habit_name).toContain('跑');
    }
  });

  // -----------------------------------------------------------------------
  // 3. 无匹配关键词时返回空记录列表
  // -----------------------------------------------------------------------

  it('should return empty records for non-matching keyword', async () => {
    const app = createTestApp(db);

    const res = await request(app)
      .get('/api/v1/records')
      .query({ habitName: '不存在的习惯' })
      .set('Cookie', `session_id=${sessionId}`)
      .expect(200);

    expect(res.body.code).toBe(0);
    const data = res.body.data;
    expect(data.records).toEqual([]);
    expect(data.pagination.total).toBe(0);
    expect(data.pagination.totalPages).toBe(0);
  });

  // -----------------------------------------------------------------------
  // 4. 第 2 页数据不包含第 1 页数据
  // -----------------------------------------------------------------------

  it('should return different data on page 2', async () => {
    const app = createTestApp(db);

    const res1 = await request(app)
      .get('/api/v1/records')
      .query({ perPage: '5', page: '1' })
      .set('Cookie', `session_id=${sessionId}`)
      .expect(200);

    expect(res1.body.data.records.length).toBe(5);
    const page1Ids = res1.body.data.records.map((r: { id: string }) => r.id);

    const res2 = await request(app)
      .get('/api/v1/records')
      .query({ perPage: '5', page: '2' })
      .set('Cookie', `session_id=${sessionId}`)
      .expect(200);

    expect(res2.body.data.records.length).toBe(5);
    const page2Ids = res2.body.data.records.map((r: { id: string }) => r.id);

    const overlap = page1Ids.filter((id: string) => page2Ids.includes(id));
    expect(overlap).toEqual([]);

    expect(res1.body.data.pagination.page).toBe(1);
    expect(res2.body.data.pagination.page).toBe(2);
    expect(res1.body.data.pagination.total).toBe(18);
    expect(res1.body.data.pagination.totalPages).toBe(4); // 18/5=3.6 → 4
  });

  // -----------------------------------------------------------------------
  // 5. perPage 超出上限返回 400
  // -----------------------------------------------------------------------

  it('should return 400 when perPage exceeds max', async () => {
    const app = createTestApp(db);

    const res = await request(app)
      .get('/api/v1/records')
      .query({ perPage: '200' })
      .set('Cookie', `session_id=${sessionId}`)
      .expect(400);

    expect(res.body.code).toBe(1001);
    expect(res.body.message).toBe('VALIDATION_ERROR');
    expect(res.body.data).toBeDefined();
  });

  it('should return 400 when perPage is negative', async () => {
    const app = createTestApp(db);

    const res = await request(app)
      .get('/api/v1/records')
      .query({ perPage: '-1' })
      .set('Cookie', `session_id=${sessionId}`)
      .expect(400);

    expect(res.body.code).toBe(1001);
  });

  it('should return 400 when page is less than 1', async () => {
    const app = createTestApp(db);

    const res = await request(app)
      .get('/api/v1/records')
      .query({ page: '0' })
      .set('Cookie', `session_id=${sessionId}`)
      .expect(400);

    expect(res.body.code).toBe(1001);
  });

  // -----------------------------------------------------------------------
  // 6. 未登录用户返回 401
  // -----------------------------------------------------------------------

  it('should return 401 without auth', async () => {
    const app = createTestApp(db);

    const res = await request(app)
      .get('/api/v1/records')
      .expect(401);

    expect(res.body.code).toBe(401);
    expect(res.body.message).toBe('AUTH_REQUIRED');
  });

  it('should return 401 with invalid session', async () => {
    const app = createTestApp(db);

    const res = await request(app)
      .get('/api/v1/records')
      .set('Cookie', 'session_id=invalid-session-id')
      .expect(401);

    expect(res.body.code).toBe(401);
  });

  it('should return 401 with expired session', async () => {
    const app = createTestApp(db);

    const expiredSessionId = crypto.randomUUID();
    const expiredAt = new Date(Date.now() - 86400000).toISOString();
    db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run(
      expiredSessionId,
      userId,
      expiredAt,
    );

    const res = await request(app)
      .get('/api/v1/records')
      .set('Cookie', `session_id=${expiredSessionId}`)
      .expect(401);

    expect(res.body.code).toBe(401);
    expect(res.body.message).toBe('SESSION_EXPIRED');
  });

  // -----------------------------------------------------------------------
  // 7. 搜索关键词为空字符串时等价于不传
  // -----------------------------------------------------------------------

  it('should treat empty habitName as no filter', async () => {
    const app = createTestApp(db);

    const res = await request(app)
      .get('/api/v1/records')
      .query({ habitName: '' })
      .set('Cookie', `session_id=${sessionId}`)
      .expect(200);

    expect(res.body.code).toBe(0);
    const data = res.body.data;
    expect(data.pagination.total).toBe(18);
  });

  it('should treat whitespace-only habitName as no filter', async () => {
    const app = createTestApp(db);

    const res = await request(app)
      .get('/api/v1/records')
      .query({ habitName: '   ' })
      .set('Cookie', `session_id=${sessionId}`)
      .expect(200);

    expect(res.body.code).toBe(0);
    const data = res.body.data;
    expect(data.pagination.total).toBe(18);
  });

  // -----------------------------------------------------------------------
  // 8. 排序：按 completedAt 降序
  // -----------------------------------------------------------------------

  it('should return records sorted by completedAt descending', async () => {
    const app = createTestApp(db);

    const res = await request(app)
      .get('/api/v1/records')
      .query({ perPage: '20' })
      .set('Cookie', `session_id=${sessionId}`)
      .expect(200);

    const records = res.body.data.records;
    const dates = records.map((r: { completed_at: string }) => new Date(r.completed_at).getTime());

    for (let i = 1; i < dates.length; i++) {
      expect(dates[i - 1]).toBeGreaterThanOrEqual(dates[i]);
    }
  });
});
