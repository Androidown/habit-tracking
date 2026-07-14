/**
 * 应用入口
 *
 * 加载所有中间件（Sentry、API Metrics、路由等）并启动 Express 服务器。
 * 中间件注册顺序至关重要：
 *   1. Sentry 请求处理器（最高优先级，为所有请求附加监控上下文）
 *   2. API 响应时间采集中间件
 *   3. 业务路由（打卡记录列表等）
 *   4. /metrics + /health 端点
 *   5. Sentry 全局错误处理器（最后注册，捕获所有未处理异常）
 */

import express from 'express';
import { initSentry, sentryRequestHandler, sentryErrorHandler, closeSentry } from './middleware/sentry';
import { apiMetricsMiddleware, metricsHandler } from './middleware/api-metrics';
import { monitoringConfig } from './config/monitoring';
import recordsRouter from './routes/api/v1/records';

// ---------------------------------------------------------------------------
// 初始化 Sentry（必须在创建 Express 应用之前）
// ---------------------------------------------------------------------------

initSentry();

// ---------------------------------------------------------------------------
// 创建 Express 应用
// ---------------------------------------------------------------------------

const app = express();
const PORT = process.env.PORT || 3000;

// ---- 解析请求体 ---------------------------------------------------------

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---- 第 1 层：Sentry 请求上下文 ------------------------------------------

app.use(sentryRequestHandler);

// ---- 第 2 层：API 指标采集 -----------------------------------------------

app.use(apiMetricsMiddleware);

// ---- 指标暴露端点（无需鉴权，但应由 Prometheus 内网访问） -------------------

app.get('/metrics', metricsHandler);

// ---- 第 3 层：业务路由 ----------------------------------------------------

app.use('/api/v1/records', recordsRouter);

// ---- 第 5 层：健康检查端点 ------------------------------------------------

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    environment: monitoringConfig.environment,
    timestamp: new Date().toISOString(),
  });
});

// ---- 第 6 层：Sentry 全局错误处理器（必须在路由之后，最后注册） -----------

app.use(sentryErrorHandler);

// ---------------------------------------------------------------------------
// 启动服务器
// ---------------------------------------------------------------------------

const server = app.listen(PORT, () => {
  console.log(
    `[${monitoringConfig.environment}] Server running on port ${PORT}`,
  );
});

// ---------------------------------------------------------------------------
// 优雅关闭
// ---------------------------------------------------------------------------

async function shutdown(signal: string): Promise<void> {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);

  server.close(async () => {
    await closeSentry();
    console.log('Shutdown complete.');
    process.exit(0);
  });

  // 强制关闭超时（30 秒后）
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export { app };
