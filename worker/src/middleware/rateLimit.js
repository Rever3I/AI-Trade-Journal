/**
 * Rate limiting middleware for AI Trade Journal Worker.
 *
 * Checks usage BEFORE processing: 10 analyses per day, 200 per month.
 * Uses D1 usage table for persistent tracking.
 * Increments atomically after a successful API call.
 */

/**
 * Get today's date string in YYYY-MM-DD format (UTC).
 * @returns {string}
 */
function getTodayUTC() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Get the first day of the current month in YYYY-MM-DD format (UTC).
 * @returns {string}
 */
function getMonthStartUTC() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

/**
 * Check whether the license has remaining quota for the given operation type.
 *
 * @param {string} licenseKey
 * @param {'analysis' | 'parse'} operationType
 * @param {{ DB: D1Database, DAILY_ANALYSIS_LIMIT?: string, MONTHLY_ANALYSIS_LIMIT?: string }} env
 * @returns {Promise<{ allowed: boolean, used: number, limit: number, period: string } | { error: object }>}
 */
export async function checkRateLimit(licenseKey, operationType, env) {
  const dailyLimit = parseInt(env.DAILY_ANALYSIS_LIMIT || '10', 10);
  const monthlyLimit = parseInt(env.MONTHLY_ANALYSIS_LIMIT || '200', 10);
  const today = getTodayUTC();
  const monthStart = getMonthStartUTC();

  try {
    // Daily check
    const dailyRow = await env.DB.prepare(
      'SELECT analysis_count, parse_count FROM usage WHERE license_key = ? AND date = ?'
    )
      .bind(licenseKey, today)
      .first();

    const dailyAnalysisCount = dailyRow ? dailyRow.analysis_count : 0;
    const dailyParseCount = dailyRow ? dailyRow.parse_count : 0;

    if (operationType === 'analysis' && dailyAnalysisCount >= dailyLimit) {
      return {
        allowed: false,
        used: dailyAnalysisCount,
        limit: dailyLimit,
        period: 'daily',
      };
    }

    // Monthly check (only for analysis to control costs)
    if (operationType === 'analysis') {
      const monthlyRow = await env.DB.prepare(
        'SELECT COALESCE(SUM(analysis_count), 0) AS total FROM usage WHERE license_key = ? AND date >= ?'
      )
        .bind(licenseKey, monthStart)
        .first();

      const monthlyTotal = monthlyRow ? monthlyRow.total : 0;

      if (monthlyTotal >= monthlyLimit) {
        return {
          allowed: false,
          used: monthlyTotal,
          limit: monthlyLimit,
          period: 'monthly',
        };
      }
    }

    return {
      allowed: true,
      used: operationType === 'analysis' ? dailyAnalysisCount : dailyParseCount,
      limit: dailyLimit,
      period: 'daily',
    };
  } catch (err) {
    return {
      error: {
        code: 'RATE_LIMIT_CHECK_ERROR',
        message: 'Failed to check usage limits.',
      },
    };
  }
}

/**
 * Increment usage counters after a successful API call.
 *
 * @param {string} licenseKey
 * @param {'analysis' | 'parse'} operationType
 * @param {{ tokenInput: number, tokenOutput: number }} tokenUsage
 * @param {{ DB: D1Database }} env
 * @returns {Promise<void>}
 */
export async function incrementUsage(licenseKey, operationType, tokenUsage, env) {
  const today = getTodayUTC();
  const { tokenInput, tokenOutput } = tokenUsage;

  try {
    // Upsert: insert row if not exists, then increment atomically
    await env.DB.prepare(
      `INSERT INTO usage (license_key, date, analysis_count, parse_count, token_input, token_output)
       VALUES (?, ?, 0, 0, 0, 0)
       ON CONFLICT(license_key, date) DO NOTHING`
    )
      .bind(licenseKey, today)
      .run();

    if (operationType === 'analysis') {
      await env.DB.prepare(
        `UPDATE usage
         SET analysis_count = analysis_count + 1,
             token_input = token_input + ?,
             token_output = token_output + ?
         WHERE license_key = ? AND date = ?`
      )
        .bind(tokenInput, tokenOutput, licenseKey, today)
        .run();
    } else {
      await env.DB.prepare(
        `UPDATE usage
         SET parse_count = parse_count + 1,
             token_input = token_input + ?,
             token_output = token_output + ?
         WHERE license_key = ? AND date = ?`
      )
        .bind(tokenInput, tokenOutput, licenseKey, today)
        .run();
    }
  } catch (err) {
    // Log but do not throw -- the API call already succeeded so we
    // should not fail the user request just because tracking failed.
    // The next request will still be checked against the DB.
    console.error('Failed to increment usage:', err.message);
  }
}

/**
 * Retrieve usage summary for a license key (today + this month).
 *
 * @param {string} licenseKey
 * @param {{ DB: D1Database, DAILY_ANALYSIS_LIMIT?: string, MONTHLY_ANALYSIS_LIMIT?: string }} env
 * @returns {Promise<object>}
 */
export async function getUsageSummary(licenseKey, env) {
  const dailyLimit = parseInt(env.DAILY_ANALYSIS_LIMIT || '10', 10);
  const monthlyLimit = parseInt(env.MONTHLY_ANALYSIS_LIMIT || '200', 10);
  const today = getTodayUTC();
  const monthStart = getMonthStartUTC();

  try {
    const dailyRow = await env.DB.prepare(
      'SELECT analysis_count, parse_count, token_input, token_output FROM usage WHERE license_key = ? AND date = ?'
    )
      .bind(licenseKey, today)
      .first();

    const monthlyRow = await env.DB.prepare(
      `SELECT COALESCE(SUM(analysis_count), 0) AS analysis_total,
              COALESCE(SUM(parse_count), 0) AS parse_total,
              COALESCE(SUM(token_input), 0) AS token_input_total,
              COALESCE(SUM(token_output), 0) AS token_output_total
       FROM usage WHERE license_key = ? AND date >= ?`
    )
      .bind(licenseKey, monthStart)
      .first();

    return {
      daily: {
        analysis: {
          used: dailyRow ? dailyRow.analysis_count : 0,
          limit: dailyLimit,
        },
        parse: {
          used: dailyRow ? dailyRow.parse_count : 0,
        },
        tokens: {
          input: dailyRow ? dailyRow.token_input : 0,
          output: dailyRow ? dailyRow.token_output : 0,
        },
      },
      monthly: {
        analysis: {
          used: monthlyRow ? monthlyRow.analysis_total : 0,
          limit: monthlyLimit,
        },
        parse: {
          used: monthlyRow ? monthlyRow.parse_total : 0,
        },
        tokens: {
          input: monthlyRow ? monthlyRow.token_input_total : 0,
          output: monthlyRow ? monthlyRow.token_output_total : 0,
        },
      },
      date: today,
    };
  } catch (err) {
    throw new Error('Failed to retrieve usage summary.');
  }
}
