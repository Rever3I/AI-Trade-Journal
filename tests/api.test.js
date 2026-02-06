/**
 * API Client Tests
 *
 * Tests for the Cloudflare Worker proxy client that handles
 * trade parsing, analysis, license management, and Notion operations.
 * Uses the global fetch mock from setup.js.
 */

import {
  parseTrades,
  analyzeTrades,
  activateLicense,
  validateLicense,
  getUsageInfo,
  healthCheck,
  ApiError,
  WORKER_URL,
} from '@lib/api.js';

describe('API client', () => {
  describe('parseTrades', () => {
    it('should send correct request body with raw text', async () => {
      globalThis.__mockFetchResponses.push({
        ok: true,
        status: 200,
        body: { trades: [{ symbol: 'NVDA', action: 'BUY' }] },
      });

      await parseTrades('bought 100 NVDA at 135.50');

      expect(fetch).toHaveBeenCalledTimes(1);
      const [url, options] = fetch.mock.calls[0];
      expect(url).toBe(`${WORKER_URL}/api/parse`);
      expect(options.method).toBe('POST');
      const body = JSON.parse(options.body);
      expect(body.text).toBe('bought 100 NVDA at 135.50');
    });

    it('should return parsed trades on success', async () => {
      const mockTrades = [
        { symbol: 'NVDA', action: 'BUY', quantity: 100, price: 135.50 },
        { symbol: 'NVDA', action: 'SELL', quantity: 100, price: 142.30 },
      ];
      globalThis.__mockFetchResponses.push({
        ok: true,
        status: 200,
        body: { trades: mockTrades },
      });

      const result = await parseTrades('some raw text');
      expect(result.trades).toEqual(mockTrades);
    });

    it('should throw ApiError on non-200 response', async () => {
      globalThis.__mockFetchResponses.push({
        ok: false,
        status: 500,
        body: { error: { code: 'PARSE_FAILED', message: 'Could not parse' } },
      });

      await expect(parseTrades('garbage data')).rejects.toThrow(ApiError);
      try {
        globalThis.__mockFetchResponses.push({
          ok: false,
          status: 500,
          body: { error: { code: 'PARSE_FAILED', message: 'fail' } },
        });
        await parseTrades('garbage');
      } catch (err) {
        expect(err.code).toBe('PARSE_FAILED');
        expect(err.statusCode).toBe(500);
      }
    });

    it('should throw ApiError with TIMEOUT code on AbortError', async () => {
      // Override fetch to throw AbortError
      const origFetch = globalThis.fetch;
      globalThis.fetch = vi.fn(() => {
        const err = new DOMException('The operation was aborted', 'AbortError');
        return Promise.reject(err);
      });

      try {
        await expect(parseTrades('text')).rejects.toThrow(ApiError);
        try {
          await parseTrades('text');
        } catch (err) {
          expect(err.code).toBe('TIMEOUT');
        }
      } finally {
        globalThis.fetch = origFetch;
      }
    });
  });

  describe('analyzeTrades', () => {
    it('should send correct request body with template type', async () => {
      globalThis.__mockFetchResponses.push({
        ok: true,
        status: 200,
        body: { analysis: { summary: 'good day' } },
      });

      const trades = [{ symbol: 'NVDA', action: 'BUY', quantity: 100, price: 135.50 }];
      await analyzeTrades(trades, 'daily_review', { total_trades: 50 });

      const [url, options] = fetch.mock.calls[0];
      expect(url).toBe(`${WORKER_URL}/api/analyze`);
      const body = JSON.parse(options.body);
      expect(body.trades).toEqual(trades);
      expect(body.analysis_type).toBe('daily_review');
      expect(body.user_history_summary).toEqual({ total_trades: 50 });
    });

    it('should return analysis result on success', async () => {
      const mockAnalysis = {
        analysis_type: 'daily_review',
        summary: 'Profitable day with good discipline',
        score: 85,
        metrics: { win_rate: 0.65 },
      };
      globalThis.__mockFetchResponses.push({
        ok: true,
        status: 200,
        body: mockAnalysis,
      });

      const result = await analyzeTrades([], 'daily_review');
      expect(result.summary).toBe('Profitable day with good discipline');
      expect(result.score).toBe(85);
    });
  });

  describe('activateLicense', () => {
    it('should send license key in request body', async () => {
      globalThis.__mockFetchResponses.push({
        ok: true,
        status: 200,
        body: { status: 'active', key: 'ABCD-1234-EFGH-5678' },
      });

      await activateLicense('ABCD-1234-EFGH-5678');

      const [url, options] = fetch.mock.calls[0];
      expect(url).toBe(`${WORKER_URL}/api/license/activate`);
      const body = JSON.parse(options.body);
      expect(body.key).toBe('ABCD-1234-EFGH-5678');
    });

    it('should throw ApiError with INVALID_LICENSE code for invalid key', async () => {
      globalThis.__mockFetchResponses.push({
        ok: false,
        status: 400,
        body: { error: { code: 'INVALID_LICENSE', message: 'License not found' } },
      });

      try {
        await activateLicense('XXXX-XXXX-XXXX-XXXX');
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        expect(err.code).toBe('INVALID_LICENSE');
        expect(err.statusCode).toBe(400);
      }
    });

    it('should throw ApiError with LICENSE_ALREADY_USED code for used key', async () => {
      globalThis.__mockFetchResponses.push({
        ok: false,
        status: 409,
        body: { error: { code: 'LICENSE_ALREADY_USED', message: 'Already activated' } },
      });

      try {
        await activateLicense('USED-KEY0-USED-KEY0');
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        expect(err.code).toBe('LICENSE_ALREADY_USED');
        expect(err.statusCode).toBe(409);
      }
    });
  });

  describe('validateLicense', () => {
    it('should send GET request with license key in headers', async () => {
      // Seed license key so the request helper includes it
      globalThis.__seedStorage({
        license_key: 'ABCD-1234-EFGH-5678',
        license_status: 'active',
      });

      globalThis.__mockFetchResponses.push({
        ok: true,
        status: 200,
        body: { valid: true, status: 'active' },
      });

      const result = await validateLicense();

      const [url, options] = fetch.mock.calls[0];
      expect(url).toBe(`${WORKER_URL}/api/license/validate`);
      expect(options.method).toBe('GET');
      expect(options.headers['X-License-Key']).toBe('ABCD-1234-EFGH-5678');
      expect(result.valid).toBe(true);
    });
  });

  describe('getUsageInfo', () => {
    it('should return usage data', async () => {
      globalThis.__mockFetchResponses.push({
        ok: true,
        status: 200,
        body: { used: 3, limit: 10, date: '2024-01-15' },
      });

      const result = await getUsageInfo();
      expect(result.used).toBe(3);
      expect(result.limit).toBe(10);
    });
  });

  describe('Error mapping', () => {
    it('should map RATE_LIMIT_EXCEEDED to Chinese rate limit message', async () => {
      globalThis.__mockFetchResponses.push({
        ok: false,
        status: 429,
        body: { error: { code: 'RATE_LIMIT_EXCEEDED', used: 10, limit: 10 } },
      });

      try {
        await parseTrades('text');
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        expect(err.code).toBe('RATE_LIMIT_EXCEEDED');
        // Default locale is zh_CN, so message should be in Chinese
        expect(err.message).toContain('免费分析已用完');
      }
    });

    it('should map network errors to Chinese network message', async () => {
      const origFetch = globalThis.fetch;
      globalThis.fetch = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')));

      try {
        await expect(parseTrades('text')).rejects.toThrow(ApiError);
        try {
          await parseTrades('text');
        } catch (err) {
          expect(err.code).toBe('NETWORK_ERROR');
          expect(err.message).toContain('网络');
        }
      } finally {
        globalThis.fetch = origFetch;
      }
    });
  });

  describe('healthCheck', () => {
    it('should use a short timeout for health check', async () => {
      globalThis.__mockFetchResponses.push({
        ok: true,
        status: 200,
        body: { status: 'ok' },
      });

      const result = await healthCheck();

      const [url] = fetch.mock.calls[0];
      expect(url).toBe(`${WORKER_URL}/health`);
      expect(result.status).toBe('ok');
    });
  });
});
