/**
 * License key management route handler.
 * Handles license activation and validation.
 */

import { jsonResponse } from '../index.js';

/**
 * Handle license routes.
 * @param {Request} request
 * @param {Object} env
 * @param {string} path
 * @returns {Promise<Response>}
 */
export async function handleLicenseRoutes(request, env, path) {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405);
  }

  switch (path) {
    case '/license/validate':
      return handleValidate(request, env);

    case '/license/activate':
      return handleActivate(request, env);

    default:
      return jsonResponse({ error: 'NOT_FOUND' }, 404);
  }
}

/**
 * Validate a license key.
 * @param {Request} request
 * @param {Object} env
 * @returns {Promise<Response>}
 */
async function handleValidate(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'INVALID_JSON' }, 400);
  }

  const key = body.key;
  if (!key || typeof key !== 'string' || key.length !== 16) {
    return jsonResponse({ error: 'INVALID_KEY_FORMAT', valid: false }, 400);
  }

  try {
    const result = await env.DB.prepare(
      'SELECT key, status, activated_at FROM licenses WHERE key = ?'
    ).bind(key).first();

    if (!result) {
      return jsonResponse({ valid: false, error: 'KEY_NOT_FOUND' });
    }

    if (result.status === 'revoked') {
      return jsonResponse({ valid: false, error: 'KEY_REVOKED' });
    }

    return jsonResponse({
      valid: true,
      status: result.status,
      activated_at: result.activated_at,
    });
  } catch {
    return jsonResponse({ error: 'VALIDATION_FAILED' }, 500);
  }
}

/**
 * Activate a license key.
 * @param {Request} request
 * @param {Object} env
 * @returns {Promise<Response>}
 */
async function handleActivate(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'INVALID_JSON' }, 400);
  }

  const { key, notion_user_id: notionUserId } = body;

  if (!key || typeof key !== 'string' || key.length !== 16) {
    return jsonResponse({ error: 'INVALID_KEY_FORMAT' }, 400);
  }

  try {
    const existing = await env.DB.prepare(
      'SELECT key, status FROM licenses WHERE key = ?'
    ).bind(key).first();

    if (!existing) {
      return jsonResponse({ error: 'KEY_NOT_FOUND' }, 404);
    }

    if (existing.status === 'active') {
      return jsonResponse({ error: 'KEY_ALREADY_ACTIVE' }, 409);
    }

    if (existing.status === 'revoked') {
      return jsonResponse({ error: 'KEY_REVOKED' }, 403);
    }

    await env.DB.prepare(
      `UPDATE licenses
       SET status = 'active', user_notion_id = ?, activated_at = CURRENT_TIMESTAMP
       WHERE key = ? AND status = 'unused'`
    ).bind(notionUserId || null, key).run();

    return jsonResponse({ success: true, status: 'active' });
  } catch {
    return jsonResponse({ error: 'ACTIVATION_FAILED' }, 500);
  }
}

