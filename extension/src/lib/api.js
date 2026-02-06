/**
 * Backend proxy client for Cloudflare Worker API.
 * All external API calls (Claude, Notion) route through the Worker proxy.
 * Implements request signing, timeouts, and error handling.
 */

import { get as storageGet } from './storage.js';

const WORKER_URL = import.meta.env.VITE_WORKER_URL || 'https://worker.your-domain.workers.dev';
const DEFAULT_TIMEOUT_MS = 15000;
const PARSE_TIMEOUT_MS = 10000;

/**
 * Generate HMAC signature for request authentication.
 * @param {string} body - Request body string
 * @param {string} timestamp - ISO timestamp
 * @param {string} secret - Signing secret from storage
 * @returns {Promise<string>} Hex-encoded HMAC signature
 */
async function generateSignature(body, timestamp, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const data = encoder.encode(`${timestamp}:${body}`);
  const signature = await crypto.subtle.sign('HMAC', key, data);
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Make an authenticated request to the Worker proxy.
 * @param {string} path - API path (e.g., '/claude/parse')
 * @param {Object} options
 * @param {Object} [options.body] - Request body
 * @param {string} [options.method='POST'] - HTTP method
 * @param {number} [options.timeoutMs] - Request timeout
 * @param {string} [options.licenseKey] - License key for auth
 * @returns {Promise<Object>} Parsed JSON response
 */
export async function apiRequest(path, options = {}) {
  const {
    body,
    method = 'POST',
    timeoutMs = DEFAULT_TIMEOUT_MS,
    licenseKey = '',
  } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const timestamp = new Date().toISOString();
  const bodyString = body ? JSON.stringify(body) : '';

  try {
    const headers = {
      'Content-Type': 'application/json',
      'X-Timestamp': timestamp,
      'X-License-Key': licenseKey,
    };

    // Sign with the signing secret (stored separately from license key).
    // The signing secret is provisioned during license activation and
    // stored in chrome.storage by the background worker.
    if (licenseKey && bodyString) {
      try {
        const signingSecret = await storageGet('signingSecret', '');
        if (signingSecret) {
          const signature = await generateSignature(bodyString, timestamp, signingSecret);
          headers['X-Signature'] = signature;
        }
      } catch {
        // Proceed without signature if generation fails
      }
    }

    const response = await fetch(`${WORKER_URL}${path}`, {
      method,
      headers,
      body: bodyString || undefined,
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const error = new Error(errorData.message || `HTTP ${response.status}`);
      error.status = response.status;
      error.data = errorData;
      throw error;
    }

    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error('REQUEST_TIMEOUT');
      timeoutError.status = 408;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Parse raw trade data via the Claude API proxy.
 * @param {string} rawText - Raw trade text/CSV input
 * @param {string} licenseKey - User's license key
 * @returns {Promise<Object>} Parsed trade data
 */
export async function parseTrades(rawText, licenseKey) {
  return apiRequest('/claude/parse', {
    body: { raw_text: rawText },
    timeoutMs: PARSE_TIMEOUT_MS,
    licenseKey,
  });
}

/**
 * Validate a license key.
 * @param {string} licenseKey - 16-char activation code
 * @returns {Promise<Object>} Validation result
 */
export async function validateLicense(licenseKey) {
  return apiRequest('/license/validate', {
    body: { key: licenseKey },
    licenseKey,
  });
}

/**
 * Activate a license key.
 * @param {string} licenseKey - 16-char activation code
 * @param {string} notionUserId - Notion user ID to link
 * @returns {Promise<Object>} Activation result
 */
export async function activateLicense(licenseKey, notionUserId) {
  return apiRequest('/license/activate', {
    body: { key: licenseKey, notion_user_id: notionUserId },
    licenseKey,
  });
}

/**
 * Get Notion connection status.
 * @param {string} licenseKey
 * @returns {Promise<Object>} { connected, workspace_name, database_configured, database_id }
 */
export async function getNotionStatus(licenseKey) {
  return apiRequest('/notion/status', {
    method: 'GET',
    licenseKey,
  });
}

/**
 * Get Notion OAuth authorization URL.
 * @param {string} licenseKey
 * @returns {Promise<Object>} { url }
 */
export async function getNotionAuthUrl(licenseKey) {
  return apiRequest('/notion/auth', {
    method: 'GET',
    licenseKey,
  });
}

/**
 * Set up the Notion Trading Journal database.
 * @param {string} licenseKey
 * @returns {Promise<Object>} { success, database_id, url }
 */
export async function setupNotionDatabase(licenseKey) {
  return apiRequest('/notion/setup', {
    body: {},
    licenseKey,
  });
}

/**
 * Create trade entries in Notion.
 * @param {Array} trades - Array of parsed trade objects
 * @param {string} licenseKey
 * @returns {Promise<Object>} { success, synced_count, error_count, results }
 */
export async function createNotionTrades(trades, licenseKey) {
  return apiRequest('/notion/trades', {
    body: { trades },
    timeoutMs: 60000,
    licenseKey,
  });
}

/**
 * Write AI analysis to a Notion trade page.
 * @param {string} pageId - Notion page ID
 * @param {Object} analysis - Analysis result object
 * @param {string} licenseKey
 * @returns {Promise<Object>}
 */
export async function writeNotionAnalysis(pageId, analysis, licenseKey) {
  return apiRequest('/notion/analysis', {
    body: { page_id: pageId, analysis },
    licenseKey,
  });
}

/**
 * Analyze trades via AI with a preset template.
 * @param {Array} trades - Array of trade objects
 * @param {string} analysisType - One of: daily_review, single_trade, weekly_stats, etc.
 * @param {string} language - 'zh' or 'en'
 * @param {string} licenseKey
 * @returns {Promise<Object>} { analysis }
 */
export async function analyzeTrades(trades, analysisType, language, licenseKey) {
  return apiRequest('/claude/analyze', {
    body: { trades, analysis_type: analysisType, language },
    timeoutMs: 45000,
    licenseKey,
  });
}
