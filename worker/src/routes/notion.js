/**
 * Notion API proxy route handler.
 * Handles OAuth flow, trade sync, analysis writes, and database setup.
 * Notion access tokens are stored server-side only — never sent to client.
 */

import { jsonResponse } from '../index.js';

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
const NOTION_RATE_DELAY_MS = 340; // ~3 req/s

/**
 * Handle Notion API routes.
 * @param {Request} request
 * @param {Object} env
 * @param {string} path
 * @returns {Promise<Response>}
 */
export async function handleNotionRoutes(request, env, path) {
  switch (path) {
    case '/notion/auth':
      return handleAuth(request, env);
    case '/notion/callback':
      return handleOAuthCallback(request, env);
    case '/notion/status':
      return handleStatus(request, env);
    case '/notion/setup':
      if (request.method === 'POST') return handleSetup(request, env);
      return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405, env);
    case '/notion/trades':
      if (request.method === 'POST') return handleCreateTrades(request, env);
      return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405, env);
    case '/notion/analysis':
      if (request.method === 'POST') return handleWriteAnalysis(request, env);
      return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405, env);
    default:
      return jsonResponse({ error: 'NOT_FOUND' }, 404, env);
  }
}

// ─── OAuth Flow ──────────────────────────────────────────────────────────────

/**
 * GET /notion/auth — generate OAuth URL with CSRF state param.
 */
async function handleAuth(request, env) {
  const clientId = env.NOTION_CLIENT_ID;
  const redirectUri = env.NOTION_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return jsonResponse({ error: 'NOTION_NOT_CONFIGURED' }, 503, env);
  }

  // Generate random state token for CSRF prevention
  const state = crypto.randomUUID();
  const licenseKey = request.licenseKey;

  // Store state → licenseKey mapping in D1
  if (env.DB && licenseKey) {
    try {
      await env.DB.prepare(
        'INSERT INTO oauth_states (state, license_key) VALUES (?, ?)'
      ).bind(state, licenseKey).run();
    } catch {
      return jsonResponse({ error: 'STATE_CREATION_FAILED' }, 500, env);
    }
  }

  const authUrl = `https://api.notion.com/v1/oauth/authorize?client_id=${clientId}&response_type=code&owner=user&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;

  return jsonResponse({ url: authUrl }, 200, env);
}

/**
 * GET /notion/callback — exchange code for token, store in D1.
 * This is browser-navigated (no extension auth headers).
 */
async function handleOAuthCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    return htmlResponse('Authorization was denied. You can close this tab.');
  }

  if (!code) {
    return jsonResponse({ error: 'MISSING_CODE' }, 400, env);
  }

  // Verify state token to prevent CSRF
  let licenseKey = null;
  if (state && env.DB) {
    try {
      const stateRow = await env.DB.prepare(
        'SELECT license_key FROM oauth_states WHERE state = ?'
      ).bind(state).first();

      if (!stateRow) {
        return htmlResponse('Invalid authorization state. Please try connecting again.');
      }
      licenseKey = stateRow.license_key;

      // Clean up used state token
      await env.DB.prepare('DELETE FROM oauth_states WHERE state = ?').bind(state).run();
      // Clean up expired states (older than 10 minutes)
      await env.DB.prepare(
        "DELETE FROM oauth_states WHERE created_at < datetime('now', '-10 minutes')"
      ).run();
    } catch {
      return htmlResponse('Authorization verification failed. Please try again.');
    }
  }

  if (!licenseKey) {
    return htmlResponse('Could not verify your identity. Please try connecting again from Settings.');
  }

  // Exchange authorization code for access token
  const credentials = btoa(`${env.NOTION_CLIENT_ID}:${env.NOTION_CLIENT_SECRET}`);

  try {
    const response = await fetch('https://api.notion.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${credentials}`,
        'Notion-Version': NOTION_VERSION,
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: env.NOTION_REDIRECT_URI,
      }),
    });

    if (!response.ok) {
      return htmlResponse('Notion authorization failed. Please try again.');
    }

    const tokenData = await response.json();

    // Store token securely in D1 (server-side only)
    await env.DB.prepare(
      `INSERT INTO notion_connections (license_key, access_token, workspace_id, workspace_name, bot_id, updated_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(license_key) DO UPDATE SET
         access_token = excluded.access_token,
         workspace_id = excluded.workspace_id,
         workspace_name = excluded.workspace_name,
         bot_id = excluded.bot_id,
         updated_at = CURRENT_TIMESTAMP`
    ).bind(
      licenseKey,
      tokenData.access_token,
      tokenData.workspace_id || null,
      tokenData.workspace_name || null,
      tokenData.bot_id || null,
    ).run();

    return htmlResponse('Notion connected successfully! You can close this tab and return to the extension.');
  } catch {
    return htmlResponse('An error occurred during authorization. Please try again.');
  }
}

