import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { CheckinRepository } from './checkin.repository';
import { PrismaService } from '../../common/prisma/prisma.service';
import { HabitService } from '../habit/habit.service';
import {
  getWeekStartUTC,
  getWeekEndUTC,
  getTodayStartUTC,
  getTodayEndUTC,
} from '../../common/utils/time';

export interface WeeklyProgress {
  completed: number;
  total: number;
}

export interface TodaySummary {
  total_todo: number;
  completed: number;
  completion_rate: number;
}

@Injectable()
export class CheckinService {
  constructor(
    private readonly checkinRepo: CheckinRepository,
    private readonly habitService: HabitService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 查询指定习惯的本周进度
   * - 自然周定义为周一 ~ 周日，UTC+8
   * - 从 checkins 表实时 COUNT 推导
   * - 每周一自动重置（新一周的 COUNT 重新从 0 开始）
   */
  async getWeeklyProgress(
    habitId: string,
    userId: string,
  ): Promise<WeeklyProgress> {
    const habit = await this.habitService.findByIdAndUser(habitId, userId);

    const weekStart = getWeekStartUTC();
    const weekEnd = getWeekEndUTC();

    const completed = await this.checkinRepo.countByHabitAndDateRange(
      habitId,
      userId,
      weekStart,
      weekEnd,
    );

    // daily 模式: 总目标为 1（每天完成一次即为达标）
    // weekly 模式: 总目标为 cycle_config.weekly_target
    let total = 1;
    if (habit.cycleType === 'weekly' && habit.cycleConfig) {
      const config = habit.cycleConfig as { weekly_target?: number };
      total = config.weekly_target ?? 1;
    }

    return { completed: Math.min(completed, total), total };
  }

  /**
   * 查询今日打卡概览
   * - total_todo: 用户已启用的习惯总数
   * - completed: 今日已打卡的不同习惯数
   */
  async getTodaySummary(userId: string): Promise<TodaySummary> {
    // 在同一批次内同时查询，避免异步时序导致数据不对齐
    const [habits, todayCheckins] = await Promise.all([
      this.habitService.findEnabledByUser(userId),
      this.checkinRepo.findByUserAndDate(userId, getTodayStartUTC()),
    ]);

    const totalTodo = habits.length;
    const completed = todayCheckins.length;

    return {
      total_todo: totalTodo,
      completed,
      completion_rate: totalTodo > 0 ? completed / totalTodo : 0,
    };
  }

  /**
   * 为指定习惯执行今日打卡
   * - 如果今日已打卡则返回 409 Conflict
   */
  async checkin(habitId: string, userId: string) {
    const habit = await this.habitService.findByIdAndUser(habitId, userId);
    const today = getTodayStartUTC();

    const existing = await this.checkinRepo.findByHabitAndDate(
      habitId,
      userId,
      today,
    );
    if (existing) {
      throw new ConflictException({
        error: 'already_checked_in',
        message: '今日已打卡',
      });
    }

    return this.checkinRepo.create({
      habitId,
      userId,
      checkinDate: today,
    });
  }

  /**
   * 取消指定习惯的今日打卡
   */
  async uncheckin(habitId: string, userId: string) {
    const today = getTodayStartUTC();
    const existing = await this.checkinRepo.findByHabitAndDate(
      habitId,
      userId,
      today,
    );
    if (!existing) {
      throw new NotFoundException({
        error: 'checkin_not_found',
        message: '今日无打卡记录可取消',
      });
    }

    await this.checkinRepo.delete(existing.id);
    return { message: '打卡已取消' };
  }
}
