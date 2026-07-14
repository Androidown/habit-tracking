import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { CheckinService } from '../checkin.service';
import { CheckinRepository } from '../checkin.repository';
import { HabitService } from '../../habit/habit.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  getWeekStartUTC,
  getWeekEndUTC,
  getTodayStartUTC,
  getTodayEndUTC,
} from '../../../common/utils/time';

// ===== Mock Helpers =====

const mockHabit = (overrides: any = {}) => ({
  id: 'habit-1',
  name: 'Test Habit',
  description: null,
  cycleType: 'weekly',
  cycleConfig: { weekly_target: 3 },
  userId: 'user-1',
  enabled: true,
  createdAt: new Date('2026-07-01T00:00:00Z'),
  updatedAt: new Date('2026-07-01T00:00:00Z'),
  ...overrides,
});

const mockCheckin = (overrides: any = {}) => ({
  id: 'checkin-1',
  habitId: 'habit-1',
  userId: 'user-1',
  checkinDate: getTodayStartUTC(),
  createdAt: new Date(),
  ...overrides,
});

// ===== Repository Mock Factory =====

const createMockRepo = () => ({
  countByHabitAndDateRange: jest.fn(),
  countDistinctHabitsByUserAndDate: jest.fn(),
  findByUserAndDate: jest.fn(),
  findByHabitAndDate: jest.fn(),
  create: jest.fn(),
  delete: jest.fn(),
});

const createMockHabitService = () => ({
  findEnabledByUser: jest.fn(),
  findByIdAndUser: jest.fn(),
});

// ===== Tests =====

