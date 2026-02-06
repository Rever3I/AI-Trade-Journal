/**
 * Notion API proxy routes for AI Trade Journal Worker.
 *
 * - auth-url: generate Notion OAuth authorization URL
 * - callback: exchange authorization code for access token
 * - status: check if a valid Notion token exists for this license
 * - create-database: create the Trading Journal database with all properties
 * - sync: create trade entry pages in the database (batch with backoff)
 * - save-analysis: update a page with AI analysis text and score
 */

const NOTION_API_BASE = 'https://api.notion.com/v1';
const NOTION_API_VERSION = '2022-06-28';
const NOTION_OAUTH_AUTHORIZE_URL = 'https://api.notion.com/v1/oauth/authorize';
const NOTION_OAUTH_TOKEN_URL = 'https://api.notion.com/v1/oauth/token';

// Retry config for 429/5xx errors
const MAX_RETRIES = 3;
const BASE_DELAYS_MS = [500, 1000, 2000];
const JITTER_RANGES_MS = [200, 400, 800];
const BATCH_SEQUENTIAL_DELAY_MS = 340;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Sleep for a given number of milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate a random integer between 0 (inclusive) and max (exclusive).
 * @param {number} max
 * @returns {number}
 */
function randomJitter(max) {
  return Math.floor(Math.random() * max);
}

/**
 * Make a Notion API request with automatic retry on 429/5xx.
 *
 * @param {string} url
 * @param {object} options - fetch options (method, headers, body)
 * @param {string} accessToken
 * @returns {Promise<object>} parsed JSON response
 */
async function notionFetch(url, options, accessToken) {
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'Notion-Version': NOTION_API_VERSION,
    'Content-Type': 'application/json',
    ...options.headers,
  };

  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (response.ok) {
        return await response.json();
      }

      const status = response.status;
      const errorBody = await response.text();

      // Retryable errors: 429 (rate limit) and 5xx (server errors)
      if ((status === 429 || status >= 500) && attempt < MAX_RETRIES) {
        const delay = BASE_DELAYS_MS[attempt] + randomJitter(JITTER_RANGES_MS[attempt]);
        await sleep(delay);
        lastError = new NotionApiError(
          'NOTION_API_ERROR',
          `Notion API returned ${status} (attempt ${attempt + 1}/${MAX_RETRIES + 1}).`,
          status
        );
        continue;
      }

      // Non-retryable error or max retries exceeded
      let parsedError;
      try {
        parsedError = JSON.parse(errorBody);
      } catch {
        parsedError = { message: errorBody };
      }

      throw new NotionApiError(
        'NOTION_API_ERROR',
        parsedError.message || `Notion API returned status ${status}.`,
        status
      );
    } catch (err) {
      if (err instanceof NotionApiError) {
        throw err;
      }
      // Network error
      if (attempt < MAX_RETRIES) {
        const delay = BASE_DELAYS_MS[attempt] + randomJitter(JITTER_RANGES_MS[attempt]);
        await sleep(delay);
        lastError = err;
        continue;
      }
      throw new NotionApiError(
        'NOTION_NETWORK_ERROR',
        'Failed to connect to Notion API.',
        502
      );
    }
  }

  throw lastError || new NotionApiError('NOTION_UNKNOWN_ERROR', 'Unknown Notion API error.', 500);
}

class NotionApiError extends Error {
  constructor(code, message, httpStatus) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

/**
 * Get the stored Notion access token for a license, or return an error response.
 *
 * @param {object} license - license row from D1
 * @returns {{ token: string } | { errorResponse: Response }}
 */
function getNotionToken(license) {
  if (!license.notion_access_token) {
    return {
      errorResponse: Response.json(
        {
          error: {
            code: 'NOTION_NOT_CONNECTED',
            message: 'Notion account is not connected. Complete OAuth flow first.',
          },
        },
        { status: 400 }
      ),
    };
  }
  return { token: license.notion_access_token };
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

/**
 * GET /api/notion/auth-url
 * Generate the Notion OAuth authorization URL.
 *
 * Query params: redirect_uri (optional override)
 */
export async function getAuthUrl(request, env, ctx) {
  const clientId = env.NOTION_CLIENT_ID;

  if (!clientId) {
    return Response.json(
      { error: { code: 'CONFIG_ERROR', message: 'Notion OAuth is not configured.' } },
      { status: 500 }
    );
  }

  const redirectUri = env.NOTION_REDIRECT_URI;

  // Include the license key as state so callback can link the token
  const state = ctx.licenseKey || '';

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    owner: 'user',
    redirect_uri: redirectUri,
    state: state,
  });

