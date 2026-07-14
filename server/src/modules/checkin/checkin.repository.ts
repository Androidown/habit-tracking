import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Checkin } from '@prisma/client';

@Injectable()
export class CheckinRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** 查询指定习惯在指定日期范围内的打卡记录数 */
  async countByHabitAndDateRange(
    habitId: string,
    userId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    return this.prisma.checkin.count({
      where: {
        habitId,
        userId,
        checkinDate: {
          gte: startDate,
          lte: endDate,
        },
      },
    });
  }

  /** 查询用户今日已打卡的习惯数（去重 habit_id） */
  async countDistinctHabitsByUserAndDate(
    userId: string,
    date: Date,
  ): Promise<number> {
    const result = await this.prisma.checkin.groupBy({
      by: ['habitId'],
      where: {
        userId,
        checkinDate: date,
      },
      _count: { habitId: true },
    });
    return result.length;
  }

  /** 查询用户今日全部打卡记录（含 habit_id 列表） */
  async findByUserAndDate(
    userId: string,
    date: Date,
  ): Promise<Pick<Checkin, 'habitId'>[]> {
    return this.prisma.checkin.findMany({
      where: { userId, checkinDate: date },
      select: { habitId: true },
    });
  }

  /** 查询用户某习惯在今日的打卡记录 */
  async findByHabitAndDate(
    habitId: string,
    userId: string,
    date: Date,
  ): Promise<Checkin | null> {
    return this.prisma.checkin.findFirst({
      where: { habitId, userId, checkinDate: date },
    });
  }

  /** 创建打卡记录 */
  async create(data: {
    habitId: string;
    userId: string;
    checkinDate: Date;
  }): Promise<Checkin> {
    return this.prisma.checkin.create({ data });
  }

  /** 删除打卡记录 */
  async delete(id: string): Promise<void> {
    await this.prisma.checkin.delete({ where: { id } });
  }
}
