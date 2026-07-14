/**
 * 打卡记录业务逻辑
 *
 * 包含幂等处理与权限校验。
 */
import { AppError, ErrorCodes } from '../utils/errors';
import { HabitModel, HabitRow } from '../models/habit.model';
import { CheckinModel, CheckinRow } from '../models/checkin.model';

export interface CreateCheckinInput {
  habitId: string;
  userId: string;
  date: string; // YYYY-MM-DD
}

export interface CreateCheckinResult {
  checkin: CheckinRow;
  duplicate: boolean;
}

export class CheckinService {
  constructor(
    private habitModel: HabitModel,
    private checkinModel: CheckinModel,
  ) {}

  /**
   * 新增打卡记录。
   *
   * 业务规则：
   *  1. 校验习惯存在且属于当前用户
   *  2. 校验习惯未被删除（status !== 'deleted'）
   *  3. 校验 date 为当天日期（YYYY-MM-DD），禁止补打卡
   *  4. 幂等检查：同一用户同一天同一习惯已有记录 → 返回 200 + duplicate: true
   *  5. 写入新打卡记录 → 返回 201
   */
  createCheckin(input: CreateCheckinInput): CreateCheckinResult {
    const { habitId, userId, date } = input;

    // 1. 校验习惯是否存在且属于当前用户
    const habit = this.habitModel.findByIdAndUser(habitId, userId);
    if (!habit) {
      throw new AppError(ErrorCodes.HABIT_NOT_FOUND, 'HABIT_NOT_FOUND');
    }

    // 2. 校验习惯未被删除
    if (habit.status === 'deleted') {
      throw new AppError(ErrorCodes.HABIT_DELETED, 'HABIT_DELETED');
    }

    // 3. 校验日期必须为当天
    const today = getTodayDate();
    if (date !== today) {
      throw new AppError(
        ErrorCodes.VALIDATION_ERROR,
        'DATE_MUST_BE_TODAY',
        [
          {
            field: 'date',
            reason: `must be today (${today}), got ${date}`,
          },
        ],
      );
    }

    // 4. 幂等检查
    const existing = this.checkinModel.findOne(habitId, userId, date);
    if (existing) {
      return { checkin: existing, duplicate: true };
    }

    // 5. 创建新打卡记录
    const checkin = this.checkinModel.create(habitId, userId, date);
    return { checkin, duplicate: false };
  }
}

/**
 * 获取当天日期（YYYY-MM-DD 格式）。
 * 优先读取 X-Timezone 偏移（由调用方在 controller 层处理），
 * 此处统一使用 UTC 日期作为后端存储基准。
 */
export function getTodayDate(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
