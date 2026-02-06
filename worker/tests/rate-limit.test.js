/**
 * Tests for rate limiting middleware.
 * Uses mock D1 database to test atomic check-and-increment logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkRateLimit } from '../src/middleware/rateLimit.js';

function createMockDB(overrides = {}) {
  const defaultPrepare = vi.fn(() => ({
    bind: vi.fn(() => ({
      first: vi.fn().mockResolvedValue(null),
      run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
    })),
  }));

  return {
    prepare: overrides.prepare || defaultPrepare,
    ...overrides,
  };
}

describe('checkRateLimit', () => {
  it('rejects requests without license key', async () => {
    const result = await checkRateLimit('', {});
    expect(result.allowed).toBe(false);
    expect(result.message).toBe('MISSING_LICENSE_KEY');
  });

  it('rejects null license key', async () => {
    const result = await checkRateLimit(null, {});
    expect(result.allowed).toBe(false);
    expect(result.message).toBe('MISSING_LICENSE_KEY');
  });

  it('allows requests when no DB is available', async () => {
    const result = await checkRateLimit('test-key-12345678', {});
    expect(result.allowed).toBe(true);
  });

  it('allows requests under daily limit', async () => {
    const mockDB = createMockDB({
      prepare: vi.fn((sql) => {
        if (sql.includes('SUM')) {
          // Monthly check — under limit
          return {
            bind: vi.fn(() => ({
              first: vi.fn().mockResolvedValue({ total: 5 }),
            })),
          };
        }
        // Daily atomic upsert — success (1 row changed)
        return {
          bind: vi.fn(() => ({
            run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
          })),
        };
      }),
    });

    const result = await checkRateLimit('test-key-12345678', { DB: mockDB });
    expect(result.allowed).toBe(true);
  });

  it('blocks when daily limit reached', async () => {
    const mockDB = createMockDB({
      prepare: vi.fn((sql) => {
        if (sql.includes('SUM')) {
          return {
            bind: vi.fn(() => ({
              first: vi.fn().mockResolvedValue({ total: 5 }),
            })),
          };
        }
        // Daily atomic upsert — 0 changes means limit reached
        return {
          bind: vi.fn(() => ({
            run: vi.fn().mockResolvedValue({ meta: { changes: 0 } }),
          })),
        };
      }),
    });

    const result = await checkRateLimit('test-key-12345678', { DB: mockDB });
    expect(result.allowed).toBe(false);
    expect(result.message).toBe('DAILY_LIMIT_REACHED');
    expect(result.resetAt).toBeDefined();
  });

  it('blocks when monthly limit reached', async () => {
    const mockDB = createMockDB({
      prepare: vi.fn((sql) => {
        if (sql.includes('SUM')) {
          return {
            bind: vi.fn(() => ({
              first: vi.fn().mockResolvedValue({ total: 200 }),
            })),
          };
        }
        return {
          bind: vi.fn(() => ({
            run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
          })),
        };
      }),
    });

    const result = await checkRateLimit('test-key-12345678', { DB: mockDB });
    expect(result.allowed).toBe(false);
    expect(result.message).toBe('MONTHLY_LIMIT_REACHED');
    expect(result.resetAt).toBeDefined();
  });

  it('allows request when DB throws error (graceful degradation)', async () => {
    const mockDB = createMockDB({
      prepare: vi.fn(() => {
        throw new Error('DB connection failed');
      }),
    });

    const result = await checkRateLimit('test-key-12345678', { DB: mockDB });
    expect(result.allowed).toBe(true);
  });
});
