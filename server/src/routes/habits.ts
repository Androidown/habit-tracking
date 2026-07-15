/**
 * 习惯路由
 *
 * 提供习惯的 CRUD API 端点。
 * 所有端点均需通过认证中间件验证用户身份。
 */

import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { findById, updateHabit, HabitUpdateData } from '../models/habit';
import { validateCycleExpression } from '../validators/habit';

const router = Router();

// 所有习惯路由都需要认证
router.use(authMiddleware);

// ---------------------------------------------------------------------------
// GET /api/v1/habits/:habit_id - 获取单个习惯详情
// ---------------------------------------------------------------------------

router.get('/:habit_id', (req: Request, res: Response) => {
  const { habit_id } = req.params;
  const userId = req.userId!;

  const habit = findById(habit_id, userId);

  if (!habit) {
    res.status(404).json({
      code: 404,
      message: '习惯不存在或已删除',
    });
    return;
  }

  res.json(habit);
});

// ---------------------------------------------------------------------------
// PATCH /api/v1/habits/:habit_id - 更新习惯（部分更新语义）
// ---------------------------------------------------------------------------

router.patch('/:habit_id', (req: Request, res: Response) => {
  const { habit_id } = req.params;
  const userId = req.userId!;
  const body = req.body as Record<string, unknown>;

  // 检查请求体是否为空
  if (!body || typeof body !== 'object' || Object.keys(body).length === 0) {
    res.status(400).json({
      code: 400,
      message: '请求体不能为空，请提供至少一个需要更新的字段',
    });
    return;
  }

  // 验证字段名合法性（只允许更新指定字段）
  const allowedFields = ['name', 'description', 'cycle_expression', 'is_active'];
  const unknownFields = Object.keys(body).filter((k) => !allowedFields.includes(k));

  if (unknownFields.length > 0) {
    res.status(400).json({
      code: 400,
      message: `不允许更新以下字段：${unknownFields.join(', ')}`,
    });
    return;
  }

  // 验证字段值类型
  if (body.name !== undefined && typeof body.name !== 'string') {
    res.status(400).json({ code: 400, message: 'name 必须是字符串' });
    return;
  }

  if (body.description !== undefined && body.description !== null && typeof body.description !== 'string') {
    res.status(400).json({ code: 400, message: 'description 必须是字符串或 null' });
    return;
  }

  if (body.is_active !== undefined && typeof body.is_active !== 'boolean' && typeof body.is_active !== 'number') {
    res.status(400).json({ code: 400, message: 'is_active 必须是布尔值或数字' });
    return;
  }

  // 验证周期表达式（如果提供了）
  if (body.cycle_expression !== undefined) {
    const validation = validateCycleExpression(body.cycle_expression);
    if (!validation.valid) {
      res.status(422).json({
        code: 422,
        message: '周期表达式验证失败',
        errors: validation.errors,
      });
      return;
    }
  }

  // 构建更新数据
  const updateData: HabitUpdateData = {};

  if (body.name !== undefined) updateData.name = body.name as string;
  if (body.description !== undefined) updateData.description = body.description as string | null;
  if (body.cycle_expression !== undefined) {
    updateData.cycle_expression =
      typeof body.cycle_expression === 'string'
        ? body.cycle_expression
        : JSON.stringify(body.cycle_expression);
  }
  if (body.is_active !== undefined) {
    updateData.is_active = body.is_active ? 1 : 0;
  }

  // 执行更新
  const updated = updateHabit(habit_id, userId, updateData);

  if (!updated) {
    res.status(404).json({
      code: 404,
      message: '习惯不存在或已删除',
    });
    return;
  }

  res.json(updated);
});

export default router;
