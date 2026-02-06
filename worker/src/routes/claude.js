/**
 * Claude API proxy routes for AI Trade Journal Worker.
 *
 * - parseTrades: calls Claude to parse raw broker text into structured trade JSON
 * - analyzeTrades: calls Claude to generate AI trade review analysis
 *
 * Both endpoints validate input, check rate limits BEFORE calling the API,
 * and track token usage after a successful call.
 */

import { checkRateLimit, incrementUsage } from '../middleware/rateLimit.js';

// ---------------------------------------------------------------------------
// Prompt definitions (inline v1.1 — versioned, mirrors /src/prompts/)
// ---------------------------------------------------------------------------

const PARSER_PROMPT_VERSION = 'v1.1';
const PARSER_SYSTEM_PROMPT = `You are a trading data extraction specialist. Parse raw trade data from ANY broker format into structured JSON.

INPUT: Raw text (CSV, tab-separated, or free-form text from broker export)

OUTPUT: A valid JSON object with the following shape:
{
  "version": "${PARSER_PROMPT_VERSION}",
  "trades": [
    {
      "symbol": "NVDA",
      "action": "BUY",
      "quantity": 100,
      "price": 135.50,
      "datetime": "2026-02-06T09:35:00-05:00",
      "total_amount": 13550.00,
      "commission": 0.00,
      "broker_detected": "Futu",
      "currency": "USD",
      "confidence": 0.95
    }
  ]
}

RULES:
1. "action" MUST be one of: "BUY", "SELL", "SHORT", "COVER".
2. Handle ALL formats: Futu CSV (Chinese headers like \u6210\u4ea4\u65f6\u95f4,\u4ee3\u7801,\u540d\u79f0,\u65b9\u5411,\u6210\u4ea4\u6570\u91cf,\u6210\u4ea4\u4ef7\u683c), IBKR flex query, Webull export, Schwab CSV, Tiger/Longbridge, or free-form text.
3. "broker_detected" MUST be one of: "Futu", "IBKR", "Webull", "Schwab", "Tiger", "Longbridge", "unknown".
4. "currency" MUST be one of: "USD", "HKD", "CNY". Infer from the broker or data context.
5. If a field is ambiguous, set confidence < 0.8 and add an "ambiguous_fields" array listing the ambiguous property names.
6. Detect buy/sell pairs and calculate realized P/L when possible, adding "realized_pl" to the trade object.
7. Normalize all datetimes to ISO 8601 with timezone.
8. If input is clearly not trade data, return: {"error": "NOT_TRADE_DATA", "message": "<brief explanation>"}
9. Return ONLY the JSON object — no markdown fences, no explanatory text.`;

const ANALYST_PROMPT_VERSION = 'v1.1';
const ANALYST_SYSTEM_PROMPT = `You are an elite trading coach who combines quantitative analysis with behavioral psychology. Your analysis philosophy draws from "\u4e0d\u80dc\u4e0d\u6218" (don't fight unless you can win) \u2014 emphasizing discipline, patience, and high-probability setups.

INPUT: A JSON object with:
- "trades": array of structured trade objects
- "analysis_type": one of ["daily_review", "single_trade", "weekly_stats", "strategy_eval", "emotion_check", "risk_assessment"]
- "user_history_summary": (optional) aggregated stats from past trades
- "language": "zh" or "en" (default "zh")

OUTPUT FORMAT (\u63a7\u5236\u5728200\u5b57\u4ee5\u5185):
Return a valid JSON object:
{
  "version": "${ANALYST_PROMPT_VERSION}",
  "analysis_type": "...",
  "summary": "\u4e00\u53e5\u8bdd\u603b\u7ed3",
  "metrics": {
    "win_rate": 0.65,
    "avg_r_multiple": 1.8,
    "profit_factor": 2.1,
    "total_pl": 1234.56,
    "largest_winner": {"symbol": "...", "pl": 500},
    "largest_loser": {"symbol": "...", "pl": -200}
  },
  "insights": [
    {"category": "execution", "text": "...", "severity": "info"}
  ],
  "action_items": ["\u5177\u4f53\u53ef\u6267\u884c\u7684\u5efa\u8bae"],
  "score": 85
}

ANALYSIS DIMENSIONS:
1. \u6267\u884c\u7eaa\u5f8b: Did you follow your plan? Stop-loss honored?
2. \u98ce\u9669\u7ba1\u7406: R-multiple, position sizing, daily exposure
3. \u6a21\u5f0f\u8bc6\u522b: Breakout, pullback, range, momentum \u2014 classify the setup
4. \u60c5\u7eea\u6807\u7b7e: Revenge trading? FOMO? Overtrading? (infer from timing/frequency)
5. \u7edf\u8ba1\u6c47\u603b: Win rate trends, best/worst time slots, streak analysis
6. \u6539\u8fdb\u5efa\u8bae: Concrete, actionable, based on data patterns

SEVERITY levels: "info", "warning", "critical"
CATEGORY values: "execution", "risk", "pattern", "emotion", "improvement"

Return ONLY the JSON object \u2014 no markdown fences, no explanatory text.
Match the language from the "language" field. Default: Chinese.`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_API_TIMEOUT_MS = 25000;
const PARSER_MAX_TOKENS = 4000;
const ANALYST_MAX_TOKENS = 4000;

