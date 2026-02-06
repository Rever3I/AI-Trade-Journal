/**
 * Authentication middleware for AI Trade Journal Worker.
 *
 * Extracts the license key from X-License-Key header, validates it
 * against D1, and attaches license info to the request context.
 *
 * Paths that skip authentication:
 *   /health, /api/license/activate, /api/notion/callback
 */

const SKIP_AUTH_PATHS = new Set([
  '/health',
  '/api/license/activate',
  '/api/notion/callback',
]);

/**
 * Hash a string using SHA-256 and return the hex digest.
 * @param {string} text
 * @returns {Promise<string>}
 */
async function sha256Hex(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Validate format: XXXX-XXXX-XXXX-XXXX (uppercase alphanumeric, no ambiguous chars).
 * @param {string} key
 * @returns {boolean}
 */
function isValidKeyFormat(key) {
  return /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/.test(key);
}

/**
 * Run authentication check.
 *
 * @param {Request} request
 * @param {{ DB: D1Database }} env
 * @returns {Promise<{ licenseKey: string, licenseKeyHash: string, license: object } | { errorResponse: Response }>}
 */
export async function authenticate(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (SKIP_AUTH_PATHS.has(path)) {
    return { licenseKey: null, licenseKeyHash: null, license: null };
  }

  const licenseKey = request.headers.get('X-License-Key');

  if (!licenseKey) {
    return {
      errorResponse: Response.json(
        {
          error: {
            code: 'AUTH_MISSING_KEY',
            message: 'License key is required in X-License-Key header.',
          },
        },
        { status: 401 }
      ),
    };
  }

  if (!isValidKeyFormat(licenseKey)) {
    return {
      errorResponse: Response.json(
        {
          error: {
            code: 'AUTH_INVALID_FORMAT',
            message: 'License key format is invalid.',
          },
        },
        { status: 401 }
      ),
    };
  }

  const licenseKeyHash = (await sha256Hex(licenseKey)).slice(0, 8);

  try {
    const license = await env.DB.prepare(
      'SELECT key, status, user_notion_id, notion_access_token, notion_workspace_id, notion_database_id, activated_at FROM licenses WHERE key = ?'
    )
      .bind(licenseKey)
      .first();

    if (!license) {
      return {
        errorResponse: Response.json(
          {
            error: {
              code: 'AUTH_KEY_NOT_FOUND',
              message: 'License key not found.',
            },
          },
          { status: 401 }
        ),
      };
    }

    if (license.status !== 'active') {
      return {
        errorResponse: Response.json(
          {
            error: {
              code: 'AUTH_KEY_NOT_ACTIVE',
              message: `License key status is "${license.status}". Activation required.`,
            },
          },
          { status: 403 }
        ),
      };
    }

    return { licenseKey, licenseKeyHash, license };
  } catch (err) {
    return {
      errorResponse: Response.json(
        {
          error: {
            code: 'AUTH_DB_ERROR',
            message: 'Failed to validate license key.',
          },
        },
        { status: 500 }
      ),
    };
  }
}

export { sha256Hex, isValidKeyFormat };
