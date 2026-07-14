/**
 * 习惯资源归属校验中间件
 *
 * 从路由参数 `habitId` 中提取习惯 ID，校验当前认证用户是否是该习惯的拥有者。
 * 成功时将 HabitRow 附着到 `req.habit` 上供下游使用。
 */
import { Request, Response, NextFunction } from 'express';
import Database from 'better-sqlite3';
import { AppError, ErrorCodes } from '../utils/errors';
import { sendError } from '../utils/response';
import { HabitRow } from '../models/habit.model';

// 扩展 Express Request 类型
declare global {
  namespace Express {
    interface Request {
      habit?: HabitRow;
    }
  }
}

export class OwnershipMiddleware {
  constructor(private db: Database.Database) {}

  /**
   * 中间件处理函数。
   * 校验当前用户对路径中 `:habitId` 标识的习惯拥有操作权限。
   */
  handle(req: Request, res: Response, next: NextFunction): void {
    try {
      const habitId = req.params.habitId || req.params.habit_id;
      const userId = req.userId;

      if (!habitId) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, 'MISSING_HABIT_ID');
      }

      if (!userId) {
        throw new AppError(ErrorCodes.UNAUTHORIZED, 'UNAUTHORIZED');
      }

      const habit = this.db
        .prepare('SELECT * FROM habits WHERE id = ? AND user_id = ?')
        .get(habitId, userId) as HabitRow | undefined;

      if (!habit) {
        throw new AppError(ErrorCodes.HABIT_NOT_FOUND, 'HABIT_NOT_FOUND');
      }

      req.habit = habit;
      next();
    } catch (err) {
      sendError(res, err as Error);
    }
  }
}
