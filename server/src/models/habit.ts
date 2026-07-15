/**
 * 习惯数据模型
 *
 * 提供习惯的数据库操作，包括创建、查询和部分更新。
 * 所有查询都绑定 userId，确保用户只能操作自己的习惯数据。
 */

import { randomUUID } from 'crypto';
import { getDatabase } from '../config/database';

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

export interface Habit {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  cycle_expression: string;
  is_active: number; // SQLite boolean (0/1)
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * 习惯更新数据 - 所有字段均为可选，仅更新提供的字段。
 */
export interface HabitUpdateData {
  name?: string;
  description?: string | null;
  cycle_expression?: string;
  is_active?: number;
}

// ---------------------------------------------------------------------------
// 私有辅助
// ---------------------------------------------------------------------------

function now(): string {
  return new Date().toISOString();
}

function rowToHabit(row: unknown): Habit {
  const r = row as Record<string, unknown>;
  return {
    id: r.id as string,
    user_id: r.user_id as string,
    name: r.name as string,
    description: (r.description as string) || null,
    cycle_expression: r.cycle_expression as string,
    is_active: r.is_active as number,
    deleted_at: (r.deleted_at as string) || null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  };
}

// ---------------------------------------------------------------------------
// 公开方法
// ---------------------------------------------------------------------------

/**
 * 创建新习惯。
 */
export function createHabit(
  userId: string,
  name: string,
  cycleExpression: string,
  description?: string,
): Habit {
  const db = getDatabase();
  const id = randomUUID();
  const timestamp = now();

  const stmt = db.prepare(`
    INSERT INTO habits (id, user_id, name, description, cycle_expression, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(id, userId, name, description || null, cycleExpression, timestamp, timestamp);

  return {
    id,
    user_id: userId,
    name,
    description: description || null,
    cycle_expression: cycleExpression,
    is_active: 1,
    deleted_at: null,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

/**
 * 根据 habitId + userId 查找习惯。
 * 已软删除（deleted_at IS NOT NULL）的习惯视为不存在。
 * 返回 null 表示未找到或无权访问。
 */
export function findById(id: string, userId: string): Habit | null {
  const db = getDatabase();

  const row = db.prepare(
    'SELECT * FROM habits WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
  ).get(id, userId);

  return row ? rowToHabit(row) : null;
}

/**
 * 根据 habitId 查找习惯（不检查 userId，用于内部操作）。
 * 返回 null 表示不存在或已软删除。
 */
export function findByIdRaw(id: string): Habit | null {
  const db = getDatabase();

  const row = db.prepare(
    'SELECT * FROM habits WHERE id = ? AND deleted_at IS NULL',
  ).get(id);

  return row ? rowToHabit(row) : null;
}

/**
 * 部分更新习惯 - 仅更新请求中提供的字段。
 *
 * @param id - 习惯 ID
 * @param userId - 用户 ID（用于权限校验）
 * @param data - 要更新的字段
 * @returns 更新后的完整 Habit 对象，如果习惯不存在或无权访问则返回 null
 */
export function updateHabit(id: string, userId: string, data: HabitUpdateData): Habit | null {
  const db = getDatabase();

  // 先检查习惯是否存在且属于当前用户
  const existing = db.prepare(
    'SELECT * FROM habits WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
  ).get(id, userId);

  if (!existing) return null;

  // 构建动态 UPDATE 语句（仅更新提供的字段）
  const fields: string[] = [];
  const values: unknown[] = [];

  if (data.name !== undefined) {
    fields.push('name = ?');
    values.push(data.name);
  }
  if (data.description !== undefined) {
    fields.push('description = ?');
    values.push(data.description);
  }
  if (data.cycle_expression !== undefined) {
    fields.push('cycle_expression = ?');
    values.push(data.cycle_expression);
  }
  if (data.is_active !== undefined) {
    fields.push('is_active = ?');
    values.push(data.is_active);
  }

  if (fields.length === 0) {
    // 没有字段需要更新，返回当前状态
    return rowToHabit(existing);
  }

  // 总是更新 updated_at
  const timestamp = now();
  fields.push('updated_at = ?');
  values.push(timestamp);

  // 添加 WHERE 条件
  values.push(id, userId);

  db.prepare(
    `UPDATE habits SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
  ).run(...values);

  // 查询并返回更新后的完整对象
  const updated = db.prepare(
    'SELECT * FROM habits WHERE id = ?',
  ).get(id);

  return updated ? rowToHabit(updated) : null;
}

/**
 * 获取用户的所有活跃习惯。
 */
export function findActiveByUserId(userId: string): Habit[] {
  const db = getDatabase();

  const rows = db.prepare(
    'SELECT * FROM habits WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at',
  ).all(userId);

  return rows.map(rowToHabit);
}
