/**
 * 会话认证中间件
 *
 * 从 session_id cookie 或 Authorization: Bearer <session_id> 头中
 * 提取会话 ID，验证会话有效性，并将用户 ID 注入请求对象。
 */

import { Request, Response, NextFunction } from 'express';
import Database from 'better-sqlite3';
import { getDatabase } from '../db';

// ---------------------------------------------------------------------------
// 类型扩展
// ---------------------------------------------------------------------------

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

// ---------------------------------------------------------------------------
// 中间件
// ---------------------------------------------------------------------------

/**
 * 会话认证中间件工厂
 *
 * @param db 数据库实例（可选，默认从 getDatabase() 获取）
 */
export function authMiddleware(db?: Database.Database) {
  const database = db || getDatabase();

  return (req: Request, res: Response, next: NextFunction): void => {
    const sessionId = extractSessionID(req);

    if (!sessionId) {
      res.status(401).json({
        code: 401,
        message: 'AUTH_REQUIRED',
      });
      return;
    }

    const row = database
      .prepare('SELECT user_id, expires_at FROM sessions WHERE id = ?')
      .get(sessionId) as { user_id: string; expires_at: string } | undefined;

    if (!row) {
      res.status(401).json({
        code: 401,
        message: 'AUTH_REQUIRED',
      });
      return;
    }

    // 检查会话是否过期
    const now = new Date();
    const expiresAt = new Date(row.expires_at);
    if (now > expiresAt) {
      res.status(401).json({
        code: 401,
        message: 'SESSION_EXPIRED',
      });
      return;
    }

    // 注入用户 ID
    req.userId = row.user_id;
    next();
  };
}

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

/**
 * 从请求中提取会话 ID
 * 优先从 cookie 获取，回退到 Authorization header
 */
function extractSessionID(req: Request): string | undefined {
  // Try cookie first
  if (req.headers.cookie) {
    const cookies = parseCookies(req.headers.cookie);
    if (cookies.session_id) {
      return cookies.session_id;
    }
  }

  // Try Authorization header: Bearer <session_id>
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  return undefined;
}

/**
 * 简易 cookie 解析器
 */
function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const pair of cookieHeader.split(';')) {
    const [key, ...rest] = pair.trim().split('=');
    if (key && rest.length > 0) {
      cookies[key.trim()] = rest.join('=').trim();
    }
  }
  return cookies;
}
