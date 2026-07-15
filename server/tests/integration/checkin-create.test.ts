/**
 * 打卡记录新增接口 — 集成测试
 *
 * 覆盖：
 *   - 201 创建成功
 *   - 200 重复提交（幂等）
 *   - 403 跨用户权限隔离
 *   - 404 习惯不存在
 *   - 400 日期非当天
 *   - 410 已删除习惯
 */

import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { HabitModel } from '../../src/models/habit.model';
import { CheckinModel } from '../../src/models/checkin.model';
import { CheckinService } from '../../src/services/checkin.service';
import { CheckinController } from '../../src/controllers/checkin.controller';
import { AuthMiddleware } from '../../src/middleware/auth.middleware';
import { OwnershipMiddleware } from '../../src/middleware/ownership.middleware';
import { createCheckinRoutes } from '../../src/routes/checkin.routes';

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
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS checkins (
      id TEXT PRIMARY KEY,
      habit_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      checkin_date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (habit_id) REFERENCES habits(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_checkins_unique ON checkins(habit_id, user_id, checkin_date);
  `);
  return db;
}

/** 创建测试 Express 应用 */
function createApp(db: Database.Database, options?: { autoAuth?: boolean; userId?: string }) {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  const habitModel = new HabitModel(db);
  const checkinModel = new CheckinModel(db);
  const checkinService = new CheckinService(habitModel, checkinModel);
  const checkinController = new CheckinController(checkinService);
  const authMiddleware = new AuthMiddleware(db);
  const ownershipMiddleware = new OwnershipMiddleware(db);

  const router = createCheckinRoutes(checkinController, authMiddleware, ownershipMiddleware);

  // 注入认证用户（用于跳过实际 session 校验，专注测试业务逻辑）
  app.use('/api/v1/habits/:habitId/checkins', (req, _res, next) => {
    if (options?.autoAuth && options.userId) {
      req.userId = options.userId;
    }
    next();
  });

  app.use('/api/v1/habits/:habitId/checkins', router);

  return app;
}

/** 在测试数据库中创建一条会话记录 */
function createSession(db: Database.Database, userId: string): string {
  const id = randomUUID();
  const future = new Date(Date.now() + 86400000).toISOString(); // 24h later
  db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run(id, userId, future);
  return id;
}

/** 在测试数据库中创建一条用户 */
function createUser(db: Database.Database, id: string): void {
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO users (id, email, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(id, `user-${id}@test.com`, `User${id}`, 'hash', now, now);
}

/** 获取当天日期字符串（YYYY-MM-DD） */
function todayDate(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

describe('POST /api/v1/habits/:habitId/checkins (Integration)', () => {
  describe('认证与基础权限', () => {
    it('should return 401 when no auth provided', async () => {
      const db = createTestDb();
      const app = createApp(db);

      const res = await request(app)
        .post('/api/v1/habits/habit-1/checkins')
        .send({ date: todayDate() });

      expect(res.status).toBe(401);
    });

    it('should return 401 when session cookie is invalid', async () => {
      const db = createTestDb();
      const app = createApp(db);

      const res = await request(app)
        .post('/api/v1/habits/habit-1/checkins')
        .set('Cookie', ['session_id=invalid-session'])
        .send({ date: todayDate() });

      expect(res.status).toBe(401);
    });
  });

  describe('201 创建成功', () => {
    it('should create a checkin and return 201', async () => {
      const db = createTestDb();
      createUser(db, 'user-1');
      const sessionId = createSession(db, 'user-1');

      // 创建一条习惯（当前测试用户的）
      const now = new Date().toISOString();
      db.prepare(
        "INSERT INTO habits (id, user_id, name, description, status, created_at, updated_at) VALUES ('habit-1', 'user-1', 'Reading', '', 'active', ?, ?)",
      ).run(now, now);

      const app = createApp(db);

      const res = await request(app)
        .post('/api/v1/habits/habit-1/checkins')
        .set('Cookie', [`session_id=${sessionId}`])
        .send({ date: todayDate() });

      expect(res.status).toBe(201);
      expect(res.body.code).toBe(0);
      expect(res.body.message).toBe('ok');
      expect(res.body.data).toBeDefined();
      expect(res.body.data.habit_id).toBe('habit-1');
      expect(res.body.data.user_id).toBe('user-1');
      expect(res.body.data.checkin_date).toBe(todayDate());
    });
  });

  describe('200 重复提交（幂等）', () => {
    it('should return 200 with duplicate=true on repeat submission', async () => {
      const db = createTestDb();
      createUser(db, 'user-1');
      const sessionId = createSession(db, 'user-1');

      const now = new Date().toISOString();
      db.prepare(
        "INSERT INTO habits (id, user_id, name, description, status, created_at, updated_at) VALUES ('habit-1', 'user-1', 'Reading', '', 'active', ?, ?)",
      ).run(now, now);

      const app = createApp(db);

      // 第一次提交
      const first = await request(app)
        .post('/api/v1/habits/habit-1/checkins')
        .set('Cookie', [`session_id=${sessionId}`])
        .send({ date: todayDate() });
      expect(first.status).toBe(201);

      // 第二次重复提交
      const second = await request(app)
        .post('/api/v1/habits/habit-1/checkins')
        .set('Cookie', [`session_id=${sessionId}`])
        .send({ date: todayDate() });

      expect(second.status).toBe(200);
      expect(second.body.code).toBe(0);
      expect(second.body.data.duplicate).toBe(true);
      expect(second.body.data.id).toBe(first.body.data.id);
    });
  });

  describe('403 跨用户权限隔离', () => {
    it('should return 404 when trying to check in for another user\'s habit', async () => {
      const db = createTestDb();
      createUser(db, 'user-a');
      createUser(db, 'user-b');
      const sessionId = createSession(db, 'user-b');

      // habit-1 属于 user-a
      const now = new Date().toISOString();
      db.prepare(
        "INSERT INTO habits (id, user_id, name, description, status, created_at, updated_at) VALUES ('habit-1', 'user-a', 'Reading', '', 'active', ?, ?)",
      ).run(now, now);

      const app = createApp(db);

      const res = await request(app)
        .post('/api/v1/habits/habit-1/checkins')
        .set('Cookie', [`session_id=${sessionId}`])
        .send({ date: todayDate() });

      // ownership middleware returns 404 with HABIT_NOT_FOUND
      // (it doesn't distinguish "not found" from "not yours")
      expect(res.status).toBe(404);
      expect(res.body.code).toBe(2001);
    });
  });

  describe('404 习惯不存在', () => {
    it('should return 404 when habit does not exist', async () => {
      const db = createTestDb();
      createUser(db, 'user-1');
      const sessionId = createSession(db, 'user-1');

      const app = createApp(db);

      const res = await request(app)
        .post('/api/v1/habits/nonexistent-habit/checkins')
        .set('Cookie', [`session_id=${sessionId}`])
        .send({ date: todayDate() });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe(2001);
    });
  });

  describe('422 日期非当天', () => {
    it('should return 422 when date is not today', async () => {
      const db = createTestDb();
      createUser(db, 'user-1');
      const sessionId = createSession(db, 'user-1');

      const now = new Date().toISOString();
      db.prepare(
        "INSERT INTO habits (id, user_id, name, description, status, created_at, updated_at) VALUES ('habit-1', 'user-1', 'Reading', '', 'active', ?, ?)",
      ).run(now, now);

      const app = createApp(db);

      const res = await request(app)
        .post('/api/v1/habits/habit-1/checkins')
        .set('Cookie', [`session_id=${sessionId}`])
        .send({ date: '2020-01-01' });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe(1001);
      expect(res.body.message).toBe('DATE_MUST_BE_TODAY');
    });

    it('should return 422 when date is missing', async () => {
      const db = createTestDb();
      createUser(db, 'user-1');
      const sessionId = createSession(db, 'user-1');

      const now = new Date().toISOString();
      db.prepare(
        "INSERT INTO habits (id, user_id, name, description, status, created_at, updated_at) VALUES ('habit-1', 'user-1', 'Reading', '', 'active', ?, ?)",
      ).run(now, now);

      const app = createApp(db);

      const res = await request(app)
        .post('/api/v1/habits/habit-1/checkins')
        .set('Cookie', [`session_id=${sessionId}`])
        .send({});

      expect(res.status).toBe(422);
      expect(res.body.code).toBe(1001);
    });
  });

  describe('410 已删除习惯', () => {
    it('should return 410 when habit is deleted', async () => {
      const db = createTestDb();
      createUser(db, 'user-1');
      const sessionId = createSession(db, 'user-1');

      const now = new Date().toISOString();
      db.prepare(
        "INSERT INTO habits (id, user_id, name, description, status, created_at, updated_at) VALUES ('habit-1', 'user-1', 'Reading', '', 'deleted', ?, ?)",
      ).run(now, now);

      const app = createApp(db);

      const res = await request(app)
        .post('/api/v1/habits/habit-1/checkins')
        .set('Cookie', [`session_id=${sessionId}`])
        .send({ date: todayDate() });

      expect(res.status).toBe(410);
      expect(res.body.code).toBe(2003);
      expect(res.body.message).toBe('HABIT_DELETED');
    });
  });
});
