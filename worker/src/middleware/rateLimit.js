/**
 * Rate limiting middleware.
 * Uses atomic check-and-increment to prevent TOCTOU race conditions.
 * Checks usage limits before proxying to Claude API.
 */

const DAILY_LIMIT = 10;
const MONTHLY_LIMIT = 200;

/**
 * Atomically check and increment rate limit.
 * @param {string} licenseKey
 * @param {Object} env
 * @returns {Promise<{allowed: boolean, message?: string, resetAt?: string}>}
 */
export async function checkRateLimit(licenseKey, env) {
  // License key is required — auth middleware enforces this,
  // but double-check as defense-in-depth
  if (!licenseKey) {
    return { allowed: false, message: 'MISSING_LICENSE_KEY' };
  }

  if (!env.DB) {
    return { allowed: true };
  }

  const today = new Date().toISOString().split('T')[0];
  const monthStart = today.substring(0, 7) + '-01';

  try {
    // Check monthly usage first
    const monthlyUsage = await env.DB.prepare(
      'SELECT SUM(analysis_count) as total FROM usage WHERE license_key = ? AND date >= ?'
    ).bind(licenseKey, monthStart).first();

    if (monthlyUsage && monthlyUsage.total >= MONTHLY_LIMIT) {
      const nextMonth = new Date(today.substring(0, 7) + '-01');
      nextMonth.setMonth(nextMonth.getMonth() + 1);

      return {
        allowed: false,
        message: 'MONTHLY_LIMIT_REACHED',
        resetAt: nextMonth.toISOString(),
      };
    }

    // Atomic check-and-increment for daily limit:
    // INSERT new row if none exists (with count=1),
    // or UPDATE only if current count is below the limit.
    const result = await env.DB.prepare(
      `INSERT INTO usage (license_key, date, analysis_count, token_input, token_output)
       VALUES (?, ?, 1, 0, 0)
       ON CONFLICT(license_key, date) DO UPDATE SET
         analysis_count = analysis_count + 1
       WHERE analysis_count < ?`
    ).bind(licenseKey, today, DAILY_LIMIT).run();

    // If no rows were changed, the daily limit was already reached
    if (result.meta && result.meta.changes === 0) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      return {
        allowed: false,
        message: 'DAILY_LIMIT_REACHED',
        resetAt: tomorrow.toISOString(),
      };
    }

    return { allowed: true };
  } catch {
    // Rate limit check failure should not block requests
    return { allowed: true };
  }
}