/**
 * GET /notion/status — check if user has a valid Notion connection.
 */
async function handleStatus(request, env) {
  const licenseKey = request.licenseKey;
  if (!licenseKey || !env.DB) {
    return jsonResponse({ connected: false }, 200, env);
  }

  try {
    const conn = await env.DB.prepare(
      'SELECT workspace_id, workspace_name, template_db_id FROM notion_connections WHERE license_key = ?'
    ).bind(licenseKey).first();

    if (!conn) {
      return jsonResponse({ connected: false }, 200, env);
    }

    return jsonResponse({
      connected: true,
      workspace_name: conn.workspace_name,
      workspace_id: conn.workspace_id,
      database_configured: !!conn.template_db_id,
      database_id: conn.template_db_id || null,
    }, 200, env);
  } catch {
    return jsonResponse({ connected: false }, 200, env);
  }
}

// ─── Database Setup ──────────────────────────────────────────────────────────

/**
 * POST /notion/setup — create the Trading Journal database in user's workspace.
 */
async function handleSetup(request, env) {
  const licenseKey = request.licenseKey;
  const accessToken = await getAccessToken(licenseKey, env);
  if (!accessToken) {
    return jsonResponse({ error: 'NOTION_NOT_CONNECTED' }, 401, env);
  }

  // Check if DB already exists
  const conn = await env.DB.prepare(
    'SELECT template_db_id FROM notion_connections WHERE license_key = ?'
  ).bind(licenseKey).first();

  if (conn && conn.template_db_id) {
    return jsonResponse({
      success: true,
      database_id: conn.template_db_id,
      message: 'Database already configured',
    }, 200, env);
  }

  // Create a new database in the user's workspace
  try {
    const dbResponse = await notionFetch(accessToken, '/databases', 'POST', {
      parent: { type: 'page', page_id: await findOrCreateParentPage(accessToken) },
      title: [{ type: 'text', text: { content: 'AI Trading Journal' } }],
      properties: buildDatabaseSchema(),
    });

    if (!dbResponse.ok) {
      const errText = await dbResponse.text();
      return jsonResponse({ error: 'DB_CREATION_FAILED', detail: 'Could not create database' }, 502, env);
    }

    const db = await dbResponse.json();
    const dbId = db.id;

    // Store the database ID
    await env.DB.prepare(
      'UPDATE notion_connections SET template_db_id = ?, updated_at = CURRENT_TIMESTAMP WHERE license_key = ?'
    ).bind(dbId, licenseKey).run();

    return jsonResponse({
      success: true,
      database_id: dbId,
      url: db.url,
    }, 200, env);
  } catch {
    return jsonResponse({ error: 'SETUP_FAILED' }, 500, env);
  }
}

// ─── Trade CRUD ──────────────────────────────────────────────────────────────

/**
 * POST /notion/trades — create trade entries in user's Notion database.
 */
async function handleCreateTrades(request, env) {
  const licenseKey = request.licenseKey;
  const accessToken = await getAccessToken(licenseKey, env);
  if (!accessToken) {
    return jsonResponse({ error: 'NOTION_NOT_CONNECTED' }, 401, env);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'INVALID_JSON' }, 400, env);
  }

  if (!body.trades || !Array.isArray(body.trades) || body.trades.length === 0) {
    return jsonResponse({ error: 'NO_TRADES' }, 400, env);
  }

  const dbId = await getDatabaseId(licenseKey, env);
  if (!dbId) {
    return jsonResponse({ error: 'DATABASE_NOT_CONFIGURED', message: 'Please set up your Notion database first' }, 400, env);
  }

  const results = [];
  const errors = [];

  // Create pages one at a time to respect Notion rate limits (~3 req/s)
  for (let i = 0; i < body.trades.length; i++) {
    const trade = body.trades[i];
    try {
      const properties = mapTradeToNotionProperties(trade);
      const response = await notionFetch(accessToken, '/pages', 'POST', {
        parent: { database_id: dbId },
        properties,
      });

      if (response.ok) {
        const page = await response.json();
        results.push({ symbol: trade.symbol, page_id: page.id, url: page.url });
      } else {
        const errBody = await response.json().catch(() => ({}));
        if (response.status === 429) {
          // Back off and retry once on rate limit
          await delay(1000);
          const retryResponse = await notionFetch(accessToken, '/pages', 'POST', {
            parent: { database_id: dbId },
            properties,
          });
          if (retryResponse.ok) {
            const page = await retryResponse.json();
            results.push({ symbol: trade.symbol, page_id: page.id, url: page.url });
          } else {
            errors.push({ symbol: trade.symbol, error: 'RATE_LIMITED' });
          }
        } else {
          errors.push({ symbol: trade.symbol, error: errBody.message || 'WRITE_FAILED' });
        }
      }

      // Delay between requests to respect rate limits
      if (i < body.trades.length - 1) {
        await delay(NOTION_RATE_DELAY_MS);
      }
    } catch {
      errors.push({ symbol: trade.symbol, error: 'REQUEST_FAILED' });
    }
  }

  return jsonResponse({
    success: errors.length === 0,
    synced_count: results.length,
    error_count: errors.length,
    results,
    errors: errors.length > 0 ? errors : undefined,
  }, 200, env);
}

