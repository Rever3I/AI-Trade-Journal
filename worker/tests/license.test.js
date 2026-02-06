/**
 * Tests for license key validation and activation routes.
 * Uses mock D1 database to test license operations.
 */

import { describe, it, expect, vi } from 'vitest';
import { handleLicenseRoutes } from '../src/routes/license.js';

// Mock jsonResponse import — in the actual code it's imported from index.js
// We need to test the route handlers directly, so we mock the dependency.
vi.mock('../src/index.js', () => ({
  jsonResponse: (data, status = 200) => {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  },
}));

function createRequest(body, method = 'POST') {
  return new Request('https://test.workers.dev/license/validate', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function createMockDB(queryResults = {}) {
  return {
    prepare: vi.fn((sql) => ({
      bind: vi.fn(() => ({
        first: vi.fn().mockResolvedValue(queryResults.first || null),
        run: vi.fn().mockResolvedValue(queryResults.run || { meta: { changes: 1 } }),
      })),
    })),
  };
}

describe('handleLicenseRoutes', () => {
  it('rejects non-POST requests', async () => {
    const request = new Request('https://test.workers.dev/license/validate', {
      method: 'GET',
    });
    const response = await handleLicenseRoutes(request, {}, '/license/validate');
    const data = await response.json();
    expect(response.status).toBe(405);
    expect(data.error).toBe('METHOD_NOT_ALLOWED');
  });

  it('returns 404 for unknown license paths', async () => {
    const request = createRequest({ key: 'test1234test1234' });
    const response = await handleLicenseRoutes(request, {}, '/license/unknown');
    expect(response.status).toBe(404);
  });
});

describe('/license/validate', () => {
  it('rejects invalid JSON body', async () => {
    const request = new Request('https://test.workers.dev/license/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    const response = await handleLicenseRoutes(request, {}, '/license/validate');
    const data = await response.json();
    expect(data.error).toBe('INVALID_JSON');
  });

  it('rejects empty key', async () => {
    const request = createRequest({ key: '' });
    const response = await handleLicenseRoutes(request, {}, '/license/validate');
    const data = await response.json();
    expect(response.status).toBe(400);
    expect(data.error).toBe('INVALID_KEY_FORMAT');
  });

  it('rejects key that is not 16 characters', async () => {
    const request = createRequest({ key: 'short' });
    const response = await handleLicenseRoutes(request, {}, '/license/validate');
    const data = await response.json();
    expect(response.status).toBe(400);
    expect(data.error).toBe('INVALID_KEY_FORMAT');
  });

  it('returns valid:false for non-existent key', async () => {
    const mockDB = createMockDB({ first: null });
    const request = createRequest({ key: 'abcd1234efgh5678' });
    const response = await handleLicenseRoutes(request, { DB: mockDB }, '/license/validate');
    const data = await response.json();
    expect(data.valid).toBe(false);
    expect(data.error).toBe('KEY_NOT_FOUND');
  });

  it('returns valid:true for active key', async () => {
    const mockDB = createMockDB({
      first: { key: 'abcd1234efgh5678', status: 'active', activated_at: '2026-01-01' },
    });
    const request = createRequest({ key: 'abcd1234efgh5678' });
    const response = await handleLicenseRoutes(request, { DB: mockDB }, '/license/validate');
    const data = await response.json();
    expect(data.valid).toBe(true);
    expect(data.status).toBe('active');
  });

  it('returns valid:false for revoked key', async () => {
    const mockDB = createMockDB({
      first: { key: 'abcd1234efgh5678', status: 'revoked', activated_at: null },
    });
    const request = createRequest({ key: 'abcd1234efgh5678' });
    const response = await handleLicenseRoutes(request, { DB: mockDB }, '/license/validate');
    const data = await response.json();
    expect(data.valid).toBe(false);
    expect(data.error).toBe('KEY_REVOKED');
  });
});

describe('/license/activate', () => {
  it('rejects key that is already active', async () => {
    const mockDB = createMockDB({
      first: { key: 'abcd1234efgh5678', status: 'active' },
    });
    const request = createRequest({ key: 'abcd1234efgh5678', notion_user_id: 'user-123' });
    const response = await handleLicenseRoutes(request, { DB: mockDB }, '/license/activate');
    const data = await response.json();
    expect(response.status).toBe(409);
    expect(data.error).toBe('KEY_ALREADY_ACTIVE');
  });

  it('rejects revoked key', async () => {
    const mockDB = createMockDB({
      first: { key: 'abcd1234efgh5678', status: 'revoked' },
    });
    const request = createRequest({ key: 'abcd1234efgh5678' });
    const response = await handleLicenseRoutes(request, { DB: mockDB }, '/license/activate');
    const data = await response.json();
    expect(response.status).toBe(403);
    expect(data.error).toBe('KEY_REVOKED');
  });
});
