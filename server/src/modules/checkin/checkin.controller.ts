import {
  Controller,
  Get,
  Param,
  Post,
  Delete,
  Req,
  HttpCode,
} from '@nestjs/common';
import { CheckinService } from './checkin.service';
import { CheckinRepository } from './checkin.repository';
import { HabitService } from '../habit/habit.service';
import { getTodayStartUTC } from '../../common/utils/time';

@Controller('api/v1')
export class CheckinController {
  constructor(
    private readonly checkinService: CheckinService,
    private readonly checkinRepo: CheckinRepository,
    private readonly habitService: HabitService,
  ) {}

  /**
   * GET /api/v1/habits/today
   * 返回今日待办习惯列表，每个习惯附带周期进度和今日打卡状态
   */
  @Get('habits/today')
  async getTodayHabits(@Req() req: any) {
    const userId = req.user?.id ?? 'default-user';

    // 同一批次内完成列表查询和进度计算，避免异步时序导致数据不对齐
    const [habits, todayCheckins, todaySummary] = await Promise.all([
      this.habitService.findEnabledByUser(userId),
      this.checkinRepo.findByUserAndDate(userId, getTodayStartUTC()),
      this.checkinService.getTodaySummary(userId),
    ]);

    // 构建 habitId → 今日已打卡 的查找表
    const checkedInHabitIds = new Set(todayCheckins.map((c) => c.habitId));

    // 获取每个习惯的本周进度
    const habitsWithProgress = await Promise.all(
      habits.map(async (habit) => {
        const progress = await this.checkinService.getWeeklyProgress(
          habit.id,
          userId,
        );

        return {
          id: habit.id,
          name: habit.name,
          description: habit.description,
          cycle_type: habit.cycleType,
          cycle_config: habit.cycleConfig,
          this_week_completed: progress.completed,
          today_checked_in: checkedInHabitIds.has(habit.id),
          created_at: habit.createdAt,
        };
      }),
    );

    return {
      habits: habitsWithProgress,
      total_count: habits.length,
      today_checked_in_count: todayCheckins.length,
      today_summary: {
        total_todo: todaySummary.total_todo,
        completed: todaySummary.completed,
      },
    };
  }

  /**
   * GET /api/v1/checkins/today/summary
   * 返回今日打卡概览
   */
  @Get('checkins/today/summary')
  async getTodaySummary(@Req() req: any) {
    const userId = req.user?.id ?? 'default-user';
    return this.checkinService.getTodaySummary(userId);
  }

  /**
   * POST /api/v1/habits/{habitId}/checkin
   * 打卡
   */
  @Post('habits/:habitId/checkin')
  @HttpCode(201)
  async checkin(@Param('habitId') habitId: string, @Req() req: any) {
    const userId = req.user?.id ?? 'default-user';
    return this.checkinService.checkin(habitId, userId);
  }

  /**
   * DELETE /api/v1/habits/{habitId}/checkin
   * 取消打卡
   */
  @Delete('habits/:habitId/checkin')
  @HttpCode(200)
  async uncheckin(@Param('habitId') habitId: string, @Req() req: any) {
    const userId = req.user?.id ?? 'default-user';
    return this.checkinService.uncheckin(habitId, userId);
  }
}
