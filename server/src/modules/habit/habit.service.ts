import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Habit } from '@prisma/client';

@Injectable()
export class HabitService {
  constructor(private readonly prisma: PrismaService) {}

  /** 查询用户所有已启用的习惯 */
  async findEnabledByUser(userId: string): Promise<Habit[]> {
    return this.prisma.habit.findMany({
      where: { userId, enabled: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** 按 ID 查询习惯（仅属于指定用户且已启用） */
  async findByIdAndUser(habitId: string, userId: string): Promise<Habit> {
    const habit = await this.prisma.habit.findFirst({
      where: { id: habitId, userId, enabled: true },
    });
    if (!habit) {
      throw new NotFoundException('习惯不存在或已禁用');
    }
    return habit;
  }
}
