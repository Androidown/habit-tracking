/**
 * 习惯 HTTP 控制器
 *
 * 处理 GET /api/v1/habits 请求。
 */
import { Request, Response } from 'express';
import { HabitService } from '../services/habit.service';
import { sendSuccess, sendError } from '../utils/response';
import { AppError, ErrorCodes } from '../utils/errors';

export class HabitController {
  constructor(private habitService: HabitService) {}

  /**
   * GET /api/v1/habits
   *
   * 查询参数：
   *   - status: 'active' | 'all' | 'archived'（默认 'active'）
   *   - page: number（默认 1）
   *   - page_size: number（默认 20，最大 100）
   *
   * 响应：
   *   - 200 { code: 0, message: "ok", data: { items: [...], pagination: {...} } }
   *   - 401 { code: 3001, message: "UNAUTHORIZED" }
   *   - 422 { code: 1001, message: "VALIDATION_ERROR", data: [...] }
   */
  list(req: Request, res: Response): void {
    try {
      const userId = req.userId;
      if (!userId) {
        throw new AppError(ErrorCodes.UNAUTHORIZED, 'UNAUTHORIZED');
      }

      // 解析并校验查询参数
      const status = this.parseStatusParam(req.query.status as string | undefined);
      const page = this.parsePageParam(req.query.page as string | undefined);
      const pageSize = this.parsePageSizeParam(req.query.page_size as string | undefined);

      // 委托服务层
      const result = this.habitService.list({
        userId,
        status,
        page,
        pageSize,
      });

      sendSuccess(res, result);
    } catch (err) {
      sendError(res, err as Error);
    }
  }

  /**
   * 解析 status 查询参数。
   */
  private parseStatusParam(raw?: string): 'active' | 'all' | 'archived' {
    if (!raw || raw === 'active') return 'active';
    if (raw === 'all') return 'all';
    if (raw === 'archived') return 'archived';

    throw new AppError(ErrorCodes.VALIDATION_ERROR, 'VALIDATION_ERROR', [
      {
        field: 'status',
        reason: "must be one of: active, all, archived",
      },
    ]);
  }

  /**
   * 解析 page 查询参数。
   */
  private parsePageParam(raw?: string): number {
    if (!raw) return 1;

    const page = parseInt(raw, 10);
    if (isNaN(page) || page < 1) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'VALIDATION_ERROR', [
        {
          field: 'page',
          reason: 'must be a positive integer',
        },
      ]);
    }

    return page;
  }

  /**
   * 解析 page_size 查询参数（默认 20，最大 100）。
   */
  private parsePageSizeParam(raw?: string): number {
    if (!raw) return 20;

    const pageSize = parseInt(raw, 10);
    if (isNaN(pageSize) || pageSize < 1) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'VALIDATION_ERROR', [
        {
          field: 'page_size',
          reason: 'must be a positive integer',
        },
      ]);
    }

    if (pageSize > 100) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'VALIDATION_ERROR', [
        {
          field: 'page_size',
          reason: 'must not exceed 100',
        },
      ]);
    }

    return pageSize;
  }
}
