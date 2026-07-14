/**
 * 路由聚合
 *
 * 将所有业务路由注册到 Express 应用。
 */
import { Express } from 'express';
import { createCheckinRoutes } from './checkin.routes';
import { CheckinModel } from '../models/checkin.model';
import { HabitModel } from '../models/habit.model';
import { CheckinService } from '../services/checkin.service';
import { CheckinController } from '../controllers/checkin.controller';
import { AuthMiddleware } from '../middleware/auth.middleware';
import { OwnershipMiddleware } from '../middleware/ownership.middleware';
import Database from 'better-sqlite3';

export function registerRoutes(app: Express, db: Database.Database): void {
  // 初始化模型
  const habitModel = new HabitModel(db);
  const checkinModel = new CheckinModel(db);

  // 初始化服务
  const checkinService = new CheckinService(habitModel, checkinModel);

  // 初始化控制器
  const checkinController = new CheckinController(checkinService);

  // 初始化中间件
  const authMiddleware = new AuthMiddleware(db);
  const ownershipMiddleware = new OwnershipMiddleware(db);

  // 注册路由
  const checkinRoutes = createCheckinRoutes(
    checkinController,
    authMiddleware,
    ownershipMiddleware,
  );

  app.use('/api/v1/habits/:habitId/checkins', checkinRoutes);
}