/**
 * POST /notion/analysis — write AI analysis to a trade entry.
 */
async function handleWriteAnalysis(request, env) {
  const licenseKey = request.licenseKey;
  const accessToken = await getAccessToken(licenseKey, env);
  if (!accessToken) {
    return jsonResponse({ error: 'NOTION_NOT_CONNECTED' }, 401, env);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'INVALID_JSON' }, 400, env);
  }

  const { page_id, analysis } = body;
  if (!page_id || !analysis) {
    return jsonResponse({ error: 'MISSING_FIELDS', message: 'page_id and analysis are required' }, 400, env);
  }

  try {
    // Format analysis text for Notion rich text
    const analysisText = typeof analysis === 'string'
      ? analysis
      : formatAnalysisAsText(analysis);

    const properties = {
      'AI Analysis': {
        rich_text: [{ type: 'text', text: { content: analysisText.slice(0, 2000) } }],
      },
    };

    if (analysis.score !== undefined) {
      properties['AI Score'] = { number: analysis.score };
    }

    const response = await notionFetch(accessToken, `/pages/${page_id}`, 'PATCH', { properties });

    if (!response.ok) {
      return jsonResponse({ error: 'ANALYSIS_WRITE_FAILED' }, 502, env);
    }

    return jsonResponse({ success: true, page_id }, 200, env);
  } catch {
    return jsonResponse({ error: 'ANALYSIS_WRITE_FAILED' }, 500, env);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Get the Notion access token for a license key from D1.
 */
async function getAccessToken(licenseKey, env) {
  if (!licenseKey || !env.DB) return null;
  try {
    const conn = await env.DB.prepare(
      'SELECT access_token FROM notion_connections WHERE license_key = ?'
    ).bind(licenseKey).first();
    return conn?.access_token || null;
  } catch {
    return null;
  }
}

/**
 * Get the configured database ID for a license key.
 */
async function getDatabaseId(licenseKey, env) {
  if (!licenseKey || !env.DB) return null;
  try {
    const conn = await env.DB.prepare(
      'SELECT template_db_id FROM notion_connections WHERE license_key = ?'
    ).bind(licenseKey).first();
    return conn?.template_db_id || null;
  } catch {
    return null;
  }
}

/**
 * Make an authenticated request to the Notion API.
 */
async function notionFetch(accessToken, path, method = 'GET', body = null) {
  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
  };
  if (body) {
    options.body = JSON.stringify(body);
  }
  return fetch(`${NOTION_API}${path}`, options);
}

/**
 * Find an existing parent page or search for one the bot has access to.
 * Notion OAuth integrations need a parent page to create databases.
 */
async function findOrCreateParentPage(accessToken) {
  // Search for pages the bot has access to
  const response = await notionFetch(accessToken, '/search', 'POST', {
    filter: { property: 'object', value: 'page' },
    page_size: 1,
  });

  if (response.ok) {
    const data = await response.json();
    if (data.results && data.results.length > 0) {
      return data.results[0].id;
    }
  }

  // If no pages found, the user needs to share a page with the integration
  throw new Error('NO_ACCESSIBLE_PAGES');
}

/**
 * Build the Notion database schema from CLAUDE.md spec.
 */
