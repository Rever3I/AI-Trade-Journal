/**
 * AI Trade Journal — Cloudflare Worker entry point.
 *
 * Main router with CORS middleware, structured JSON logging,
 * authentication, and route dispatch.
 *
 * Routes:
 *   POST /api/parse              → claude.parseTrades
 *   POST /api/analyze            → claude.analyzeTrades
 *   POST /api/license/activate   → license.activateLicense
 *   GET  /api/license/validate   → license.validateLicense
 *   GET  /api/license/usage      → license.getLicenseUsage
 *   GET  /api/notion/auth-url    → notion.getAuthUrl
 *   GET  /api/notion/callback    → notion.handleOAuthCallback
 *   GET  /api/notion/status      → notion.getNotionStatus
 *   POST /api/notion/create-database → notion.createDatabase
 *   POST /api/notion/sync        → notion.syncTrades
 *   POST /api/notion/save-analysis   → notion.saveAnalysis
 *   GET  /health                 → health check
 */

import { authenticate } from './middleware/auth.js';
import { parseTrades, analyzeTrades } from './routes/claude.js';
import { activateLicense, validateLicense, getLicenseUsage } from './routes/license.js';
import {
  getAuthUrl,
  handleOAuthCallback,
  getNotionStatus,
  createDatabase,
  syncTrades,
  saveAnalysis,
} from './routes/notion.js';

// ---------------------------------------------------------------------------
// CORS helpers
// ---------------------------------------------------------------------------

/**
 * Build CORS headers based on the request origin and env config.
 *
 * @param {Request} request
 * @param {{ ALLOWED_ORIGIN?: string }} env
 * @returns {Record<string, string>}
 */
function getCorsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowedOrigin = env.ALLOWED_ORIGIN || '*';

  // In production, allowedOrigin is set to a specific chrome-extension:// origin.
  // In dev, it defaults to '*'.
  let effectiveOrigin = allowedOrigin;

  if (allowedOrigin !== '*') {
    // Allow the configured origin, any chrome-extension:// origin, and localhost for dev
    const isAllowed =
      origin === allowedOrigin ||
      origin.startsWith('chrome-extension://') ||
      origin.startsWith('http://localhost') ||
      origin.startsWith('http://127.0.0.1');

    effectiveOrigin = isAllowed ? origin : allowedOrigin;
  }

  return {
    'Access-Control-Allow-Origin': effectiveOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-License-Key, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

/**
 * Handle CORS preflight OPTIONS request.
 *
 * @param {Request} request
 * @param {object} env
 * @returns {Response}
 */
function handleOptions(request, env) {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request, env),
  });
}

/**
 * Attach CORS headers to an existing Response.
 *
 * @param {Response} response
 * @param {Request} request
 * @param {object} env
 * @returns {Response}
 */
function withCors(response, request, env) {
  const corsHeaders = getCorsHeaders(request, env);
  const newHeaders = new Headers(response.headers);

  for (const [key, value] of Object.entries(corsHeaders)) {
    newHeaders.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

// ---------------------------------------------------------------------------
// Structured logging
// ---------------------------------------------------------------------------

/**
 * Log a structured JSON line for every request.
 *
 * @param {object} params
 */
function logRequest({ method, path, licenseKeyHash, statusCode, latencyMs, tokenUsage, error }) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    method,
    path,
    license_key_hash: licenseKeyHash || null,
    status_code: statusCode,
    latency_ms: latencyMs,
  };

  if (tokenUsage) {
    logEntry.token_usage = tokenUsage;
  }

  if (error) {
    logEntry.error = error;
  }

  console.log(JSON.stringify(logEntry));
}

// ---------------------------------------------------------------------------
// Route table
// ---------------------------------------------------------------------------

/**
 * @typedef {{ method: string, path: string, handler: Function }} Route
 */

