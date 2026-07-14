/**
 * 监控配置模块
 *
 * 集中管理 Sentry、Prometheus 等监控服务的配置项。
 * 所有配置优先从环境变量读取，提供合理的生产默认值。
 */

export interface MonitoringConfig {
  /** Sentry DSN（数据源名称），由 Sentry 项目提供 */
  sentryDsn: string;

  /** 生产环境采样率 0.0 ~ 1.0，建议 0.1 ~ 0.5 */
  tracesSampleRate: number;

  /** 环境标签，如 'production' | 'staging' | 'development' */
  environment: string;

  /** 应用版本号（来自 package.json 或 CI 注入） */
  release: string;

  /** Prometheus 指标采集端口（默认 9090） */
  metricsPort: number;

  /** 是否启用请求日志记录 */
  enableRequestLogging: boolean;

  /** 慢查询阈值（毫秒），超过此值的请求被标记为慢查询 */
  slowRequestThresholdMs: number;
}

function loadConfig(): MonitoringConfig {
  return {
    sentryDsn:
      process.env.SENTRY_DSN ||
      'https://examplePublicKey@o0.ingest.sentry.io/0',
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.2'),
    environment: process.env.NODE_ENV || 'development',
    release: process.env.APP_RELEASE || '1.0.0',
    metricsPort: parseInt(process.env.METRICS_PORT || '9090', 10),
    enableRequestLogging: process.env.ENABLE_REQUEST_LOGGING !== 'false',
    slowRequestThresholdMs: parseInt(
      process.env.SLOW_REQUEST_THRESHOLD_MS || '1000',
      10,
    ),
  };
}

export const monitoringConfig = loadConfig();

/**
 * 判断当前是否为生产环境
 */
export function isProduction(): boolean {
  return monitoringConfig.environment === 'production';
}