describe('CheckinService', () => {
  let service: CheckinService;
  let mockRepo: ReturnType<typeof createMockRepo>;
  let mockHabitSvc: ReturnType<typeof createMockHabitService>;

  beforeEach(async () => {
    mockRepo = createMockRepo();
    mockHabitSvc = createMockHabitService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CheckinService,
        { provide: CheckinRepository, useValue: mockRepo },
        { provide: HabitService, useValue: mockHabitSvc },
        {
          provide: PrismaService,
          useValue: { $connect: jest.fn(), $disconnect: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<CheckinService>(CheckinService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ──────────────────────────────────────────────
  //  getWeeklyProgress
  // ──────────────────────────────────────────────

  describe('getWeeklyProgress', () => {
    it('should return completed = 0 and total = weekly_target when no checkins this week', async () => {
      mockHabitSvc.findByIdAndUser.mockResolvedValue(
        mockHabit({ cycleType: 'weekly', cycleConfig: { weekly_target: 3 } }),
      );
      mockRepo.countByHabitAndDateRange.mockResolvedValue(0);

      const result = await service.getWeeklyProgress('habit-1', 'user-1');

      expect(result).toEqual({ completed: 0, total: 3 });
      // Verify correct date range was used (current week Mon-Sun)
      const [habitId, userId, weekStart, weekEnd] =
        mockRepo.countByHabitAndDateRange.mock.calls[0];
      expect(habitId).toBe('habit-1');
      expect(userId).toBe('user-1');
      // weekStart should be Monday 00:00 UTC+8
      expect(weekStart.getTime()).toBe(getWeekStartUTC().getTime());
      // weekEnd should be Sunday 23:59 UTC+8
      expect(weekEnd.getTime()).toBe(getWeekEndUTC().getTime());
    });

    it('should return correct completed count after a single checkin', async () => {
      mockHabitSvc.findByIdAndUser.mockResolvedValue(
        mockHabit({ cycleType: 'weekly', cycleConfig: { weekly_target: 5 } }),
      );
      mockRepo.countByHabitAndDateRange.mockResolvedValue(1);

      const result = await service.getWeeklyProgress('habit-1', 'user-1');

      expect(result).toEqual({ completed: 1, total: 5 });
    });

    it('should cap completed at total (weekly_target)', async () => {
      mockHabitSvc.findByIdAndUser.mockResolvedValue(
        mockHabit({ cycleType: 'weekly', cycleConfig: { weekly_target: 3 } }),
      );
      mockRepo.countByHabitAndDateRange.mockResolvedValue(5); // more than target

      const result = await service.getWeeklyProgress('habit-1', 'user-1');

      expect(result).toEqual({ completed: 3, total: 3 });
    });

    it('should return total = 1 for daily cycle type', async () => {
      mockHabitSvc.findByIdAndUser.mockResolvedValue(
        mockHabit({ cycleType: 'daily', cycleConfig: null }),
      );
      mockRepo.countByHabitAndDateRange.mockResolvedValue(1);

      const result = await service.getWeeklyProgress('habit-1', 'user-1');

      expect(result).toEqual({ completed: 1, total: 1 });
    });

    it('should not count last week checkins in this weeks progress', async () => {
      mockHabitSvc.findByIdAndUser.mockResolvedValue(
        mockHabit({ cycleType: 'weekly', cycleConfig: { weekly_target: 3 } }),
      );
      // Only 1 checkin this week
      mockRepo.countByHabitAndDateRange.mockResolvedValue(1);

      const result = await service.getWeeklyProgress('habit-1', 'user-1');

      // Should be 1, not counting checkins from previous weeks
      expect(result.completed).toBe(1);
    });

    it('should throw NotFoundException for non-existent habit', async () => {
      mockHabitSvc.findByIdAndUser.mockRejectedValue(
        new NotFoundException('习惯不存在或已禁用'),
      );

      await expect(
        service.getWeeklyProgress('non-existent', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should handle weekly cycle with no cycle_config gracefully', async () => {
      mockHabitSvc.findByIdAndUser.mockResolvedValue(
        mockHabit({ cycleType: 'weekly', cycleConfig: null }),
      );
      mockRepo.countByHabitAndDateRange.mockResolvedValue(0);

      const result = await service.getWeeklyProgress('habit-1', 'user-1');

      // Default to total = 1 when no weekly_target configured
      expect(result).toEqual({ completed: 0, total: 1 });
    });
  });

  // ──────────────────────────────────────────────
  //  getTodaySummary
  // ──────────────────────────────────────────────

  describe('getTodaySummary', () => {
    it('should return correct summary for today', async () => {
      const habits = [
        mockHabit({ id: 'h1' }),
        mockHabit({ id: 'h2' }),
        mockHabit({ id: 'h3' }),
      ];
      const todayCheckins = [
        { habitId: 'h1' },
        { habitId: 'h2' },
      ];

      mockHabitSvc.findEnabledByUser.mockResolvedValue(habits);
      mockRepo.findByUserAndDate.mockResolvedValue(todayCheckins);

      const result = await service.getTodaySummary('user-1');

      expect(result).toEqual({
        total_todo: 3,
        completed: 2,
        completion_rate: 2 / 3,
      });
    });

    it('should return 0/0 when user has no habits', async () => {
      mockHabitSvc.findEnabledByUser.mockResolvedValue([]);
      mockRepo.findByUserAndDate.mockResolvedValue([]);

      const result = await service.getTodaySummary('user-1');

      expect(result).toEqual({
        total_todo: 0,
        completed: 0,
        completion_rate: 0,
      });
    });

    it('should return completed = 0 when no checkins today', async () => {
      mockHabitSvc.findEnabledByUser.mockResolvedValue([
        mockHabit({ id: 'h1' }),
        mockHabit({ id: 'h2' }),
      ]);
      mockRepo.findByUserAndDate.mockResolvedValue([]);

      const result = await service.getTodaySummary('user-1');

      expect(result).toEqual({
        total_todo: 2,
        completed: 0,
        completion_rate: 0,
      });
    });

    it('should query habits and checkins with Promise.all (same batch)', async () => {
      mockHabitSvc.findEnabledByUser.mockResolvedValue([]);
      mockRepo.findByUserAndDate.mockResolvedValue([]);

      await service.getTodaySummary('user-1');

      // Verify both queries were called (should be via Promise.all)
      expect(mockHabitSvc.findEnabledByUser).toHaveBeenCalledWith('user-1');
      expect(mockRepo.findByUserAndDate).toHaveBeenCalledWith(
        'user-1',
        expect.any(Date),
      );
    });
  });

  // ──────────────────────────────────────────────
  //  checkin (打卡)
  // ──────────────────────────────────────────────

  describe('checkin', () => {
    it('should create a checkin record successfully', async () => {
      mockHabitSvc.findByIdAndUser.mockResolvedValue(mockHabit());
      mockRepo.findByHabitAndDate.mockResolvedValue(null);
      mockRepo.create.mockResolvedValue(mockCheckin());

      const result = await service.checkin('habit-1', 'user-1');

      expect(mockRepo.create).toHaveBeenCalledWith({
        habitId: 'habit-1',
        userId: 'user-1',
        checkinDate: getTodayStartUTC(),
      });
      expect(result).toBeDefined();
      expect(result.id).toBe('checkin-1');
    });

    it('should throw ConflictException if already checked in today', async () => {
      mockHabitSvc.findByIdAndUser.mockResolvedValue(mockHabit());
      mockRepo.findByHabitAndDate.mockResolvedValue(mockCheckin());

      await expect(
        service.checkin('habit-1', 'user-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException for non-existent habit', async () => {
      mockHabitSvc.findByIdAndUser.mockRejectedValue(
        new NotFoundException('习惯不存在或已禁用'),
      );

      await expect(
        service.checkin('non-existent', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ──────────────────────────────────────────────
  //  uncheckin (取消打卡)
  // ──────────────────────────────────────────────

  describe('uncheckin', () => {
    it('should delete a checkin record successfully', async () => {
      mockRepo.findByHabitAndDate.mockResolvedValue(mockCheckin());
      mockRepo.delete.mockResolvedValue(undefined);

      const result = await service.uncheckin('habit-1', 'user-1');

      expect(mockRepo.delete).toHaveBeenCalledWith('checkin-1');
      expect(result).toEqual({ message: '打卡已取消' });
    });

    it('should throw NotFoundException if no checkin today', async () => {
      mockRepo.findByHabitAndDate.mockResolvedValue(null);

      await expect(
        service.uncheckin('habit-1', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
