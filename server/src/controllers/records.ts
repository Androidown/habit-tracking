/**
 * 打卡记录列表查询控制器
 *
 * 负责解析请求参数、校验、调用服务层、格式化响应。
 */

import { Request, Response } from 'express';
import { RecordService, ListRecordsParams } from '../services/record-service';

// ---------------------------------------------------------------------------
// 错误码（遵循 DEM-187 规范）
// ---------------------------------------------------------------------------

const VALIDATION_ERROR = 1001;
const INTERNAL_ERROR = 9999;

// ---------------------------------------------------------------------------
// 控制器
// ---------------------------------------------------------------------------

export class RecordsController {
  private recordService: RecordService;

  constructor(recordService: RecordService) {
    this.recordService = recordService;
  }

  /**
   * GET /api/v1/records
   *
   * 查询当前用户的打卡记录列表，支持分页和习惯名称模糊搜索。
   */
  list = (req: Request, res: Response): void => {
    try {
      // 从认证中间件获取用户 ID
      const userId = req.userId;
      if (!userId) {
        res.status(401).json({
          code: 401,
          message: 'AUTH_REQUIRED',
        });
        return;
      }

      // 解析查询参数
      const pageRaw = req.query.page as string | undefined;
      const perPageRaw = req.query.perPage as string | undefined;
      const habitName = req.query.habitName as string | undefined;

      // 解析并校验 page
      const page = pageRaw !== undefined ? parseInt(pageRaw, 10) : undefined;
      if (pageRaw !== undefined && (isNaN(page!) || page! < 1)) {
        res.status(400).json({
          code: VALIDATION_ERROR,
          message: 'VALIDATION_ERROR',
          data: [{ field: 'page', reason: 'must be a positive integer' }],
        });
        return;
      }

      // 解析并校验 perPage
      const perPage = perPageRaw !== undefined ? parseInt(perPageRaw, 10) : undefined;
      if (perPageRaw !== undefined && (isNaN(perPage!) || perPage! < 1 || perPage! > 100)) {
        res.status(400).json({
          code: VALIDATION_ERROR,
          message: 'VALIDATION_ERROR',
          data: [{ field: 'perPage', reason: 'must be between 1 and 100' }],
        });
        return;
      }

      const params: ListRecordsParams = { page, perPage, habitName };

      // 调用服务层
      const result = this.recordService.listRecords(userId, params);

      // 返回成功响应
      res.json({
        code: 0,
        message: 'ok',
        data: result,
      });
    } catch (err) {
      console.error('Failed to list records:', err);
      res.status(500).json({
        code: INTERNAL_ERROR,
        message: 'INTERNAL_ERROR',
      });
    }
  };
}
