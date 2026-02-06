import { getLicenseInfo } from './storage.js';
import { t } from './i18n.js';

const WORKER_URL = typeof import.meta !== 'undefined' && import.meta.env
  ? (import.meta.env.VITE_WORKER_URL || 'http://localhost:8787')
  : 'http://localhost:8787';

const DEFAULT_TIMEOUT_MS = 15000;
const ANALYSIS_TIMEOUT_MS = 30000;

class ApiError extends Error {
  constructor(message, code, statusCode) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

async function request(path, options = {}) {
  const { timeout = DEFAULT_TIMEOUT_MS, ...fetchOptions } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  const licenseInfo = await getLicenseInfo();
  const headers = {
    'Content-Type': 'application/json',
    ...(licenseInfo.key ? { 'X-License-Key': licenseInfo.key } : {}),
    ...(fetchOptions.headers || {}),
  };

  try {
    const response = await fetch(`${WORKER_URL}${path}`, {
      ...fetchOptions,
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errorCode = data.error?.code || 'UNKNOWN';
      const errorMsg = mapErrorMessage(errorCode, data);
      throw new ApiError(errorMsg, errorCode, response.status);
    }

    return data;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof ApiError) throw err;
    if (err.name === 'AbortError') {
      throw new ApiError(t('error.network'), 'TIMEOUT', 0);
    }
    throw new ApiError(
      t('error.network'),
      'NETWORK_ERROR',
      0
    );
  }
}

function mapErrorMessage(code, data) {
  switch (code) {
    case 'RATE_LIMIT_EXCEEDED':
      return t('error.rateLimit', {
        used: data.error?.used || '?',
        limit: data.error?.limit || 10,
      });
    case 'INVALID_LICENSE':
      return t('error.invalidLicense');
    case 'LICENSE_ALREADY_USED':
      return t('error.licenseUsed');
    case 'NOTION_DISCONNECTED':
      return t('error.notionDisconnected');
    case 'PARSE_FAILED':
      return t('error.parseFailed');
    default:
      return data.error?.message || t('error.unknown');
  }
}

export async function parseTrades(rawText) {
  return request('/api/parse', {
    method: 'POST',
    body: JSON.stringify({ text: rawText }),
    timeout: ANALYSIS_TIMEOUT_MS,
  });
}

export async function analyzeTrades(trades, analysisType, userHistorySummary) {
  return request('/api/analyze', {
    method: 'POST',
    body: JSON.stringify({
      trades,
      analysis_type: analysisType,
      user_history_summary: userHistorySummary || null,
    }),
    timeout: ANALYSIS_TIMEOUT_MS,
  });
}

export async function activateLicense(licenseKey) {
  return request('/api/license/activate', {
    method: 'POST',
    body: JSON.stringify({ key: licenseKey }),
  });
}

export async function validateLicense() {
  return request('/api/license/validate', {
    method: 'GET',
  });
}

export async function getUsageInfo() {
  return request('/api/license/usage', {
    method: 'GET',
  });
}

export async function getNotionAuthUrl() {
  return request('/api/notion/auth-url', {
    method: 'GET',
  });
}

export async function checkNotionStatus() {
  return request('/api/notion/status', {
    method: 'GET',
  });
}

export async function createNotionDatabase() {
  return request('/api/notion/create-database', {
    method: 'POST',
  });
}

export async function syncTradesToNotion(trades, databaseId) {
  return request('/api/notion/sync', {
    method: 'POST',
    body: JSON.stringify({ trades, database_id: databaseId }),
    timeout: ANALYSIS_TIMEOUT_MS,
  });
}

export async function saveAnalysisToNotion(pageId, analysis) {
  return request('/api/notion/save-analysis', {
    method: 'POST',
    body: JSON.stringify({ page_id: pageId, analysis }),
  });
}

export async function healthCheck() {
  return request('/health', { method: 'GET', timeout: 5000 });
}

export { ApiError, WORKER_URL };
