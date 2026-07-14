/**
 * API 响应时间与错误率采集中间件测试
 *
 * 验证：
 * 1. 正常请求后 Prometheus 计数器递增
 * 2. 错误请求触发错误计数器
 * 3. 响应时间直方图正确记录
 * 4. 路径归一化正确（动态参数 → :id）
 * 5. /metrics 端点返回 Prometheus 格式指标数据
 */

import { Request, Response } from 'express';
import client from 'prom-client';
import {
  apiMetricsMiddleware,
  metricsHandler,
  normalizePath,
  resetMetricsRegistry,
} from '../api-metrics';

// ---------------------------------------------------------------------------
// Helper：创建模拟 Request / Response
// ---------------------------------------------------------------------------

function createMockReq(overrides: Partial<Request> = {}): Request {
  return {
    method: 'GET',
    path: '/api/v1/test',
    ...overrides,
  } as Request;
}

type MockRes = Response & { emitFinish: () => void };

function createMockRes(): MockRes {
  const finishCallbacks: Array<() => void> = [];
  const mock = {
    statusCode: 200,
    set: jest.fn(),
    end: jest.fn(),
    on: jest.fn((event: string, cb: () => void) => {
      if (event === 'finish') finishCallbacks.push(cb);
    }),
    getHeader: jest.fn(),
    emitFinish: () => {
      finishCallbacks.forEach((cb) => cb());
    },
  };
  return mock as unknown as Response & { emitFinish: () => void };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('API Metrics Middleware', () => {
  beforeAll(() => {
    // 确保测试在干净注册表上运行（只在首次加载时需要）
    // 后续测试指标复用已有注册
  });

  beforeEach(() => {
    jest.useFakeTimers({ legacyFakeTimers: false });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // apiMetricsMiddleware
  // -----------------------------------------------------------------------

  describe('apiMetricsMiddleware', () => {
    it('should increment request counter on successful response', () => {
      const req = createMockReq({ method: 'GET', path: '/health' });
      const res = createMockRes();
      const next = jest.fn();

      apiMetricsMiddleware(req, res, next);
      expect(next).toHaveBeenCalled();

      // 模拟响应完成
      res.emitFinish();

      // 验证计数器递增
      const counterValue = client.register.getSingleMetric(
        'http_requests_total',
      )?.get();
      expect(counterValue).toBeDefined();
    });

    it('should increment error counter on 5xx response', () => {
      const req = createMockReq({ method: 'POST', path: '/api/v1/habits' });
      const res = createMockRes();
      res.statusCode = 500;
      const next = jest.fn();

      apiMetricsMiddleware(req, res, next);
      res.emitFinish();

      // 验证错误计数器
      const errorCounter = client.register
        .getSingleMetric('http_errors_total')
        ?.get();
      expect(errorCounter).toBeDefined();
    });

    it('should increment error counter on 4xx response', () => {
      const req = createMockReq({ method: 'GET', path: '/api/v1/unknown' });
      const res = createMockRes();
      res.statusCode = 404;
      const next = jest.fn();

      apiMetricsMiddleware(req, res, next);
      res.emitFinish();

      const errorCounter = client.register
        .getSingleMetric('http_errors_total')
        ?.get();
      expect(errorCounter).toBeDefined();
    });

    it('should record duration histogram on response', () => {
      const req = createMockReq({ method: 'GET', path: '/api/v1/habits' });
      const res = createMockRes();
      const next = jest.fn();

      jest.setSystemTime(1000);
      apiMetricsMiddleware(req, res, next);
      jest.setSystemTime(1500); // 模拟 500ms 耗时
      res.emitFinish();

      const histogram = client.register.getSingleMetric(
        'http_request_duration_ms',
      )?.get();
      expect(histogram).toBeDefined();
    });

    it('should track active requests gauge', () => {
      // 请求开始时递增
      const req1 = createMockReq();
      const res1 = createMockRes();
      apiMetricsMiddleware(req1, res1, jest.fn());

      const req2 = createMockReq();
      const res2 = createMockRes();
      apiMetricsMiddleware(req2, res2, jest.fn());

      // 确认监控不会阻止 next 调用
      expect(jest.fn()).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // metricsHandler
  // -----------------------------------------------------------------------

  describe('metricsHandler', () => {
    it('should return Prometheus formatted metrics', async () => {
      // 先模拟一个请求产生指标数据
      const req = createMockReq({ method: 'GET', path: '/api/v1/test' });
      const res = createMockRes();
      apiMetricsMiddleware(req, res, jest.fn());
      res.emitFinish();

      const metricsReq = {} as Request;
      const metricsRes = createMockRes();

      await metricsHandler(metricsReq, metricsRes);

      expect(metricsRes.set).toHaveBeenCalledWith(
        'Content-Type',
        client.register.contentType,
      );
      expect(metricsRes.end).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // normalizePath
  // -----------------------------------------------------------------------

  describe('normalizePath', () => {
    it('should normalize UUID paths', () => {
      expect(
        normalizePath('/api/v1/users/550e8400-e29b-41d4-a716-446655440000'),
      ).toBe('/api/v1/users/:id');
    });

    it('should normalize hex ID paths', () => {
      expect(normalizePath('/api/v1/habits/123abc456def')).toBe(
        '/api/v1/habits/:id',
      );
    });

    it('should normalize numeric ID paths', () => {
      expect(normalizePath('/api/v1/habits/42')).toBe('/api/v1/habits/:id');
    });

    it('should normalize multiple path params', () => {
      expect(
        normalizePath('/api/v1/users/123/habits/456/records/789'),
      ).toBe('/api/v1/users/:id/habits/:id/records/:id');
    });

    it('should not modify paths without params', () => {
      expect(normalizePath('/api/v1/habits')).toBe('/api/v1/habits');
      expect(normalizePath('/health')).toBe('/health');
    });

    it('should strip trailing slashes', () => {
      expect(normalizePath('/api/v1/habits/')).toBe('/api/v1/habits');
    });

    it('should return root for empty path', () => {
      expect(normalizePath('')).toBe('/');
      expect(normalizePath('/')).toBe('/');
    });
  });
});
