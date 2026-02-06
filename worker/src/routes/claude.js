/**
 * Claude API proxy route handler.
 * Proxies trade parsing requests to the Anthropic Claude API.
 * Never exposes the API key to the client.
 */

import { PARSER_SYSTEM_PROMPT } from '../prompts/parser.js';
import { jsonResponse } from '../index.js';

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-20250514';
const PARSE_TIMEOUT_MS = 30000;
const MAX_INPUT_LENGTH = 50000;

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

  return jsonResponse({ error: 'NOT_FOUND' }, 404);
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
    return jsonResponse({ error: 'INVALID_JSON' }, 400);
  }

  const rawText = body.raw_text;
  if (!rawText || typeof rawText !== 'string' || rawText.trim().length === 0) {
    return jsonResponse({ error: 'EMPTY_INPUT', message: 'raw_text is required' }, 400);
  }

  if (rawText.length > MAX_INPUT_LENGTH) {
    return jsonResponse({ error: 'INPUT_TOO_LARGE', message: 'Input exceeds maximum length' }, 400);
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
      const errorData = await response.text();
      return jsonResponse({
        error: 'CLAUDE_API_ERROR',
        message: 'Trade parsing service temporarily unavailable',
      }, 502);
    }

    const claudeResponse = await response.json();
    const content = claudeResponse.content?.[0]?.text;

    if (!content) {
      return jsonResponse({ error: 'EMPTY_RESPONSE', message: 'No response from AI' }, 502);
    }

    // Track token usage
    const usage = claudeResponse.usage || {};
    await trackUsage(request.licenseKey, env, {
      tokenInput: usage.input_tokens || 0,
      tokenOutput: usage.output_tokens || 0,
    });

    // Parse the JSON from Claude's response
    const parsedData = extractJsonFromResponse(content);

    if (parsedData.error) {
      return jsonResponse(parsedData, 200);
    }

    return jsonResponse({ trades: parsedData }, 200);
  } catch (error) {
    if (error.name === 'AbortError') {
      return jsonResponse({ error: 'TIMEOUT', message: 'Parsing request timed out' }, 504);
    }
    return jsonResponse({ error: 'PARSE_FAILED', message: 'Trade parsing failed' }, 500);
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
  // Try direct JSON parse first
  try {
    const parsed = JSON.parse(text);
    return parsed;
  } catch {
    // Not direct JSON
  }

  // Try to find JSON in markdown code blocks
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {
      // Not valid JSON in code block
    }
  }

  // Try to find JSON array or object in text
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
 * Track API usage for rate limiting and cost control.
 * @param {string} licenseKey
 * @param {Object} env
 * @param {Object} usage - { tokenInput, tokenOutput }
 */
async function trackUsage(licenseKey, env, usage) {
  if (!licenseKey || !env.DB) {
    return;
  }

  const today = new Date().toISOString().split('T')[0];

  try {
    await env.DB.prepare(
      `INSERT INTO usage (license_key, date, analysis_count, token_input, token_output)
       VALUES (?, ?, 1, ?, ?)
       ON CONFLICT(license_key, date)
       DO UPDATE SET
         analysis_count = analysis_count + 1,
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

