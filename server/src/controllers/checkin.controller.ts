/**
 * 打卡记录 HTTP 控制器
 *
 * 处理 POST /api/v1/habits/:habitId/checkins 请求。
 */
import { Request, Response } from 'express';
import { CheckinService } from '../services/checkin.service';
import { sendSuccess, sendError } from '../utils/response';
import { AppError, ErrorCodes } from '../utils/errors';
import { getTodayDate } from '../services/checkin.service';

export class CheckinController {
  constructor(private checkinService: CheckinService) {}

  /**
   * POST /api/v1/habits/:habitId/checkins
   *
   * 请求体：{ "date": "YYYY-MM-DD" }
   * 响应：
   *   - 201 { code: 0, message: "ok", data: { id, habit_id, user_id, checkin_date, created_at } }
   *   - 200 { code: 0, message: "ok", data: { ...existing, duplicate: true } } （幂等）
   *   - 401 { code: 3001, message: "UNAUTHORIZED" }
   *   - 403 { code: 2002, message: "FORBIDDEN" }
   *   - 404 { code: 2001, message: "HABIT_NOT_FOUND" }
   *   - 410 { code: 2003, message: "HABIT_DELETED" }
   *   - 422 { code: 1001, message: "VALIDATION_ERROR", data: [...] }
   */
  createCheckin(req: Request, res: Response): void {
    try {
      const userId = req.userId;
      if (!userId) {
        throw new AppError(ErrorCodes.UNAUTHORIZED, 'UNAUTHORIZED');
      }

      const habitId = req.params.habitId;
      if (!habitId) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, 'MISSING_HABIT_ID');
      }

      const { date } = req.body;

      // 校验 date 字段
      if (!date || typeof date !== 'string') {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, 'VALIDATION_ERROR', [
          { field: 'date', reason: 'required' },
        ]);
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, 'VALIDATION_ERROR', [
          { field: 'date', reason: 'must be YYYY-MM-DD format' },
        ]);
      }

      // TODO: X-Timezone 支持 — 根据 Header 偏移计算当地日期再转 UTC
      // 当前使用 UTC 日期作为基准

      const result = this.checkinService.createCheckin({
        habitId,
        userId,
        date,
      });

      if (result.duplicate) {
        sendSuccess(res, { ...result.checkin, duplicate: true });
      } else {
        sendSuccess(res, result.checkin, 201);
      }
    } catch (err) {
      sendError(res, err as Error);
    }
  }
}