/** @type {Route[]} */
const routes = [
  { method: 'GET', path: '/health', handler: handleHealth },
  { method: 'POST', path: '/api/parse', handler: parseTrades },
  { method: 'POST', path: '/api/analyze', handler: analyzeTrades },
  { method: 'POST', path: '/api/license/activate', handler: activateLicense },
  { method: 'GET', path: '/api/license/validate', handler: validateLicense },
  { method: 'GET', path: '/api/license/usage', handler: getLicenseUsage },
  { method: 'GET', path: '/api/notion/auth-url', handler: getAuthUrl },
  { method: 'GET', path: '/api/notion/callback', handler: handleOAuthCallback },
  { method: 'GET', path: '/api/notion/status', handler: getNotionStatus },
  { method: 'POST', path: '/api/notion/create-database', handler: createDatabase },
  { method: 'POST', path: '/api/notion/sync', handler: syncTrades },
  { method: 'POST', path: '/api/notion/save-analysis', handler: saveAnalysis },
];

/**
 * GET /health
 * Health check endpoint with D1 connectivity and API key config status.
 *
 * @param {Request} _request
 * @param {object} env
 * @returns {Promise<Response>}
 */
async function handleHealth(_request, env) {
  let dbOk = false;
  try {
    const result = await env.DB.prepare('SELECT 1 AS ping').first();
    dbOk = result && result.ping === 1;
  } catch {
    dbOk = false;
  }

  const anthropicKeyConfigured = !!(env.ANTHROPIC_API_KEY && env.ANTHROPIC_API_KEY.length > 0);
  const notionClientConfigured = !!(env.NOTION_CLIENT_ID && env.NOTION_CLIENT_ID.length > 0);

  const allOk = dbOk && anthropicKeyConfigured;

  return Response.json({
    status: allOk ? 'ok' : 'degraded',
    service: 'ai-trade-journal-worker',
    timestamp: new Date().toISOString(),
    checks: {
      database: dbOk ? 'connected' : 'error',
      anthropic_api_key: anthropicKeyConfigured ? 'configured' : 'missing',
      notion_client: notionClientConfigured ? 'configured' : 'missing',
    },
  });
}

// ---------------------------------------------------------------------------
// Main fetch handler
// ---------------------------------------------------------------------------

export default {
  /**
   * @param {Request} request
   * @param {object} env
   * @param {ExecutionContext} executionContext
   * @returns {Promise<Response>}
   */
  async fetch(request, env, executionContext) {
    const startTime = Date.now();
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const path = url.pathname;

    // Handle CORS preflight
    if (method === 'OPTIONS') {
      return handleOptions(request, env);
    }

    // Match route
    const route = routes.find((r) => r.method === method && r.path === path);

    if (!route) {
      const response = Response.json(
        { error: { code: 'NOT_FOUND', message: `No route for ${method} ${path}.` } },
        { status: 404 }
      );

      logRequest({
        method,
        path,
        statusCode: 404,
        latencyMs: Date.now() - startTime,
      });

      return withCors(response, request, env);
    }

    // Authenticate
    const authResult = await authenticate(request, env);

    if (authResult.errorResponse) {
      const response = authResult.errorResponse;

      logRequest({
        method,
        path,
        statusCode: response.status,
        latencyMs: Date.now() - startTime,
        error: 'auth_failed',
      });

      return withCors(response, request, env);
    }

    // Build context object shared with route handlers
    const ctx = {
      licenseKey: authResult.licenseKey,
      licenseKeyHash: authResult.licenseKeyHash,
      license: authResult.license,
      waitUntil: executionContext.waitUntil.bind(executionContext),
    };

    // Execute route handler
    let response;
    try {
      response = await route.handler(request, env, ctx);
    } catch (err) {
      response = Response.json(
        { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } },
        { status: 500 }
      );

      logRequest({
        method,
        path,
        licenseKeyHash: ctx.licenseKeyHash,
        statusCode: 500,
        latencyMs: Date.now() - startTime,
        error: err.message,
      });

      return withCors(response, request, env);
    }

    // Extract token usage from response body for logging (non-destructive)
    let tokenUsage = null;
    try {
      if (response.headers.get('Content-Type')?.includes('application/json')) {
        const cloned = response.clone();
        const responseBody = await cloned.json();
        if (responseBody.meta && responseBody.meta.token_usage) {
          tokenUsage = responseBody.meta.token_usage;
        }
      }
    } catch {
      // Ignore — not all responses are JSON or have token_usage
    }

    logRequest({
      method,
      path,
      licenseKeyHash: ctx.licenseKeyHash,
      statusCode: response.status,
      latencyMs: Date.now() - startTime,
      tokenUsage,
    });

    return withCors(response, request, env);
  },
};