/**
 * Call the Claude Messages API with a timeout.
 *
 * @param {string} systemPrompt
 * @param {string} userMessage
 * @param {number} maxTokens
 * @param {{ ANTHROPIC_API_KEY: string, CLAUDE_MODEL?: string }} env
 * @returns {Promise<{ content: string, usage: { input_tokens: number, output_tokens: number } }>}
 */
async function callClaude(systemPrompt, userMessage, maxTokens, env) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CLAUDE_API_TIMEOUT_MS);

  try {
    const response = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      const statusCode = response.status;

      if (statusCode === 429) {
        throw new ClaudeApiError('CLAUDE_RATE_LIMITED', 'Claude API rate limited. Please try again shortly.', 429);
      }
      if (statusCode === 529) {
        throw new ClaudeApiError('CLAUDE_OVERLOADED', 'Claude API is temporarily overloaded. Please try again later.', 503);
      }
      throw new ClaudeApiError(
        'CLAUDE_API_ERROR',
        `Claude API returned status ${statusCode}.`,
        statusCode >= 500 ? 502 : 400
      );
    }

    const data = await response.json();

    if (!data.content || !data.content[0] || !data.content[0].text) {
      throw new ClaudeApiError('CLAUDE_EMPTY_RESPONSE', 'Claude returned an empty response.', 502);
    }

    return {
      content: data.content[0].text,
      usage: {
        input_tokens: data.usage ? data.usage.input_tokens : 0,
        output_tokens: data.usage ? data.usage.output_tokens : 0,
      },
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

class ClaudeApiError extends Error {
  constructor(code, message, httpStatus) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

/**
 * Try to extract valid JSON from a Claude response that might contain
 * markdown fences or leading/trailing text.
 *
 * @param {string} raw
 * @returns {object}
 */
function extractJson(raw) {
  // Try direct parse first
  try {
    return JSON.parse(raw);
  } catch {
    // noop
  }

  // Strip markdown code fences if present
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {
      // noop
    }
  }

  // Try to find the first { ... } or [ ... ] block
  const braceStart = raw.indexOf('{');
  const bracketStart = raw.indexOf('[');
  let start = -1;

  if (braceStart === -1 && bracketStart === -1) {
    throw new Error('No JSON object found in Claude response.');
  }

  if (braceStart === -1) {
    start = bracketStart;
  } else if (bracketStart === -1) {
    start = braceStart;
  } else {
    start = Math.min(braceStart, bracketStart);
  }

  const candidate = raw.slice(start);
  return JSON.parse(candidate);
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

/**
 * POST /api/parse
 * Parse raw trade data into structured JSON.
 *
 * Body: { raw_text: string }
 */
export async function parseTrades(request, env, ctx) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON.' } },
      { status: 400 }
    );
  }

  const rawText = body.raw_text;

  if (!rawText || typeof rawText !== 'string' || rawText.trim().length === 0) {
    return Response.json(
      { error: { code: 'MISSING_FIELD', message: 'Field "raw_text" is required and must be a non-empty string.' } },
      { status: 400 }
    );
  }

  if (rawText.length > 50000) {
    return Response.json(
      { error: { code: 'INPUT_TOO_LARGE', message: 'Input text exceeds 50,000 character limit.' } },
      { status: 400 }
    );
  }

  // Rate limit check (parse operations are tracked but less strictly)
  const licenseKey = ctx.licenseKey;
  if (licenseKey) {
    const rateCheck = await checkRateLimit(licenseKey, 'parse', env);
    if (rateCheck.error) {
      return Response.json({ error: rateCheck.error }, { status: 500 });
    }
    // Parse has no hard limit but is tracked
  }

  try {
    const result = await callClaude(PARSER_SYSTEM_PROMPT, rawText, PARSER_MAX_TOKENS, env);
    const parsed = extractJson(result.content);

    // Track usage
    if (licenseKey) {
      ctx.waitUntil(
        incrementUsage(licenseKey, 'parse', {
          tokenInput: result.usage.input_tokens,
          tokenOutput: result.usage.output_tokens,
        }, env)
      );
    }

    return Response.json({
      data: parsed,
      meta: {
        prompt_version: PARSER_PROMPT_VERSION,
        token_usage: {
          input: result.usage.input_tokens,
          output: result.usage.output_tokens,
        },
      },
    });
  } catch (err) {
    if (err instanceof ClaudeApiError) {
      return Response.json(
        { error: { code: err.code, message: err.message } },
        { status: err.httpStatus }
      );
    }
    if (err.name === 'AbortError') {
      return Response.json(
        { error: { code: 'CLAUDE_TIMEOUT', message: 'Claude API request timed out (25s).' } },
        { status: 504 }
      );
    }
    return Response.json(
      { error: { code: 'PARSE_FAILED', message: 'Failed to parse trade data. The response could not be interpreted as valid JSON.' } },
      { status: 502 }
    );
  }
}

