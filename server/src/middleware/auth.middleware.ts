/**
 * 身份认证中间件
 *
 * 从 Cookie 中提取 session_id，校验 Session 有效性后将会话中的用户 ID
 * 附着到 `req.userId` 属性上，供下游处理器使用。
 */

import { Request, Response, NextFunction } from 'express';
import Database from 'better-sqlite3';
import { AppError, ErrorCodes } from '../utils/errors';
import { sendError } from '../utils/response';

// 扩展 Express Request 类型
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export class AuthMiddleware {
  constructor(private db: Database.Database) {}

  /**
   * 中间件处理函数。
   * 从 Cookie 中读取 session_id，查询并校验有效期。
   */
  handle(req: Request, res: Response, next: NextFunction): void {
    try {
      const sessionId = req.cookies?.session_id;

      if (!sessionId) {
        // 也尝试从 Authorization Header 读取
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          throw new AppError(ErrorCodes.UNAUTHORIZED, 'UNAUTHORIZED');
        }
        const token = authHeader.slice(7);
        if (!token) {
          throw new AppError(ErrorCodes.UNAUTHORIZED, 'UNAUTHORIZED');
        }

        // Bearer token = session_id
        const session = this.db
          .prepare('SELECT * FROM sessions WHERE id = ?')
          .get(token) as { id: string; user_id: string; expires_at: string } | undefined;

        if (!session) {
          throw new AppError(ErrorCodes.UNAUTHORIZED, 'UNAUTHORIZED');
        }
        if (new Date(session.expires_at) < new Date()) {
          throw new AppError(ErrorCodes.UNAUTHORIZED, 'SESSION_EXPIRED');
        }

        req.userId = session.user_id;
        next();
        return;
      }

      const session = this.db
        .prepare('SELECT * FROM sessions WHERE id = ?')
        .get(sessionId) as { id: string; user_id: string; expires_at: string } | undefined;

      if (!session) {
        throw new AppError(ErrorCodes.UNAUTHORIZED, 'UNAUTHORIZED');
      }
      if (new Date(session.expires_at) < new Date()) {
        throw new AppError(ErrorCodes.UNAUTHORIZED, 'SESSION_EXPIRED');
      }

      req.userId = session.user_id;
      next();
    } catch (err) {
      sendError(res, err as Error);
    }
  }
}
