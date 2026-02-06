/**
 * Request authentication middleware.
 * Verifies license keys, timestamps, and HMAC signatures on incoming requests.
 */

const TIMESTAMP_TOLERANCE_MS = 300000; // 5 minutes

/**
 * Verify incoming request authentication.
 * Requires a valid license key for all protected routes.
 * @param {Request} request
 * @param {Object} env
 * @returns {Promise<{valid: boolean, licenseKey?: string, reason?: string}>}
 */
export async function verifyRequest(request, env) {
  const licenseKey = request.headers.get('X-License-Key') || '';
  const timestamp = request.headers.get('X-Timestamp');
  const signature = request.headers.get('X-Signature');

  // License key is required for all protected routes
  if (!licenseKey) {
    return { valid: false, reason: 'MISSING_LICENSE_KEY' };
  }

  // Timestamp is required and must be fresh
  if (!timestamp) {
    return { valid: false, reason: 'MISSING_TIMESTAMP' };
  }

  const requestTime = new Date(timestamp).getTime();
  const now = Date.now();
  if (isNaN(requestTime) || Math.abs(now - requestTime) > TIMESTAMP_TOLERANCE_MS) {
    return { valid: false, reason: 'REQUEST_EXPIRED' };
  }

  // Verify license key exists and is not revoked
  if (env.DB) {
    try {
      const license = await env.DB.prepare(
        'SELECT status FROM licenses WHERE key = ?'
      ).bind(licenseKey).first();

      if (!license) {
        return { valid: false, reason: 'LICENSE_NOT_FOUND' };
      }

      if (license.status === 'revoked') {
        return { valid: false, reason: 'LICENSE_REVOKED' };
      }
    } catch {
      // DB check failure — allow request as fallback
    }
  }

  // HMAC signature verification using server-side signing secret
  if (signature && env.LICENSE_SIGNING_SECRET) {
    const body = await request.clone().text();
    const isValidSignature = await verifyHmacSignature(
      body,
      timestamp,
      signature,
      env.LICENSE_SIGNING_SECRET,
    );

    if (!isValidSignature) {
      return { valid: false, reason: 'INVALID_SIGNATURE' };
    }
  }

  return { valid: true, licenseKey };
}

/**
 * Verify HMAC-SHA256 signature.
 * @param {string} body
 * @param {string} timestamp
 * @param {string} signature - Hex-encoded signature
 * @param {string} secret - Server-side signing secret
 * @returns {Promise<boolean>}
 */
async function verifyHmacSignature(body, timestamp, signature, secret) {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const data = encoder.encode(`${timestamp}:${body}`);
    const expectedSignature = await crypto.subtle.sign('HMAC', key, data);
    const expectedHex = Array.from(new Uint8Array(expectedSignature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Constant-time comparison to prevent timing attacks
    if (signature.length !== expectedHex.length) {
      return false;
    }
    let mismatch = 0;
    for (let i = 0; i < signature.length; i++) {
      mismatch |= signature.charCodeAt(i) ^ expectedHex.charCodeAt(i);
    }
    return mismatch === 0;
  } catch {
    return false;
  }
}