function buildDatabaseSchema() {
  return {
    'Symbol': { title: {} },
    'Trade Date': { date: {} },
    'Action': {
      select: {
        options: [
          { name: 'Buy', color: 'green' },
          { name: 'Sell', color: 'red' },
          { name: 'Short', color: 'orange' },
          { name: 'Cover', color: 'blue' },
        ],
      },
    },
    'Quantity': { number: { format: 'number' } },
    'Entry Price': { number: { format: 'dollar' } },
    'Exit Price': { number: { format: 'dollar' } },
    'Commission': { number: { format: 'dollar' } },
    'R-Multiple': { number: { format: 'number' } },
    'Setup Type': {
      select: {
        options: [
          { name: 'Breakout', color: 'green' },
          { name: 'Pullback', color: 'blue' },
          { name: 'Range', color: 'yellow' },
          { name: 'Momentum', color: 'red' },
          { name: 'Other', color: 'gray' },
        ],
      },
    },
    'Emotion Tag': {
      multi_select: {
        options: [
          { name: 'Disciplined', color: 'green' },
          { name: 'FOMO', color: 'red' },
          { name: 'Revenge', color: 'orange' },
          { name: 'Overconfident', color: 'yellow' },
          { name: 'Fear', color: 'gray' },
        ],
      },
    },
    'AI Analysis': { rich_text: {} },
    'AI Score': { number: { format: 'number' } },
    'Notes': { rich_text: {} },
    'Broker': {
      select: {
        options: [
          { name: 'Futu', color: 'green' },
          { name: 'IBKR', color: 'blue' },
          { name: 'Webull', color: 'orange' },
          { name: 'Schwab', color: 'purple' },
          { name: 'Tiger', color: 'yellow' },
          { name: 'Longbridge', color: 'pink' },
          { name: 'Other', color: 'gray' },
        ],
      },
    },
    'Sync Status': {
      select: {
        options: [
          { name: 'Synced', color: 'green' },
          { name: 'Pending', color: 'yellow' },
          { name: 'Error', color: 'red' },
        ],
      },
    },
  };
}

/**
 * Map a parsed trade object to Notion page properties.
 */
function mapTradeToNotionProperties(trade) {
  const props = {
    'Symbol': {
      title: [{ text: { content: trade.symbol || 'Unknown' } }],
    },
    'Action': {
      select: { name: mapActionName(trade.action) },
    },
    'Quantity': {
      number: typeof trade.quantity === 'number' ? trade.quantity : 0,
    },
    'Entry Price': {
      number: typeof trade.price === 'number' ? trade.price : 0,
    },
    'Sync Status': {
      select: { name: 'Synced' },
    },
  };

  if (trade.datetime) {
    props['Trade Date'] = { date: { start: trade.datetime } };
  }
  if (typeof trade.commission === 'number') {
    props['Commission'] = { number: trade.commission };
  }
  if (trade.broker_detected && trade.broker_detected !== 'unknown') {
    props['Broker'] = { select: { name: mapBrokerName(trade.broker_detected) } };
  }

  return props;
}

/** Normalize action names to match Notion select options. */
function mapActionName(action) {
  const map = { BUY: 'Buy', SELL: 'Sell', SHORT: 'Short', COVER: 'Cover' };
  return map[action] || 'Buy';
}

/** Normalize broker names to match Notion select options. */
function mapBrokerName(broker) {
  const map = { Futu: 'Futu', IBKR: 'IBKR', Webull: 'Webull', Schwab: 'Schwab', Tiger: 'Tiger', Longbridge: 'Longbridge' };
  return map[broker] || 'Other';
}

/**
 * Format an analysis JSON object as readable text for Notion rich_text.
 */
function formatAnalysisAsText(analysis) {
  const parts = [];
  if (analysis.summary) parts.push(analysis.summary);
  if (analysis.metrics) {
    const m = analysis.metrics;
    parts.push(`\nWin Rate: ${(m.win_rate * 100).toFixed(0)}% | P/L: ${m.total_pnl >= 0 ? '+' : ''}${m.total_pnl?.toFixed(2) || '0'} | Score: ${analysis.score || '-'}`);
  }
  if (analysis.insights && analysis.insights.length > 0) {
    parts.push('\n--- Insights ---');
    for (const insight of analysis.insights) {
      const icon = insight.severity === 'critical' ? '[!]' : insight.severity === 'warning' ? '[*]' : '[-]';
      parts.push(`${icon} ${insight.text}`);
    }
  }
  if (analysis.action_items && analysis.action_items.length > 0) {
    parts.push('\n--- Action Items ---');
    for (const item of analysis.action_items) {
      parts.push(`• ${item}`);
    }
  }
  return parts.join('\n');
}

/** Simple delay helper for rate limiting. */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Create a simple HTML response for OAuth callback. */
function htmlResponse(message) {
  const escaped = message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return new Response(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>AI Trade Journal</title><style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#1a1a2e;color:#e0e0e0}p{text-align:center;max-width:400px;line-height:1.6}</style></head><body><p>${escaped}</p></body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}
