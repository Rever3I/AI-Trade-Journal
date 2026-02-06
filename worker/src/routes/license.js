/**
 * License management routes for AI Trade Journal Worker.
 *
 * - activate: validate format, check D1, mark as active
 * - validate: check if license key from header is active
 * - usage: return today's usage count and limits
 */

import { isValidKeyFormat } from '../middleware/auth.js';
import { getUsageSummary } from '../middleware/rateLimit.js';

/**
 * POST /api/license/activate
 * Activate a license key.
 *
 * Body: { key: string }
 * No auth required (this IS the activation step).
 */
export async function activateLicense(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON.' } },
      { status: 400 }
    );
  }

  const key = body.key;

  if (!key || typeof key !== 'string') {
    return Response.json(
      { error: { code: 'MISSING_FIELD', message: 'Field "key" is required.' } },
      { status: 400 }
    );
  }

  const trimmedKey = key.trim().toUpperCase();

  if (!isValidKeyFormat(trimmedKey)) {
    return Response.json(
      {
        error: {
          code: 'INVALID_KEY_FORMAT',
          message: 'License key must be in XXXX-XXXX-XXXX-XXXX format (uppercase alphanumeric).',
        },
      },
      { status: 400 }
    );
  }

  try {
    const license = await env.DB.prepare(
      'SELECT key, status, activated_at FROM licenses WHERE key = ?'
    )
      .bind(trimmedKey)
      .first();

    if (!license) {
      return Response.json(
        { error: { code: 'KEY_NOT_FOUND', message: 'License key does not exist.' } },
        { status: 404 }
      );
    }

    if (license.status === 'active') {
      return Response.json(
        { error: { code: 'KEY_ALREADY_ACTIVE', message: 'This license key is already activated.' } },
        { status: 409 }
      );
    }

    if (license.status === 'revoked') {
      return Response.json(
        { error: { code: 'KEY_REVOKED', message: 'This license key has been revoked.' } },
        { status: 403 }
      );
    }

    // Activate the key
    const now = new Date().toISOString();
    await env.DB.prepare(
      'UPDATE licenses SET status = ?, activated_at = ? WHERE key = ? AND status = ?'
    )
      .bind('active', now, trimmedKey, 'unused')
      .run();

    // Verify the update actually happened (race condition guard)
    const updated = await env.DB.prepare(
      'SELECT status, activated_at FROM licenses WHERE key = ?'
    )
      .bind(trimmedKey)
      .first();

    if (!updated || updated.status !== 'active') {
      return Response.json(
        { error: { code: 'ACTIVATION_FAILED', message: 'Activation failed. Please try again.' } },
        { status: 500 }
      );
    }

    return Response.json({
      data: {
        key: trimmedKey,
        status: 'active',
        activated_at: updated.activated_at,
      },
    });
  } catch (err) {
    return Response.json(
      { error: { code: 'DB_ERROR', message: 'Failed to activate license key.' } },
      { status: 500 }
    );
  }
}

/**
 * GET /api/license/validate
 * Check if the license key in X-License-Key header is active.
 *
 * Auth middleware has already validated the key, so if we get here
 * the key is active.
 */
export async function validateLicense(request, env, ctx) {
  // ctx.license is populated by auth middleware
  const license = ctx.license;

  return Response.json({
    data: {
      key: ctx.licenseKey,
      status: license.status,
      activated_at: license.activated_at,
      has_notion: !!license.notion_access_token,
      notion_workspace_id: license.notion_workspace_id || null,
      notion_database_id: license.notion_database_id || null,
    },
  });
}

/**
 * GET /api/license/usage
 * Return today's usage count and limits for the authenticated license.
 */
export async function getLicenseUsage(request, env, ctx) {
  try {
    const summary = await getUsageSummary(ctx.licenseKey, env);

    return Response.json({ data: summary });
  } catch (err) {
    return Response.json(
      { error: { code: 'USAGE_FETCH_ERROR', message: 'Failed to retrieve usage data.' } },
      { status: 500 }
    );
  }
}