/**
 * POST /api/analyze
 * Generate AI trade review analysis.
 *
 * Body: { trades: array, analysis_type: string, user_history_summary?: object, language?: string }
 */
export async function analyzeTrades(request, env, ctx) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON.' } },
      { status: 400 }
    );
  }

  const { trades, analysis_type, user_history_summary, language } = body;

  if (!trades || !Array.isArray(trades) || trades.length === 0) {
    return Response.json(
      { error: { code: 'MISSING_FIELD', message: 'Field "trades" is required and must be a non-empty array.' } },
      { status: 400 }
    );
  }

  const validTypes = ['daily_review', 'single_trade', 'weekly_stats', 'strategy_eval', 'emotion_check', 'risk_assessment'];
  if (!analysis_type || !validTypes.includes(analysis_type)) {
    return Response.json(
      {
        error: {
          code: 'INVALID_ANALYSIS_TYPE',
          message: `Field "analysis_type" must be one of: ${validTypes.join(', ')}.`,
        },
      },
      { status: 400 }
    );
  }

  // Rate limit check BEFORE calling the API
  const licenseKey = ctx.licenseKey;
  if (licenseKey) {
    const rateCheck = await checkRateLimit(licenseKey, 'analysis', env);
    if (rateCheck.error) {
      return Response.json({ error: rateCheck.error }, { status: 500 });
    }
    if (!rateCheck.allowed) {
      return Response.json(
        {
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: rateCheck.period === 'daily'
              ? 'Daily analysis limit reached. Resets at midnight UTC.'
              : 'Monthly analysis limit reached.',
            used: rateCheck.used,
            limit: rateCheck.limit,
            period: rateCheck.period,
          },
        },
        { status: 429 }
      );
    }
  }

  const userMessage = JSON.stringify({
    trades,
    analysis_type,
    user_history_summary: user_history_summary || null,
    language: language || 'zh',
  });

  try {
    const result = await callClaude(ANALYST_SYSTEM_PROMPT, userMessage, ANALYST_MAX_TOKENS, env);
    const analysis = extractJson(result.content);

    // Track usage AFTER success
    if (licenseKey) {
      ctx.waitUntil(
        incrementUsage(licenseKey, 'analysis', {
          tokenInput: result.usage.input_tokens,
          tokenOutput: result.usage.output_tokens,
        }, env)
      );
    }

    return Response.json({
      data: analysis,
      meta: {
        prompt_version: ANALYST_PROMPT_VERSION,
        analysis_type,
        token_usage: {
          input: result.usage.input_tokens,
          output: result.usage.output_tokens,
        },
      },
    });
  } catch (err) {
    if (err instanceof ClaudeApiError) {
      return Response.json(
        { error: { code: err.code, message: err.message } },
        { status: err.httpStatus }
      );
    }
    if (err.name === 'AbortError') {
      return Response.json(
        { error: { code: 'CLAUDE_TIMEOUT', message: 'Claude API request timed out (25s).' } },
        { status: 504 }
      );
    }
    return Response.json(
      { error: { code: 'ANALYSIS_FAILED', message: 'Failed to generate analysis. The response could not be interpreted as valid JSON.' } },
      { status: 502 }
    );
  }
}
