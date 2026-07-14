/**
 * 打卡记录列表查询路由
 *
 * 定义 GET /api/v1/records 端点，使用认证中间件保护。
 */

import { Router } from 'express';
import { authMiddleware } from '../../../middleware/auth';
import { RecordsController } from '../../../controllers/records';
import { RecordService } from '../../../services/record-service';
import { getDatabase } from '../../../db';

// ---------------------------------------------------------------------------
// 路由初始化
// ---------------------------------------------------------------------------

const router = Router();

// 依赖初始化
const db = getDatabase();
const recordService = new RecordService(db);
const recordsController = new RecordsController(recordService);

// GET /api/v1/records — 查询打卡记录列表（需认证）
router.get('/', authMiddleware(), recordsController.list);

export default router;
