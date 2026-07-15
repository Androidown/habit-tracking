/**
 * 打卡记录列表查询服务
 *
 * 提供跨习惯的打卡记录查询，支持分页和习惯名称模糊搜索。
 */

import Database from 'better-sqlite3';
import { CheckinModel, CheckinListParams, PaginatedCheckins } from '../models/checkin';

// ---------------------------------------------------------------------------
// 参数约束
// ---------------------------------------------------------------------------

const MAX_PER_PAGE = 100;
const DEFAULT_PAGE = 1;
const DEFAULT_PER_PAGE = 20;

// ---------------------------------------------------------------------------
// 请求参数类型
// ---------------------------------------------------------------------------

export interface ListRecordsParams {
  page?: number;
  perPage?: number;
  habitName?: string;
}

// ---------------------------------------------------------------------------
// 服务
// ---------------------------------------------------------------------------

export class RecordService {
  private checkinModel: CheckinModel;

  constructor(db: Database.Database) {
    this.checkinModel = new CheckinModel(db);
  }

  /**
   * 查询用户的打卡记录列表
   *
   * @param userId  用户 ID（由认证中间件注入）
   * @param params  查询参数（page, perPage, habitName）
   * @returns       分页的打卡记录列表
   */
  listRecords(userId: string, params: ListRecordsParams): PaginatedCheckins {
    // 参数校验与默认值
    const page = Math.max(1, Math.floor(params.page ?? DEFAULT_PAGE));
    const perPage = Math.min(MAX_PER_PAGE, Math.max(1, Math.floor(params.perPage ?? DEFAULT_PER_PAGE)));

    // habitName 为空字符串时等价于不传
    const habitName = params.habitName?.trim() || undefined;

    const listParams: CheckinListParams = {
      page,
      perPage,
      habitName,
    };

    return this.checkinModel.listByUserID(userId, listParams);
  }
}
