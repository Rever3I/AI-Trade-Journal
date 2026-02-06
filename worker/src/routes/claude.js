/**
 * Claude API proxy route handler.
 * Proxies trade parsing and analysis requests to the Anthropic Claude API.
 * Never exposes the API key to the client.
 */

import { PARSER_SYSTEM_PROMPT } from '../prompts/parser.js';
import { getAnalystPrompt, getAvailableTemplates } from '../prompts/analyst.js';
import { jsonResponse } from '../index.js';

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-20250514';
const PARSE_TIMEOUT_MS = 30000;
const ANALYZE_TIMEOUT_MS = 45000;
const MAX_INPUT_LENGTH = 50000;
const MAX_TRADES_FOR_ANALYSIS = 200;

/**
 * Handle Claude API routes.
 * @param {Request} request
 * @param {Object} env - Worker environment bindings
 * @param {string} path - URL path
 * @returns {Promise<Response>}
 */
export async function handleClaudeRoutes(request, env, path) {
  if (path === '/claude/parse' && request.method === 'POST') {
    return handleParse(request, env);
  }

  if (path === '/claude/analyze' && request.method === 'POST') {
    return handleAnalyze(request, env);
  }

  return jsonResponse({ error: 'NOT_FOUND' }, 404, env);
}

/**
 * Parse raw trade data via Claude API.
 * @param {Request} request
 * @param {Object} env
 * @returns {Promise<Response>}
 */
async function handleParse(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'INVALID_JSON' }, 400, env);
  }

  const rawText = body.raw_text;
  if (!rawText || typeof rawText !== 'string' || rawText.trim().length === 0) {
    return jsonResponse({ error: 'EMPTY_INPUT', message: 'raw_text is required' }, 400, env);
  }

  if (rawText.length > MAX_INPUT_LENGTH) {
    return jsonResponse({ error: 'INPUT_TOO_LARGE', message: 'Input exceeds maximum length' }, 400, env);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PARSE_TIMEOUT_MS);

  try {
    const response = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: env.CLAUDE_MODEL || DEFAULT_CLAUDE_MODEL,
        max_tokens: 2000,
        system: PARSER_SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: rawText },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return jsonResponse({
        error: 'CLAUDE_API_ERROR',
        message: 'Trade parsing service temporarily unavailable',
      }, 502, env);
    }

    const claudeResponse = await response.json();
    const content = claudeResponse.content?.[0]?.text;

    if (!content) {
      return jsonResponse({ error: 'EMPTY_RESPONSE', message: 'No response from AI' }, 502, env);
    }

    // Track token usage (tokens only — analysis_count is managed by rate limiter)
    const usage = claudeResponse.usage || {};
    await trackTokenUsage(request.licenseKey, env, {
      tokenInput: usage.input_tokens || 0,
      tokenOutput: usage.output_tokens || 0,
    });

    // Parse the JSON from Claude's response
    const parsedData = extractJsonFromResponse(content);

    if (parsedData.error) {
      return jsonResponse(parsedData, 200, env);
    }

    return jsonResponse({ trades: parsedData }, 200, env);
  } catch (error) {
    if (error.name === 'AbortError') {
      return jsonResponse({ error: 'TIMEOUT', message: 'Parsing request timed out' }, 504, env);
    }
    return jsonResponse({ error: 'PARSE_FAILED', message: 'Trade parsing failed' }, 500, env);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Analyze trades via Claude API with preset analysis templates.
 * @param {Request} request
 * @param {Object} env
 * @returns {Promise<Response>}
 */
async function handleAnalyze(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'INVALID_JSON' }, 400, env);
  }

  const { trades, analysis_type, language = 'zh' } = body;

  if (!trades || !Array.isArray(trades) || trades.length === 0) {
    return jsonResponse({ error: 'NO_TRADES', message: 'trades array is required' }, 400, env);
  }

  if (trades.length > MAX_TRADES_FOR_ANALYSIS) {
    return jsonResponse({ error: 'TOO_MANY_TRADES', message: `Maximum ${MAX_TRADES_FOR_ANALYSIS} trades per analysis` }, 400, env);
  }

  if (!analysis_type) {
    return jsonResponse({ error: 'MISSING_TYPE', message: 'analysis_type is required' }, 400, env);
  }

  const systemPrompt = getAnalystPrompt(analysis_type, language);
  if (!systemPrompt) {
    return jsonResponse({
      error: 'INVALID_TYPE',
      message: `Invalid analysis_type. Valid types: ${getAvailableTemplates().join(', ')}`,
    }, 400, env);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ANALYZE_TIMEOUT_MS);

  try {
    const userContent = JSON.stringify({ trades, trade_count: trades.length });

    const response = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: env.CLAUDE_MODEL || DEFAULT_CLAUDE_MODEL,
        max_tokens: 3000,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userContent },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return jsonResponse({
        error: 'CLAUDE_API_ERROR',
        message: 'Analysis service temporarily unavailable',
      }, 502, env);
    }

    const claudeResponse = await response.json();
    const content = claudeResponse.content?.[0]?.text;

    if (!content) {
      return jsonResponse({ error: 'EMPTY_RESPONSE', message: 'No response from AI' }, 502, env);
    }

    // Track token usage (tokens only — analysis_count is managed by rate limiter)
    const usage = claudeResponse.usage || {};
    await trackTokenUsage(request.licenseKey, env, {
      tokenInput: usage.input_tokens || 0,
      tokenOutput: usage.output_tokens || 0,
    });

    // Parse the JSON from Claude's response
    const analysisData = extractJsonFromResponse(content);

    if (analysisData.error && !analysisData.analysis_type) {
      return jsonResponse({
        error: 'ANALYSIS_PARSE_FAILED',
        message: 'Could not parse analysis response',
      }, 200, env);
    }

    return jsonResponse({ analysis: analysisData }, 200, env);
  } catch (error) {
    if (error.name === 'AbortError') {
      return jsonResponse({ error: 'TIMEOUT', message: 'Analysis request timed out' }, 504, env);
    }
    return jsonResponse({ error: 'ANALYSIS_FAILED', message: 'Trade analysis failed' }, 500, env);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Extract JSON array or object from Claude's text response.
 * @param {string} text
 * @returns {Array|Object}
 */
function extractJsonFromResponse(text) {
  try {
    return JSON.parse(text);
  } catch {
    // Not direct JSON
  }

  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {
      // Not valid JSON in code block
    }
  }

  const jsonMatch = text.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1]);
    } catch {
      // Not valid JSON
    }
  }

  return { error: 'PARSE_FAILED', message: 'Could not extract trade data from response' };
}

/**
 * Track API token usage for cost monitoring.
 * Only updates token counts — analysis_count is managed by the rate limiter.
 * @param {string} licenseKey
 * @param {Object} env
 * @param {Object} usage - { tokenInput, tokenOutput }
 */
async function trackTokenUsage(licenseKey, env, usage) {
  if (!licenseKey || !env.DB) {
    return;
  }

  const today = new Date().toISOString().split('T')[0];

  try {
    await env.DB.prepare(
      `INSERT INTO usage (license_key, date, analysis_count, token_input, token_output)
       VALUES (?, ?, 0, ?, ?)
       ON CONFLICT(license_key, date)
       DO UPDATE SET
         token_input = token_input + ?,
         token_output = token_output + ?`
    ).bind(
      licenseKey,
      today,
      usage.tokenInput,
      usage.tokenOutput,
      usage.tokenInput,
      usage.tokenOutput,
    ).run();
  } catch {
    // Usage tracking failure is non-fatal
  }
}
