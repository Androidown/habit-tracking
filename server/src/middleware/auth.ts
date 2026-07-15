/**
 * 认证中间件
 *
 * 从 Authorization 头或 X-User-ID 头中提取当前用户身份，
 * 注入到请求对象的 `userId` 属性中。
 *
 * 当前实现使用简化的 Bearer token 方案（token = user_id），
 * 后续可替换为完整的会话管理系统。
 */

import { Request, Response, NextFunction } from 'express';

// 扩展 Express Request 类型，添加 userId 属性
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/**
 * 认证中间件 - 验证请求携带有效的用户身份
 *
 * 支持两种身份传递方式（按优先级）：
 * 1. Authorization: Bearer <user_id>
 * 2. X-User-ID: <user_id>
 *
 * 认证失败时返回 401。
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const userId = extractUserId(req);

  if (!userId) {
    res.status(401).json({
      code: 401,
      message: 'AUTH_REQUIRED',
    });
    return;
  }

  req.userId = userId;
  next();
}

/**
 * 从请求中提取用户 ID。
 */
function extractUserId(req: Request): string | null {
  // 1. 优先尝试 Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }

  // 2. 尝试 X-User-ID header
  const userId = req.headers['x-user-id'];
  if (typeof userId === 'string' && userId.trim()) {
    return userId.trim();
  }

  return null;
}
