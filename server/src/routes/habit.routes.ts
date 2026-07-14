/**
 * 习惯路由
 *
 * 注册 GET /api/v1/habits
 */
import { Router } from 'express';
import { HabitController } from '../controllers/habit.controller';
import { AuthMiddleware } from '../middleware/auth.middleware';

export function createHabitRoutes(
  habitController: HabitController,
  authMiddleware: AuthMiddleware,
): Router {
  const router = Router();

  // GET /api/v1/habits
  router.get(
    '/',
    authMiddleware.handle.bind(authMiddleware),
    habitController.list.bind(habitController),
  );

  return router;
}
