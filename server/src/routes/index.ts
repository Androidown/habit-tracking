/**
 * 路由聚合
 *
 * 将所有业务路由注册到 Express 应用。
 */
import { Express } from 'express';
import { createHabitRoutes } from './habit.routes';
import { HabitModel } from '../models/habit.model';
import { HabitService } from '../services/habit.service';
import { HabitController } from '../controllers/habit.controller';
import { AuthMiddleware } from '../middleware/auth.middleware';
import Database from 'better-sqlite3';

export function registerRoutes(app: Express, db: Database.Database): void {
  // 初始化模型
  const habitModel = new HabitModel(db);

  // 初始化服务
  const habitService = new HabitService(habitModel);

  // 初始化控制器
  const habitController = new HabitController(habitService);

  // 初始化中间件
  const authMiddleware = new AuthMiddleware(db);

  // 注册路由
  const habitRoutes = createHabitRoutes(habitController, authMiddleware);

  app.use('/api/v1/habits', habitRoutes);
}
