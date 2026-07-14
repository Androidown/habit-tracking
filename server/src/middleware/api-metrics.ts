/**
 * API 响应时间与错误率采集中间件
 *
 * 职责：
 * 1. 在每个请求完成后记录 duration_ms、method、path、status_code
 * 2. 使用 Prometheus 直方图记录响应时间分布（P50/P95/P99）
 * 3. 使用 Prometheus 计数器追踪请求总数与错误数（按端点分组）
 * 4. 暴露 /metrics 端点供 Prometheus 抓取
 */

import { Request, Response, NextFunction } from 'express';
import client from 'prom-client';
import { monitoringConfig } from '../config/monitoring';

// ---------------------------------------------------------------------------
// Prometheus 指标定义
// ---------------------------------------------------------------------------

/**
 * 请求总数计数器（按 method、path、status 分组）
 */
const httpRequestCounter = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status'] as const,
});

/**
 * 请求响应时间直方图（毫秒）
 *
 * buckets 覆盖 50ms ~ 5000ms，可计算出 P50/P95/P99
 */
const httpRequestDurationHistogram = new client.Histogram({
  name: 'http_request_duration_ms',
  help: 'HTTP request duration in milliseconds',
  labelNames: ['method', 'path'] as const,
  buckets: [
    50, 100, 250, 500, 750, 1000, 1500, 2000, 3000, 5000,
  ],
});

/**
 * 错误请求计数器（按 method、path、status_code 分组）
 */
const httpErrorCounter = new client.Counter({
  name: 'http_errors_total',
  help: 'Total number of HTTP error responses (4xx/5xx)',
  labelNames: ['method', 'path', 'status'] as const,
});

/**
 * 当前活跃请求数 Gauge
 */
const activeRequestsGauge = new client.Gauge({
  name: 'http_requests_active',
  help: 'Number of currently active HTTP requests',
});

/**
 * 慢查询计数器
 */
const slowRequestCounter = new client.Counter({
  name: 'http_slow_requests_total',
  help: 'Total number of slow HTTP requests',
  labelNames: ['method', 'path', 'duration_ms'] as const,
});

// ---------------------------------------------------------------------------
// 注册默认系统指标（CPU、内存、进程等）
// ---------------------------------------------------------------------------

function registerDefaultMetrics(): void {
  client.collectDefaultMetrics({
    prefix: 'habit_tracking_',
    gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
  });
}

registerDefaultMetrics();

// ---------------------------------------------------------------------------
// 请求计时中间件
// ---------------------------------------------------------------------------

/**
 * API 响应时间与状态码采集中间件
 *
 * 在每个请求完成后记录：
 * - duration_ms（响应耗时，毫秒）
 * - method
 * - path（归一化路径，不携带具体 ID）
 * - status_code
 */
export function apiMetricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const startTime = Date.now();
  const normalizedPath = normalizePath(req.path);

  activeRequestsGauge.inc();

  // 在响应结束时记录指标
  res.on('finish', () => {
    const durationMs = Date.now() - startTime;
    const statusCode = res.statusCode.toString();

    // 收集请求总数
    httpRequestCounter.inc({ method: req.method, path: normalizedPath, status: statusCode });

    // 收集响应时间
    httpRequestDurationHistogram.observe({ method: req.method, path: normalizedPath }, durationMs);

    // 收集错误请求（4xx/5xx）
    if (res.statusCode >= 400) {
      httpErrorCounter.inc({ method: req.method, path: normalizedPath, status: statusCode });
    }

    // 慢查询检测
    if (durationMs > monitoringConfig.slowRequestThresholdMs) {
      slowRequestCounter.inc({
        method: req.method,
        path: normalizedPath,
        duration_ms: Math.round(durationMs).toString(),
      });
    }

    activeRequestsGauge.dec();
  });

  next();
}

// ---------------------------------------------------------------------------
// 路由：暴露 Prometheus 指标
// ---------------------------------------------------------------------------

/**
 * 返回 Prometheus 格式的指标数据
 * 注册为 GET /metrics 路由
 */
export async function metricsHandler(
  _req: Request,
  res: Response,
): Promise<void> {
  res.set('Content-Type', client.register.contentType);
  const metrics = await client.register.metrics();
  res.end(metrics);
}

// ---------------------------------------------------------------------------
// 路径归一化工具
// ---------------------------------------------------------------------------

/**
 * 将动态路径参数替换为占位符，防止 Prometheus label 基数爆炸
 *
 * 例：
 *   /api/v1/users/123          → /api/v1/users/:id
 *   /api/v1/habits/456/records → /api/v1/habits/:id/records
 */
const ID_PATTERN = /\/[0-9a-f]{8,}(?=\/|$)/gi;
const UUID_PATTERN = /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\/|$)/gi;
const NUMERIC_PATTERN = /\/\d+(?=\/|$)/g;

export function normalizePath(path: string): string {
  let normalized = path
    .replace(UUID_PATTERN, '/:id')
    .replace(ID_PATTERN, '/:id')
    .replace(NUMERIC_PATTERN, '/:id');

  // 去除尾部斜杠
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }

  return normalized || '/';
}

// ---------------------------------------------------------------------------
// 注册表重置（用于测试）
// ---------------------------------------------------------------------------

/**
 * 清除所有已注册的指标（仅测试环境使用）
 */
export function resetMetricsRegistry(): void {
  client.register.clear();
}
