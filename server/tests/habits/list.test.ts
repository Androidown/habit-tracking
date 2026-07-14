/**
 * 习惯列表接口 — 集成测试
 *
 * 覆盖：
 *   - 正常分页返回习惯列表（多页场景）
 *   - status 参数筛选
 *   - 默认排序为创建时间倒序
 *   - page_size 超过 100 时返回 422
 *   - 空列表返回
 *   - 当前用户只能看到自己创建的习惯
 *   - 未认证请求返回 401
 */

import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { HabitModel } from '../../src/models/habit.model';
import { HabitService } from '../../src/services/habit.service';
import { HabitController } from '../../src/controllers/habit.controller';
import { AuthMiddleware } from '../../src/middleware/auth.middleware';
import { createHabitRoutes } from '../../src/routes/habit.routes';

/** 创建测试用内存数据库，包含完整 Schema。 */
function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      username TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS habits (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_habits_user_id ON habits(user_id);
  `);
  return db;
}

/** 创建测试 Express 应用，注入认证用户。 */
function createApp(db: Database.Database, options?: { autoAuth?: boolean; userId?: string }) {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  const habitModel = new HabitModel(db);
  const habitService = new HabitService(habitModel);
  const habitController = new HabitController(habitService);
  const authMiddleware = new AuthMiddleware(db);

  const router = createHabitRoutes(habitController, authMiddleware);

  // 注入认证用户（用于跳过实际 session 校验，专注测试业务逻辑）
  app.use('/api/v1/habits', (req, _res, next) => {
    if (options?.autoAuth && options.userId) {
      req.userId = options.userId;
    }
    next();
  });

  app.use('/api/v1/habits', router);

  return app;
}

/** 在测试数据库中创建一条用户记录 */
function createUser(db: Database.Database, id: string, username?: string): void {
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO users (id, email, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(id, `${username || id}@test.com`, username || `User${id}`, 'hash', now, now);
}

/** 在测试数据库中创建一条会话记录 */
function createSession(db: Database.Database, userId: string): string {
  const id = randomUUID();
  const future = new Date(Date.now() + 86400000).toISOString(); // 24h later
  db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run(id, userId, future);
  return id;
}

/** 在测试数据库中创建一条习惯记录 */
function createHabit(
  db: Database.Database,
  overrides?: {
    id?: string;
    user_id?: string;
    name?: string;
    status?: string;
    created_at?: string;
    deleted_at?: string | null;
  },
): string {
  const id = overrides?.id || randomUUID();
  const now = overrides?.created_at || new Date().toISOString();
  db.prepare(
    `INSERT INTO habits (id, user_id, name, description, status, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, '', ?, ?, ?, ?)`,
  ).run(
    id,
    overrides?.user_id || 'user-1',
    overrides?.name || 'Test Habit',
    overrides?.status || 'active',
    now,
    now,
    overrides?.deleted_at ?? null,
  );
  return id;
}

describe('GET /api/v1/habits (Integration)', () => {
  describe('认证', () => {
    it('should return 401 when no auth provided', async () => {
      const db = createTestDb();
      const app = createApp(db);

      const res = await request(app).get('/api/v1/habits');

      expect(res.status).toBe(401);
      expect(res.body.code).toBe(3001);
    });

    it('should return 401 when session cookie is invalid', async () => {
      const db = createTestDb();
      const app = createApp(db);

      const res = await request(app)
        .get('/api/v1/habits')
        .set('Cookie', ['session_id=invalid-session']);

      expect(res.status).toBe(401);
      expect(res.body.code).toBe(3001);
    });

    it('should return 200 with valid session cookie', async () => {
      const db = createTestDb();
      createUser(db, 'user-1');
      const sessionId = createSession(db, 'user-1');
      const app = createApp(db);

      const res = await request(app)
        .get('/api/v1/habits')
        .set('Cookie', [`session_id=${sessionId}`]);

      expect(res.status).toBe(200);
    });
  });

  describe('正常分页返回习惯列表', () => {
    it('should return paginated habits with default params', async () => {
      const db = createTestDb();
      createUser(db, 'user-1');
      const sessionId = createSession(db, 'user-1');

      // 创建 3 条习惯
      for (let i = 0; i < 3; i++) {
        createHabit(db, { user_id: 'user-1', name: `Habit ${i}` });
      }

      const app = createApp(db);

      const res = await request(app)
        .get('/api/v1/habits')
        .set('Cookie', [`session_id=${sessionId}`]);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.message).toBe('ok');
      expect(res.body.data.items).toHaveLength(3);
      expect(res.body.data.pagination).toEqual({
        page: 1,
        page_size: 20,
        total: 3,
        total_pages: 1,
      });
    });

    it('should paginate correctly across multiple pages', async () => {
      const db = createTestDb();
      createUser(db, 'user-1');
      const sessionId = createSession(db, 'user-1');

      // 创建 5 条习惯
      for (let i = 0; i < 5; i++) {
        createHabit(db, { user_id: 'user-1', name: `Habit ${i}` });
      }

      const app = createApp(db);

      // 第 1 页（page_size=2）
      const page1 = await request(app)
        .get('/api/v1/habits?page=1&page_size=2')
        .set('Cookie', [`session_id=${sessionId}`]);

      expect(page1.status).toBe(200);
      expect(page1.body.data.items).toHaveLength(2);
      expect(page1.body.data.pagination).toEqual({
        page: 1,
        page_size: 2,
        total: 5,
        total_pages: 3,
      });

      // 第 2 页（page_size=2）
      const page2 = await request(app)
        .get('/api/v1/habits?page=2&page_size=2')
        .set('Cookie', [`session_id=${sessionId}`]);

      expect(page2.status).toBe(200);
      expect(page2.body.data.items).toHaveLength(2);
      expect(page2.body.data.pagination.page).toBe(2);

      // 第 3 页（page_size=2）— 最后一条
      const page3 = await request(app)
        .get('/api/v1/habits?page=3&page_size=2')
        .set('Cookie', [`session_id=${sessionId}`]);

      expect(page3.status).toBe(200);
      expect(page3.body.data.items).toHaveLength(1);
      expect(page3.body.data.pagination.page).toBe(3);
      expect(page3.body.data.pagination.total_pages).toBe(3);
    });

    it('should return empty items for page beyond total pages', async () => {
      const db = createTestDb();
      createUser(db, 'user-1');
      const sessionId = createSession(db, 'user-1');

      createHabit(db, { user_id: 'user-1' });

      const app = createApp(db);

      const res = await request(app)
        .get('/api/v1/habits?page=100&page_size=20')
        .set('Cookie', [`session_id=${sessionId}`]);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(0);
      expect(res.body.data.pagination).toEqual({
        page: 100,
        page_size: 20,
        total: 1,
        total_pages: 1,
      });
    });
  });

  describe('status 参数筛选', () => {
    it('should return only active habits by default', async () => {
      const db = createTestDb();
      createUser(db, 'user-1');
      const sessionId = createSession(db, 'user-1');

      createHabit(db, { user_id: 'user-1', name: 'Active 1', status: 'active' });
      createHabit(db, { user_id: 'user-1', name: 'Active 2', status: 'active' });
      createHabit(db, { user_id: 'user-1', name: 'Inactive', status: 'inactive' });

      const app = createApp(db);

      const res = await request(app)
        .get('/api/v1/habits')
        .set('Cookie', [`session_id=${sessionId}`]);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(2);
      expect(res.body.data.items.every((i: any) => i.status === 'active')).toBe(true);
    });

    it('should return active habits when status=active', async () => {
      const db = createTestDb();
      createUser(db, 'user-1');
      const sessionId = createSession(db, 'user-1');

      createHabit(db, { user_id: 'user-1', name: 'Active', status: 'active' });
      createHabit(db, { user_id: 'user-1', name: 'Inactive', status: 'inactive' });

      const app = createApp(db);

      const res = await request(app)
        .get('/api/v1/habits?status=active')
        .set('Cookie', [`session_id=${sessionId}`]);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].name).toBe('Active');
    });

    it('should return all non-deleted habits when status=all', async () => {
      const db = createTestDb();
      createUser(db, 'user-1');
      const sessionId = createSession(db, 'user-1');

      createHabit(db, { user_id: 'user-1', name: 'Active', status: 'active' });
      createHabit(db, { user_id: 'user-1', name: 'Inactive', status: 'inactive' });
      createHabit(db, { user_id: 'user-1', name: 'Deleted', status: 'inactive', deleted_at: new Date().toISOString() });

      const app = createApp(db);

      const res = await request(app)
        .get('/api/v1/habits?status=all')
        .set('Cookie', [`session_id=${sessionId}`]);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(2);
      expect(res.body.data.items.map((i: any) => i.name).sort()).toEqual(['Active', 'Inactive']);
    });

    it('should return only archived (soft-deleted) habits when status=archived', async () => {
      const db = createTestDb();
      createUser(db, 'user-1');
      const sessionId = createSession(db, 'user-1');

      createHabit(db, { user_id: 'user-1', name: 'Active', status: 'active' });
      createHabit(db, {
        user_id: 'user-1',
        name: 'Archived',
        status: 'inactive',
        deleted_at: new Date().toISOString(),
      });

      const app = createApp(db);

      const res = await request(app)
        .get('/api/v1/habits?status=archived')
        .set('Cookie', [`session_id=${sessionId}`]);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].name).toBe('Archived');
    });

    it('should return 422 for invalid status value', async () => {
      const db = createTestDb();
      createUser(db, 'user-1');
      const sessionId = createSession(db, 'user-1');
      const app = createApp(db);

      const res = await request(app)
        .get('/api/v1/habits?status=invalid')
        .set('Cookie', [`session_id=${sessionId}`]);

      expect(res.status).toBe(422);
      expect(res.body.code).toBe(1001);
    });
  });

  describe('默认排序为创建时间倒序', () => {
    it('should return habits sorted by created_at DESC', async () => {
      const db = createTestDb();
      createUser(db, 'user-1');
      const sessionId = createSession(db, 'user-1');

      // 按时间顺序创建（最早的先创建）
      createHabit(db, { user_id: 'user-1', name: 'Oldest', created_at: '2024-01-01T00:00:00.000Z' });
      createHabit(db, { user_id: 'user-1', name: 'Middle', created_at: '2024-06-01T00:00:00.000Z' });
      createHabit(db, { user_id: 'user-1', name: 'Newest', created_at: '2024-12-01T00:00:00.000Z' });

      const app = createApp(db);

      const res = await request(app)
        .get('/api/v1/habits?status=all')
        .set('Cookie', [`session_id=${sessionId}`]);

      expect(res.status).toBe(200);
      const names = res.body.data.items.map((i: any) => i.name);
      expect(names).toEqual(['Newest', 'Middle', 'Oldest']);
    });
  });

  describe('page_size 参数校验', () => {
    it('should return 422 when page_size exceeds 100', async () => {
      const db = createTestDb();
      createUser(db, 'user-1');
      const sessionId = createSession(db, 'user-1');
      const app = createApp(db);

      const res = await request(app)
        .get('/api/v1/habits?page_size=101')
        .set('Cookie', [`session_id=${sessionId}`]);

      expect(res.status).toBe(422);
      expect(res.body.code).toBe(1001);
      expect(res.body.data[0].field).toBe('page_size');
    });

    it('should return 422 when page_size is 0', async () => {
      const db = createTestDb();
      createUser(db, 'user-1');
      const sessionId = createSession(db, 'user-1');
      const app = createApp(db);

      const res = await request(app)
        .get('/api/v1/habits?page_size=0')
        .set('Cookie', [`session_id=${sessionId}`]);

      expect(res.status).toBe(422);
    });
  });

  describe('空列表', () => {
    it('should return empty items with correct pagination', async () => {
      const db = createTestDb();
      createUser(db, 'user-1');
      const sessionId = createSession(db, 'user-1');
      const app = createApp(db);

      const res = await request(app)
        .get('/api/v1/habits')
        .set('Cookie', [`session_id=${sessionId}`]);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toEqual([]);
      expect(res.body.data.pagination).toEqual({
        page: 1,
        page_size: 20,
        total: 0,
        total_pages: 0,
      });
    });
  });

  describe('跨用户数据隔离', () => {
    it('should not return habits belonging to other users', async () => {
      const db = createTestDb();
      createUser(db, 'user-a');
      createUser(db, 'user-b');
      const sessionIdA = createSession(db, 'user-a');

      // user-a 创建 2 条
      createHabit(db, { user_id: 'user-a', name: 'A-Habit-1' });
      createHabit(db, { user_id: 'user-a', name: 'A-Habit-2' });

      // user-b 创建 3 条
      createHabit(db, { user_id: 'user-b', name: 'B-Habit-1' });
      createHabit(db, { user_id: 'user-b', name: 'B-Habit-2' });
      createHabit(db, { user_id: 'user-b', name: 'B-Habit-3' });

      const app = createApp(db);

      const res = await request(app)
        .get('/api/v1/habits?status=all')
        .set('Cookie', [`session_id=${sessionIdA}`]);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(2);
      expect(res.body.data.items.every((i: any) => i.name.startsWith('A-'))).toBe(true);
    });
  });
});
