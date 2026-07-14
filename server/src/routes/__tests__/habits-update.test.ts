/**
 * 习惯更新 API 测试
 *
 * 覆盖 PATCH /api/v1/habits/:habit_id 的各种场景。
 */

import request from 'supertest';
import express from 'express';
import { getDatabase, closeDatabase } from '../../config/database';
import { createHabit, findById } from '../../models/habit';
import habitRoutes from '../habits';

// ---------------------------------------------------------------------------
// 测试辅助
// ---------------------------------------------------------------------------

function createApp(): express.Application {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/habits', habitRoutes);
  return app;
}

const USER_A = 'user-a';
const USER_B = 'user-b';

function createTestHabit(userId: string = USER_A) {
  return createHabit(
    userId,
    '晨跑',
    JSON.stringify({ type: 'daily', params: {} }),
    '每天早上 7 点晨跑',
  );
}

// ---------------------------------------------------------------------------
// 测试套件
// ---------------------------------------------------------------------------

beforeEach(() => {
  // 确保每个测试在干净的数据库中运行
  closeDatabase();
  // 重新初始化会创建内存数据库
  getDatabase();
});

afterAll(() => {
  closeDatabase();
});

describe('PATCH /api/v1/habits/:habit_id', () => {
  describe('基本更新', () => {
    it('应该更新单个字段（部分更新语义）', async () => {
      const app = createApp();
      const habit = createTestHabit();

      // 只更新 name
      const res = await request(app)
        .patch(`/api/v1/habits/${habit.id}`)
        .set('Authorization', `Bearer ${USER_A}`)
        .send({ name: '夜跑' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('夜跑');
      expect(res.body.description).toBe('每天早上 7 点晨跑'); // 未提供，维持原值
      expect(res.body.id).toBe(habit.id);
      expect(res.body.is_active).toBe(1);
    });

    it('应该更新所有字段并返回完整对象', async () => {
      const app = createApp();
      const habit = createTestHabit();

      const res = await request(app)
        .patch(`/api/v1/habits/${habit.id}`)
        .set('Authorization', `Bearer ${USER_A}`)
        .send({
          name: '读书',
          description: '每晚读 30 分钟',
          cycle_expression: { type: 'daily', params: {} },
          is_active: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('读书');
      expect(res.body.description).toBe('每晚读 30 分钟');
      expect(res.body.is_active).toBe(1);
      expect(res.body.cycle_expression).toBe(JSON.stringify({ type: 'daily', params: {} }));
      expect(res.body.id).toBe(habit.id);
      expect(res.body.updated_at).not.toBe(habit.updated_at);
    });

    it('应该返回更新后的 updated_at 时间戳', async () => {
      const app = createApp();
      const habit = createTestHabit();

      const res = await request(app)
        .patch(`/api/v1/habits/${habit.id}`)
        .set('Authorization', `Bearer ${USER_A}`)
        .send({ name: '更新名称' });

      expect(res.status).toBe(200);
      expect(res.body.updated_at).toBeDefined();
      expect(new Date(res.body.updated_at).getTime()).toBeGreaterThan(
        new Date(habit.created_at).getTime(),
      );
    });
  });

  describe('cycle_expression 验证', () => {
    it('合法 weekly_days 应返回 200', async () => {
      const app = createApp();
      const habit = createTestHabit();

      const res = await request(app)
        .patch(`/api/v1/habits/${habit.id}`)
        .set('Authorization', `Bearer ${USER_A}`)
        .send({
          cycle_expression: { type: 'weekly_days', params: { days: [1, 3, 5] } },
        });

      expect(res.status).toBe(200);
      expect(res.body.cycle_expression).toBe(
        JSON.stringify({ type: 'weekly_days', params: { days: [1, 3, 5] } }),
      );
    });

    it('非法 cycle_expression（weekly_n_times 的 count=0）应返回 422', async () => {
      const app = createApp();
      const habit = createTestHabit();

      const res = await request(app)
        .patch(`/api/v1/habits/${habit.id}`)
        .set('Authorization', `Bearer ${USER_A}`)
        .send({
          cycle_expression: { type: 'weekly_n_times', params: { count: 0 } },
        });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe(422);
    });

    it('非法 cycle_expression（无效 type）应返回 422', async () => {
      const app = createApp();
      const habit = createTestHabit();

      const res = await request(app)
        .patch(`/api/v1/habits/${habit.id}`)
        .set('Authorization', `Bearer ${USER_A}`)
        .send({
          cycle_expression: { type: 'monthly', params: {} },
        });

      expect(res.status).toBe(422);
    });

    it('非法 cycle_expression（days 包含 0）应返回 422', async () => {
      const app = createApp();
      const habit = createTestHabit();

      const res = await request(app)
        .patch(`/api/v1/habits/${habit.id}`)
        .set('Authorization', `Bearer ${USER_A}`)
        .send({
          cycle_expression: { type: 'weekly_days', params: { days: [0, 1] } },
        });

      expect(res.status).toBe(422);
    });

    it('非法 cycle_expression（days 为空数组）应返回 422', async () => {
      const app = createApp();
      const habit = createTestHabit();

      const res = await request(app)
        .patch(`/api/v1/habits/${habit.id}`)
        .set('Authorization', `Bearer ${USER_A}`)
        .send({
          cycle_expression: { type: 'weekly_days', params: { days: [] } },
        });

      expect(res.status).toBe(422);
    });
  });

  describe('404 处理', () => {
    it('更新不存在的 habit_id 应返回 404', async () => {
      const app = createApp();

      const res = await request(app)
        .patch('/api/v1/habits/non-existent-id')
        .set('Authorization', `Bearer ${USER_A}`)
        .send({ name: '测试' });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe(404);
    });

    it('更新已软删除的习惯应返回 404', async () => {
      const app = createApp();
      const habit = createTestHabit();

      // 软删除习惯（直接操作数据库模拟）
      const db = getDatabase();
      db.prepare('UPDATE habits SET deleted_at = ? WHERE id = ?').run(
        new Date().toISOString(),
        habit.id,
      );

      const res = await request(app)
        .patch(`/api/v1/habits/${habit.id}`)
        .set('Authorization', `Bearer ${USER_A}`)
        .send({ name: '测试' });

      expect(res.status).toBe(404);
    });

    it('用户 B 尝试更新用户 A 的习惯应返回 404', async () => {
      const app = createApp();
      const habit = createTestHabit(USER_A);

      const res = await request(app)
        .patch(`/api/v1/habits/${habit.id}`)
        .set('Authorization', `Bearer ${USER_B}`)
        .send({ name: '用户 B 的修改' });

      expect(res.status).toBe(404);
    });
  });

  describe('is_active 切换', () => {
    it('设置 is_active 为 false 后应停用习惯', async () => {
      const app = createApp();
      const habit = createTestHabit();

      const res = await request(app)
        .patch(`/api/v1/habits/${habit.id}`)
        .set('Authorization', `Bearer ${USER_A}`)
        .send({ is_active: false });

      expect(res.status).toBe(200);
      expect(res.body.is_active).toBe(0);

      // 再次查询确认
      const getRes = await request(app)
        .get(`/api/v1/habits/${habit.id}`)
        .set('Authorization', `Bearer ${USER_A}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.is_active).toBe(0);
    });

    it('is_active 设为 true 应启用习惯', async () => {
      const app = createApp();
      const habit = createTestHabit();

      // 先停用
      await request(app)
        .patch(`/api/v1/habits/${habit.id}`)
        .set('Authorization', `Bearer ${USER_A}`)
        .send({ is_active: false });

      // 再启用
      const res = await request(app)
        .patch(`/api/v1/habits/${habit.id}`)
        .set('Authorization', `Bearer ${USER_A}`)
        .send({ is_active: true });

      expect(res.status).toBe(200);
      expect(res.body.is_active).toBe(1);
    });
  });

  describe('认证与请求验证', () => {
    it('未认证请求应返回 401', async () => {
      const app = createApp();
      const habit = createTestHabit();

      const res = await request(app)
        .patch(`/api/v1/habits/${habit.id}`)
        .send({ name: '测试' });

      expect(res.status).toBe(401);
    });

    it('空请求体应返回 400', async () => {
      const app = createApp();
      const habit = createTestHabit();

      const res = await request(app)
        .patch(`/api/v1/habits/${habit.id}`)
        .set('Authorization', `Bearer ${USER_A}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('不允许更新的字段应返回 400', async () => {
      const app = createApp();
      const habit = createTestHabit();

      const res = await request(app)
        .patch(`/api/v1/habits/${habit.id}`)
        .set('Authorization', `Bearer ${USER_A}`)
        .send({ unknown_field: 'test' });

      expect(res.status).toBe(400);
    });
  });
});
