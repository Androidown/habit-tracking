/**
 * Sentry 错误日志聚合中间件
 *
 * 职责：
 * 1. 初始化 Sentry Node.js SDK（配置 DSN、采样率、环境标签）
 * 2. 提供全局异常捕获中间件（优先级最高，确保捕获所有未处理异常）
 * 3. 为每个异常附加上下文信息（method、path、user id）
 * 4. 提供手动上报工具函数，用于关键路径主动捕获
 */

import * as Sentry from '@sentry/node';
import { Request, Response, NextFunction } from 'express';
import { monitoringConfig, isProduction } from '../config/monitoring';

// ---------------------------------------------------------------------------
// 类型扩展
// ---------------------------------------------------------------------------

// Express Request 扩展 user 属性（由认证中间件注入）
interface AuthenticatedRequest extends Request {
  user?: {
    id?: string;
    username?: string;
    [key: string]: unknown;
  };
}

// ---------------------------------------------------------------------------
// 初始化
// ---------------------------------------------------------------------------

/**
 * 初始化 Sentry SDK
 *
 * 应在应用启动的最早阶段调用，确保 SDK 在加载其他中间件前完成配置。
 */
export function initSentry(): void {
  Sentry.init({
    dsn: monitoringConfig.sentryDsn,
    environment: monitoringConfig.environment,
    release: monitoringConfig.release,
    tracesSampleRate: monitoringConfig.tracesSampleRate,

    // 只在生产环境开启性能追踪
    integrations: isProduction()
      ? [new Sentry.Integrations.Http({ tracing: true })]
      : [],

    // 生产环境不发送 debug 日志
    debug: !isProduction(),
  });
}

// ---------------------------------------------------------------------------
// 请求上下文附件中间件
// ---------------------------------------------------------------------------

/**
 * 为每个请求设置 Sentry 作用域上下文
 *
 * 优先级最高，在路由和业务中间件之前注册。
 */
export function sentryRequestHandler(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): void {
  Sentry.setExtra('query_params', req.query);
  Sentry.setExtra('url', req.originalUrl);

  if (req.user) {
    Sentry.setUser({
      id: req.user.id,
      username: req.user.username,
    });
  }

  next();
}

// ---------------------------------------------------------------------------
// 全局异常捕获中间件
// ---------------------------------------------------------------------------

/**
 * Express 错误处理中间件
 *
 * - 捕获所有未处理的异常并上报至 Sentry
 * - 自动附加 HTTP 请求上下文（method、path、status code）
 * - 始终放在路由和业务中间件之后注册
 */
export function sentryErrorHandler(
  err: Error,
  req: AuthenticatedRequest,
  res: Response,
  _next: NextFunction,
): void {
  Sentry.withScope((scope) => {
    scope.setTag('http_method', req.method);
    scope.setTag('http_path', req.path);
    scope.setExtra('request_body', JSON.stringify(req.body || {}));
    scope.setExtra('request_headers', {
      'user-agent': req.headers['user-agent'],
      'content-type': req.headers['content-type'],
    });

    if (req.user) {
      scope.setUser({
        id: req.user.id,
        username: req.user.username,
      });
    }

    Sentry.captureException(err);
  });

  // 返回统一的错误响应格式
  res.status(500).json({
    error: 'Internal Server Error',
    requestId: (res.getHeader('x-request-id') as string) || undefined,
  });
}

// ---------------------------------------------------------------------------
// 手动上报工具函数
// ---------------------------------------------------------------------------

/**
 * 主动上报异常至 Sentry（用于数据库查询失败、第三方 API 调用异常等关键路径）
 *
 * @param error    捕获的错误对象
 * @param context  附加上下文（如操作名称、参数等）
 */
export function captureExceptionWithContext(
  error: Error,
  context?: Record<string, unknown>,
): void {
  Sentry.withScope((scope) => {
    if (context) {
      Object.entries(context).forEach(([key, value]) => {
        scope.setExtra(key, value);
      });
    }
    Sentry.captureException(error);
  });
}

/**
 * 上报一条自定义消息（用于非异常但值得关注的场景，如慢查询、拒绝率过高等）
 *
 * @param message  消息内容
 * @param level    日志级别
 * @param context  附加上下文
 */
export function captureMessage(
  message: string,
  level: Sentry.SeverityLevel = 'warning',
  context?: Record<string, unknown>,
): void {
  Sentry.withScope((scope) => {
    if (context) {
      Object.entries(context).forEach(([key, value]) => {
        scope.setExtra(key, value);
      });
    }
    scope.setLevel(level);
    Sentry.captureMessage(message);
  });
}

// ---------------------------------------------------------------------------
// 优雅关闭
// ---------------------------------------------------------------------------

/**
 * 关闭 Sentry SDK（应用退出前调用，确保事件队列被 flush）
 */
export async function closeSentry(): Promise<void> {
  await Sentry.close(2000);
}
