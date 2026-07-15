/**
 * 打卡记录服务 — 单元测试
 *
 * 覆盖：
 *  - 幂等逻辑：同一用户同一天同一习惯重复提交 → duplicate: true
 *  - 权限隔离：非习惯拥有者 → HABIT_NOT_FOUND
 *  - 已删除习惯拒绝：status=deleted → HABIT_DELETED
 *  - 日期校验：非当天日期 → VALIDATION_ERROR
 */

import Database from 'better-sqlite3';
import { HabitModel } from '../../../src/models/habit.model';
import { CheckinModel } from '../../../src/models/checkin.model';
import { CheckinService, getTodayDate } from '../../../src/services/checkin.service';
import { AppError, ErrorCodes } from '../../../src/utils/errors';

/** 创建测试用内存数据库，包含 habits 和 checkins 表。 */
function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE habits (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE checkins (
      id TEXT PRIMARY KEY,
      habit_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      checkin_date TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX idx_checkins_unique ON checkins(habit_id, user_id, checkin_date);
  `);
  return db;
}

function createService(db: Database.Database): CheckinService {
  return new CheckinService(new HabitModel(db), new CheckinModel(db));
}

/** 在测试数据库中插入一条习惯。返回习惯 ID。 */
function insertHabit(
  db: Database.Database,
  overrides?: Partial<{ id: string; user_id: string; status: string }>,
): { id: string; user_id: string } {
  const id = overrides?.id || 'habit-1';
  const userId = overrides?.user_id || 'user-1';
  const status = overrides?.status || 'active';
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO habits (id, user_id, name, description, status, created_at, updated_at)
     VALUES (?, ?, 'Test Habit', '', ?, ?, ?)`,
  ).run(id, userId, status, now, now);
  return { id, user_id: userId };
}

describe('CheckinService', () => {
  describe('createCheckin', () => {
    it('should create a checkin and return it with duplicate=false', () => {
      const db = createTestDb();
      const service = createService(db);
      insertHabit(db);

      const today = getTodayDate();
      const result = service.createCheckin({
        habitId: 'habit-1',
        userId: 'user-1',
        date: today,
      });

      expect(result.duplicate).toBe(false);
      expect(result.checkin).toMatchObject({
        habit_id: 'habit-1',
        user_id: 'user-1',
        checkin_date: today,
      });
      expect(result.checkin.id).toBeTruthy();
      expect(result.checkin.created_at).toBeTruthy();
    });

    it('should return duplicate=true when same user checks in on the same day', () => {
      const db = createTestDb();
      const service = createService(db);
      insertHabit(db);

      const today = getTodayDate();

      // 第一次提交
      const first = service.createCheckin({
        habitId: 'habit-1',
        userId: 'user-1',
        date: today,
      });
      expect(first.duplicate).toBe(false);

      // 第二次重复提交
      const second = service.createCheckin({
        habitId: 'habit-1',
        userId: 'user-1',
        date: today,
      });
      expect(second.duplicate).toBe(true);
      expect(second.checkin.id).toBe(first.checkin.id);
    });

    it('should throw HABIT_NOT_FOUND when habit does not exist', () => {
      const db = createTestDb();
      const service = createService(db);

      expect(() => {
        service.createCheckin({
          habitId: 'nonexistent',
          userId: 'user-1',
          date: getTodayDate(),
        });
      }).toThrow(AppError);

      try {
        service.createCheckin({
          habitId: 'nonexistent',
          userId: 'user-1',
          date: getTodayDate(),
        });
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).code).toBe(ErrorCodes.HABIT_NOT_FOUND);
      }
    });

    it('should throw HABIT_NOT_FOUND when habit belongs to another user (permission isolation)', () => {
      const db = createTestDb();
      const service = createService(db);
      insertHabit(db, { id: 'habit-1', user_id: 'user-a' });

      expect(() => {
        service.createCheckin({
          habitId: 'habit-1',
          userId: 'user-b',
          date: getTodayDate(),
        });
      }).toThrow(AppError);

      try {
        service.createCheckin({
          habitId: 'habit-1',
          userId: 'user-b',
          date: getTodayDate(),
        });
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).code).toBe(ErrorCodes.HABIT_NOT_FOUND);
      }
    });

    it('should throw HABIT_DELETED when habit status is deleted', () => {
      const db = createTestDb();
      const service = createService(db);
      insertHabit(db, { id: 'habit-1', user_id: 'user-1', status: 'deleted' });

      expect(() => {
        service.createCheckin({
          habitId: 'habit-1',
          userId: 'user-1',
          date: getTodayDate(),
        });
      }).toThrow(AppError);

      try {
        service.createCheckin({
          habitId: 'habit-1',
          userId: 'user-1',
          date: getTodayDate(),
        });
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).code).toBe(ErrorCodes.HABIT_DELETED);
      }
    });

    it('should throw VALIDATION_ERROR when date is not today', () => {
      const db = createTestDb();
      const service = createService(db);
      insertHabit(db);

      expect(() => {
        service.createCheckin({
          habitId: 'habit-1',
          userId: 'user-1',
          date: '2020-01-01',
        });
      }).toThrow(AppError);

      try {
        service.createCheckin({
          habitId: 'habit-1',
          userId: 'user-1',
          date: '2020-01-01',
        });
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).code).toBe(ErrorCodes.VALIDATION_ERROR);
      }
    });
  });
});
