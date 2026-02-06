/**
 * Cloudflare Worker — API Router.
 * Routes requests to Claude API proxy, Notion API proxy, and license management.
 */

import { handleClaudeRoutes } from './routes/claude.js';
import { handleNotionRoutes } from './routes/notion.js';
import { handleLicenseRoutes } from './routes/license.js';
import { verifyRequest } from './middleware/auth.js';
import { checkRateLimit } from './middleware/rateLimit.js';

/** CORS headers used across all responses. */
const CORS_HEADERS = {
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Timestamp, X-License-Key, X-Signature',
};

/**
 * Get the allowed CORS origin from env or default.
 * In production, set ALLOWED_ORIGIN to chrome-extension://<id>.
 * @param {Object} env
 * @returns {string}
 */
function getAllowedOrigin(env) {
  return env.ALLOWED_ORIGIN || '*';
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return handleCors(env);
    }

    // Health check — no auth required
    if (path === '/health') {
      return jsonResponse({ status: 'ok', timestamp: new Date().toISOString() }, 200, env);
    }

    // Notion OAuth callback — browser-navigated, no extension auth
    if (path === '/notion/callback') {
      return await handleNotionRoutes(request, env, path);
    }

    try {
      // Verify request authentication for all API routes
      if (path.startsWith('/claude/') || path.startsWith('/notion/') || path.startsWith('/license/')) {
        const authResult = await verifyRequest(request, env);
        if (!authResult.valid) {
          return jsonResponse({ error: 'UNAUTHORIZED', message: authResult.reason }, 401, env);
        }
        request.licenseKey = authResult.licenseKey;
      }

      // Route to handlers
      if (path.startsWith('/claude/')) {
        // Rate limit check before Claude API calls
        const rateLimitResult = await checkRateLimit(request.licenseKey, env);
        if (!rateLimitResult.allowed) {
          return jsonResponse({
            error: 'RATE_LIMITED',
            message: rateLimitResult.message,
            reset_at: rateLimitResult.resetAt,
          }, 429, env);
        }
        return await handleClaudeRoutes(request, env, path);
      }

      if (path.startsWith('/notion/')) {
        return await handleNotionRoutes(request, env, path);
      }

      if (path.startsWith('/license/')) {
        return await handleLicenseRoutes(request, env, path);
      }

      return jsonResponse({ error: 'NOT_FOUND' }, 404, env);
    } catch (error) {
      return jsonResponse({
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      }, 500, env);
    }
  },
};

/**
 * Create a JSON response with CORS headers.
 * @param {Object} data
 * @param {number} [status=200]
 * @param {Object} [env={}]
 * @returns {Response}
 */
export function jsonResponse(data, status = 200, env = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': getAllowedOrigin(env),
      ...CORS_HEADERS,
    },
  });
}

/**
 * Handle CORS preflight requests.
 * @param {Object} [env={}]
 * @returns {Response}
 */
function handleCors(env = {}) {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': getAllowedOrigin(env),
      ...CORS_HEADERS,
      'Access-Control-Max-Age': '86400',
    },
  });
}