  const authUrl = `${NOTION_OAUTH_AUTHORIZE_URL}?${params.toString()}`;

  return Response.json({
    data: { auth_url: authUrl },
  });
}

/**
 * GET /api/notion/callback
 * OAuth callback: exchange authorization code for access token.
 *
 * Query params: code, state (license key)
 * No auth required (called by Notion redirect).
 */
export async function handleOAuthCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const errorParam = url.searchParams.get('error');

  if (errorParam) {
    return new Response(
      generateCallbackHtml(false, 'Notion authorization was denied or failed.'),
      { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }

  if (!code) {
    return new Response(
      generateCallbackHtml(false, 'Missing authorization code from Notion.'),
      { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }

  if (!state) {
    return new Response(
      generateCallbackHtml(false, 'Missing license key in state parameter.'),
      { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }

  try {
    // Exchange code for token
    const basicAuth = btoa(`${env.NOTION_CLIENT_ID}:${env.NOTION_CLIENT_SECRET}`);

    const tokenResponse = await fetch(NOTION_OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: env.NOTION_REDIRECT_URI,
      }),
    });

    if (!tokenResponse.ok) {
      const errBody = await tokenResponse.text();
      return new Response(
        generateCallbackHtml(false, 'Failed to exchange authorization code for token.'),
        { status: 502, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    }

    // Validate that the license key (state) exists and is active before storing token
    const licenseRow = await env.DB.prepare(
      'SELECT key, status FROM licenses WHERE key = ?'
    )
      .bind(state)
      .first();

    if (!licenseRow || licenseRow.status !== 'active') {
      return new Response(
        generateCallbackHtml(false, 'Invalid or inactive license key.'),
        { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    const workspaceId = tokenData.workspace_id;
    const ownerUserId = tokenData.owner && tokenData.owner.user ? tokenData.owner.user.id : null;

    if (!accessToken) {
      return new Response(
        generateCallbackHtml(false, 'Notion did not return an access token.'),
        { status: 502, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    }

    // Store token linked to validated license key
    await env.DB.prepare(
      `UPDATE licenses
       SET notion_access_token = ?,
           notion_workspace_id = ?,
           user_notion_id = ?
       WHERE key = ? AND status = 'active'`
    )
      .bind(accessToken, workspaceId, ownerUserId, state)
      .run();

    return new Response(
      generateCallbackHtml(true, 'Notion connected successfully! You can close this window.'),
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  } catch (err) {
    return new Response(
      generateCallbackHtml(false, 'An unexpected error occurred during Notion authorization.'),
      { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}

/**
 * Generate a simple HTML page for the OAuth callback result.
 * @param {boolean} success
 * @param {string} message
 * @returns {string}
 */
function generateCallbackHtml(success, message) {
  const icon = success ? '\u2705' : '\u274C';
  const title = success ? 'Authorization Successful' : 'Authorization Failed';
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} - AI Trade Journal</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #1a1a2e; color: #e0e0e0; }
    .card { text-align: center; padding: 2rem; max-width: 400px; }
    .icon { font-size: 3rem; margin-bottom: 1rem; }
    h1 { font-size: 1.25rem; margin-bottom: 0.5rem; }
    p { color: #a0a0b0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${icon}</div>
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
  <script>
    // Notify the extension that OAuth is complete
    if (window.opener) {
      window.opener.postMessage({ type: 'notion-oauth-complete', success: ${success} }, '*');
    }
    // Auto-close after 3 seconds on success
    ${success ? 'setTimeout(() => window.close(), 3000);' : ''}
  </script>
</body>
</html>`;
}

/**
 * GET /api/notion/status
 * Check if we have a valid Notion token for this license.
 */
export async function getNotionStatus(request, env, ctx) {
  const license = ctx.license;

  if (!license.notion_access_token) {
    return Response.json({
      data: {
        connected: false,
        workspace_id: null,
        database_id: null,
      },
    });
  }

  // Optionally verify the token is still valid by calling Notion
  try {
    const userInfo = await notionFetch(
      `${NOTION_API_BASE}/users/me`,
      { method: 'GET' },
      license.notion_access_token
    );

    return Response.json({
      data: {
        connected: true,
        workspace_id: license.notion_workspace_id,
        database_id: license.notion_database_id || null,
        bot_name: userInfo.name || null,
      },
    });
  } catch (err) {
    // Token might be expired/revoked
    if (err instanceof NotionApiError && err.httpStatus === 401) {
      return Response.json({
        data: {
          connected: false,
          token_expired: true,
          workspace_id: license.notion_workspace_id,
          database_id: null,
        },
      });
    }

    return Response.json(
      { error: { code: 'NOTION_STATUS_CHECK_FAILED', message: 'Failed to verify Notion connection.' } },
      { status: 502 }
    );
  }
}

/**
 * POST /api/notion/create-database
 * Create the Trading Journal database in user's Notion workspace.
 *
 * Body: { parent_page_id: string }
 *
 * All 18 properties from the CLAUDE.md schema are created.
 */
export async function createDatabase(request, env, ctx) {
  const license = ctx.license;
  const tokenResult = getNotionToken(license);
  if (tokenResult.errorResponse) {
    return tokenResult.errorResponse;
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON.' } },
      { status: 400 }
    );
  }

  const parentPageId = body.parent_page_id;

  if (!parentPageId || typeof parentPageId !== 'string') {
    return Response.json(
      { error: { code: 'MISSING_FIELD', message: 'Field "parent_page_id" is required.' } },
      { status: 400 }
    );
  }

  const databasePayload = {
    parent: { type: 'page_id', page_id: parentPageId },
    title: [{ type: 'text', text: { content: 'AI Trading Journal' } }],
    icon: { type: 'emoji', emoji: '\uD83D\uDCCA' },
    properties: {
      // Symbol is the title property (required by Notion)
      'Symbol': {
        title: {},
      },
      'Trade Date': {
        date: {},
      },
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
      'Quantity': {
        number: { format: 'number' },
      },
      'Entry Price': {
        number: { format: 'dollar' },
      },
      'Exit Price': {
        number: { format: 'dollar' },
      },
      'P/L': {
        formula: {
          expression: 'if(and(prop("Entry Price") != 0, prop("Exit Price") != 0, prop("Quantity") != 0), if(or(prop("Action") == "Buy", prop("Action") == "Cover"), multiply(subtract(prop("Exit Price"), prop("Entry Price")), prop("Quantity")), multiply(subtract(prop("Entry Price"), prop("Exit Price")), prop("Quantity"))), 0)',
        },
      },
      'P/L %': {
        formula: {
          expression: 'if(and(prop("Entry Price") != 0, prop("Exit Price") != 0), if(or(prop("Action") == "Buy", prop("Action") == "Cover"), round(multiply(divide(subtract(prop("Exit Price"), prop("Entry Price")), prop("Entry Price")), 100) * 100) / 100, round(multiply(divide(subtract(prop("Entry Price"), prop("Exit Price")), prop("Entry Price")), 100) * 100) / 100), 0)',
        },
      },
      'R-Multiple': {
        number: { format: 'number' },
      },
      'Commission': {
        number: { format: 'dollar' },
      },
      'Setup Type': {
        select: {
          options: [
            { name: 'Breakout', color: 'blue' },
            { name: 'Pullback', color: 'purple' },
            { name: 'Range', color: 'yellow' },
            { name: 'Momentum', color: 'green' },
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
            { name: 'Fear', color: 'purple' },
          ],
        },
      },
      'AI Analysis': {
        rich_text: {},
      },
      'AI Score': {
        number: { format: 'number' },
      },
      'Notes': {
        rich_text: {},
      },
      'Screenshot': {
        files: {},
      },
      'Broker': {
        select: {
          options: [
            { name: 'Futu', color: 'orange' },
            { name: 'IBKR', color: 'red' },
            { name: 'Webull', color: 'blue' },
            { name: 'Schwab', color: 'green' },
            { name: 'Tiger', color: 'yellow' },
            { name: 'Longbridge', color: 'purple' },
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
    },
  };

  try {
    const database = await notionFetch(
      `${NOTION_API_BASE}/databases`,
      {
        method: 'POST',
        body: JSON.stringify(databasePayload),
      },
      tokenResult.token
    );

    // Store the database ID for future sync calls
    await env.DB.prepare(
      'UPDATE licenses SET notion_database_id = ? WHERE key = ?'
    )
      .bind(database.id, ctx.licenseKey)
      .run();

    return Response.json({
      data: {
        database_id: database.id,
        url: database.url,
        title: 'AI Trading Journal',
      },
    });
  } catch (err) {
    if (err instanceof NotionApiError) {
      return Response.json(
        { error: { code: err.code, message: err.message } },
        { status: err.httpStatus >= 500 ? 502 : err.httpStatus }
      );
    }
    return Response.json(
      { error: { code: 'CREATE_DB_FAILED', message: 'Failed to create Notion database.' } },
      { status: 500 }
    );
  }
}

/**
 * POST /api/notion/sync
 * Create trade entry pages in the Notion database.
 *
 * Body: { trades: array, database_id?: string }
 *
 * For batches of 10+, sequential writes with 340ms delay.
 * Returns progress info.
 */
export async function syncTrades(request, env, ctx) {
  const license = ctx.license;
  const tokenResult = getNotionToken(license);
  if (tokenResult.errorResponse) {
    return tokenResult.errorResponse;
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON.' } },
      { status: 400 }
    );
  }

  const { trades, database_id } = body;
  const dbId = database_id || license.notion_database_id;

  if (!dbId) {
    return Response.json(
      {
        error: {
          code: 'NO_DATABASE',
          message: 'No Notion database configured. Create one first via /api/notion/create-database.',
        },
      },
      { status: 400 }
    );
  }

  if (!trades || !Array.isArray(trades) || trades.length === 0) {
    return Response.json(
      { error: { code: 'MISSING_FIELD', message: 'Field "trades" is required and must be a non-empty array.' } },
      { status: 400 }
    );
  }

  if (trades.length > 100) {
    return Response.json(
      { error: { code: 'BATCH_TOO_LARGE', message: 'Maximum 100 trades per sync request.' } },
      { status: 400 }
    );
  }

  const results = [];
  const errors = [];
  const useBatchDelay = trades.length >= 10;

  for (let i = 0; i < trades.length; i++) {
    const trade = trades[i];

    // Add delay for batches to respect Notion rate limits (3 req/s)
    if (useBatchDelay && i > 0) {
      await sleep(BATCH_SEQUENTIAL_DELAY_MS);
    }

    try {
      const pagePayload = buildTradePagePayload(dbId, trade);
      const page = await notionFetch(
        `${NOTION_API_BASE}/pages`,
        {
          method: 'POST',
          body: JSON.stringify(pagePayload),
        },
        tokenResult.token
      );

      results.push({
        index: i,
        success: true,
        page_id: page.id,
        symbol: trade.symbol,
      });
    } catch (err) {
      errors.push({
        index: i,
        success: false,
        symbol: trade.symbol || 'unknown',
        error: err instanceof NotionApiError ? err.message : 'Failed to create page.',
      });
    }
  }

  const totalSuccess = results.length;
  const totalErrors = errors.length;

  return Response.json({
    data: {
      total: trades.length,
      synced: totalSuccess,
      failed: totalErrors,
      results,
      errors,
    },
  });
}

/**
 * Build a Notion page creation payload from a trade object.
 *
 * @param {string} databaseId
 * @param {object} trade
 * @returns {object}
 */
function buildTradePagePayload(databaseId, trade) {
  const properties = {
    'Symbol': {
      title: [{ text: { content: trade.symbol || 'Unknown' } }],
    },
  };

  if (trade.datetime) {
    properties['Trade Date'] = {
      date: { start: trade.datetime },
    };
  }

  if (trade.action) {
    const actionMap = {
      'BUY': 'Buy',
      'SELL': 'Sell',
      'SHORT': 'Short',
      'COVER': 'Cover',
    };
    const actionName = actionMap[trade.action.toUpperCase()] || trade.action;
    properties['Action'] = {
      select: { name: actionName },
    };
  }

  if (typeof trade.quantity === 'number') {
    properties['Quantity'] = { number: trade.quantity };
  }

  if (typeof trade.price === 'number') {
    properties['Entry Price'] = { number: trade.price };
  }

  if (typeof trade.exit_price === 'number') {
    properties['Exit Price'] = { number: trade.exit_price };
  }

  if (typeof trade.r_multiple === 'number') {
    properties['R-Multiple'] = { number: trade.r_multiple };
  }

  if (typeof trade.commission === 'number') {
    properties['Commission'] = { number: trade.commission };
  }

  if (trade.setup_type) {
    properties['Setup Type'] = {
      select: { name: trade.setup_type },
    };
  }

  if (trade.broker_detected && trade.broker_detected !== 'unknown') {
    const brokerMap = {
      'Futu': 'Futu',
      'IBKR': 'IBKR',
      'Webull': 'Webull',
      'Schwab': 'Schwab',
      'Tiger': 'Tiger',
      'Longbridge': 'Longbridge',
    };
    const brokerName = brokerMap[trade.broker_detected] || 'Other';
    properties['Broker'] = {
      select: { name: brokerName },
    };
  }

  properties['Sync Status'] = {
    select: { name: 'Synced' },
  };

  return {
    parent: { database_id: databaseId },
    properties,
  };
}

/**
 * POST /api/notion/save-analysis
 * Update a Notion page with AI analysis text and score.
 *
 * Body: { page_id: string, analysis_text: string, score: number }
 */
export async function saveAnalysis(request, env, ctx) {
  const license = ctx.license;
  const tokenResult = getNotionToken(license);
  if (tokenResult.errorResponse) {
    return tokenResult.errorResponse;
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON.' } },
      { status: 400 }
    );
  }

  const { page_id, analysis_text, score } = body;

  if (!page_id || typeof page_id !== 'string') {
    return Response.json(
      { error: { code: 'MISSING_FIELD', message: 'Field "page_id" is required.' } },
      { status: 400 }
    );
  }

  if (!analysis_text || typeof analysis_text !== 'string') {
    return Response.json(
      { error: { code: 'MISSING_FIELD', message: 'Field "analysis_text" is required.' } },
      { status: 400 }
    );
  }

  const updatePayload = {
    properties: {
      'AI Analysis': {
        rich_text: [
          {
            text: {
              content: analysis_text.slice(0, 2000), // Notion rich_text limit per block
            },
          },
        ],
      },
    },
  };

  if (typeof score === 'number' && score >= 0 && score <= 100) {
    updatePayload.properties['AI Score'] = { number: score };
  }

  try {
    const page = await notionFetch(
      `${NOTION_API_BASE}/pages/${page_id}`,
      {
        method: 'PATCH',
        body: JSON.stringify(updatePayload),
      },
      tokenResult.token
    );

    return Response.json({
      data: {
        page_id: page.id,
        updated: true,
      },
    });
  } catch (err) {
    if (err instanceof NotionApiError) {
      return Response.json(
        { error: { code: err.code, message: err.message } },
        { status: err.httpStatus >= 500 ? 502 : err.httpStatus }
      );
    }
    return Response.json(
      { error: { code: 'SAVE_ANALYSIS_FAILED', message: 'Failed to save analysis to Notion page.' } },
      { status: 500 }
    );
  }
}
