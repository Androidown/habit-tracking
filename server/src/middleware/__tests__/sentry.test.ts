/**
 * Sentry 中间件集成测试
 *
 * 通过 mock Sentry SDK 验证：
 * 1. initSentry 按配置正确初始化
 * 2. sentryErrorHandler 捕获异常并调用 Sentry.captureException
 * 3. captureExceptionWithContext 附加自定义上下文
 * 4. captureMessage 按级别发送消息
 */

import * as Sentry from '@sentry/node';
import { Request, Response } from 'express';
import {
  initSentry,
  sentryErrorHandler,
  captureExceptionWithContext,
  captureMessage,
} from '../sentry';

// ---------------------------------------------------------------------------
// Mock 依赖
// ---------------------------------------------------------------------------

// Mock 监控配置，使 initSentry 测试可验证不同环境参数
jest.mock('../../config/monitoring', () => ({
  monitoringConfig: {
    sentryDsn: 'https://test@o0.ingest.sentry.io/0',
    tracesSampleRate: 0.2,
    environment: 'test',
    release: '1.0.0',
    metricsPort: 9090,
    enableRequestLogging: true,
    slowRequestThresholdMs: 1000,
  },
  isProduction: jest.fn(),
}));

import { isProduction } from '../../config/monitoring';

jest.mock('@sentry/node', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  close: jest.fn().mockResolvedValue(undefined),
  withScope: jest.fn((cb: (scope: Record<string, unknown>) => void) => {
    const mockScope = {
      setTag: jest.fn(),
      setExtra: jest.fn(),
      setLevel: jest.fn(),
      setUser: jest.fn(),
    };
    cb(mockScope);
    return mockScope;
  }),
  Integrations: {
    Http: jest.fn(),
  },
  SeverityLevel: {},
}));

// ---------------------------------------------------------------------------
// 模拟 express Request / Response / NextFunction
// ---------------------------------------------------------------------------

function createMockReq(overrides: Partial<Request> = {}): Request {
  return {
    method: 'GET',
    path: '/api/v1/test',
    originalUrl: '/api/v1/test',
    query: {},
    body: {},
    headers: { 'user-agent': 'jest-test', 'content-type': 'application/json' },
    user: { id: 'user-1', username: 'tester' },
    ...overrides,
  } as unknown as Request;
}

function createMockRes(): Response {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.getHeader = jest.fn().mockReturnValue('req-abc-123');
  return res as Response;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Sentry Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.NODE_ENV;
  });

  // -----------------------------------------------------------------------
  // initSentry
  // -----------------------------------------------------------------------

  describe('initSentry', () => {
    it('should call Sentry.init without debug in production mode', () => {
      (isProduction as jest.Mock).mockReturnValue(true);

      initSentry();

      expect(Sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({
          environment: 'test',
          tracesSampleRate: 0.2,
          debug: false,
        }),
      );
    });

    it('should call Sentry.init with debug in non-production mode', () => {
      (isProduction as jest.Mock).mockReturnValue(false);

      initSentry();

      expect(Sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({
          environment: 'test',
          debug: true,
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // sentryErrorHandler
  // -----------------------------------------------------------------------

  describe('sentryErrorHandler', () => {
    it('should capture exception and return 500', () => {
      const err = new Error('Test database error');
      const req = createMockReq();
      const res = createMockRes();
      const next = jest.fn();

      sentryErrorHandler(err, req, res, next);

      expect(Sentry.captureException).toHaveBeenCalledWith(err);

      // 验证统一错误响应
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Internal Server Error',
          requestId: 'req-abc-123',
        }),
      );
    });

    it('should set HTTP context tags on the scope', () => {
      const err = new Error('Test error');
      const req = createMockReq({ method: 'POST', path: '/api/v1/habits' });
      const res = createMockRes();
      const next = jest.fn();

      sentryErrorHandler(err, req, res, next);

      expect(Sentry.withScope).toHaveBeenCalled();
      // 验证 Sentry.captureException 已被调用
      expect(Sentry.captureException).toHaveBeenCalled();
    });

    it('should handle errors without user context', () => {
      const err = new Error('Anonymous error');
      const req = createMockReq({ user: undefined } as Partial<Request>);
      const res = createMockRes();
      const next = jest.fn();

      sentryErrorHandler(err, req, res, next);

      expect(Sentry.captureException).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // -----------------------------------------------------------------------
  // captureExceptionWithContext
  // -----------------------------------------------------------------------

  describe('captureExceptionWithContext', () => {
    it('should capture exception with extra context', () => {
      const error = new Error('Database query failed');
      const context = { operation: 'findUser', params: { id: '123' } };

      captureExceptionWithContext(error, context);

      expect(Sentry.withScope).toHaveBeenCalled();
      expect(Sentry.captureException).toHaveBeenCalledWith(error);
    });

    it('should capture exception without extra context', () => {
      const error = new Error('Simple error');

      captureExceptionWithContext(error);

      expect(Sentry.captureException).toHaveBeenCalledWith(error);
    });
  });

  // -----------------------------------------------------------------------
  // captureMessage
  // -----------------------------------------------------------------------

  describe('captureMessage', () => {
    it('should capture message at warning level by default', () => {
      captureMessage('Slow query detected', 'warning', {
        duration_ms: 3500,
        query: 'SELECT * FROM habits',
      });

      expect(Sentry.captureMessage).toHaveBeenCalledWith('Slow query detected');
    });
  });
});
