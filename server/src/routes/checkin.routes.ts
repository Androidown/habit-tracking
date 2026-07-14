/**
 * 打卡记录路由
 *
 * 注册 POST /api/v1/habits/:habitId/checkins
 */
import { Router } from 'express';
import { CheckinController } from '../controllers/checkin.controller';
import { AuthMiddleware } from '../middleware/auth.middleware';
import { OwnershipMiddleware } from '../middleware/ownership.middleware';

export function createCheckinRoutes(
  checkinController: CheckinController,
  authMiddleware: AuthMiddleware,
  ownershipMiddleware: OwnershipMiddleware,
): Router {
  // mergeParams: true 确保挂载路径中的 :habitId 参数传递到路由处理器
  const router = Router({ mergeParams: true });

  // POST /api/v1/habits/:habitId/checkins
  router.post(
    '/',
    authMiddleware.handle.bind(authMiddleware),
    ownershipMiddleware.handle.bind(ownershipMiddleware),
    checkinController.createCheckin.bind(checkinController),
  );

  return router;
}
