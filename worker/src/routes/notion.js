/**
 * Notion API proxy route handler.
 * Handles OAuth flow and proxies Notion API requests.
 */

import { jsonResponse } from '../index.js';

/**
 * Handle Notion API routes.
 * @param {Request} request
 * @param {Object} env
 * @param {string} path
 * @returns {Promise<Response>}
 */
export async function handleNotionRoutes(request, env, path) {
  switch (path) {
    case '/notion/auth-url':
      return handleAuthUrl(request, env);

    case '/notion/callback':
      return handleOAuthCallback(request, env);

    case '/notion/sync':
      if (request.method === 'POST') {
        return handleSync(request, env);
      }
      return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405);

    default:
      return jsonResponse({ error: 'NOT_FOUND' }, 404);
  }
}

/**
 * Generate Notion OAuth authorization URL.
 * @param {Request} request
 * @param {Object} env
 * @returns {Response}
 */
function handleAuthUrl(request, env) {
  const clientId = env.NOTION_CLIENT_ID;
  const redirectUri = env.NOTION_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return jsonResponse({ error: 'NOTION_NOT_CONFIGURED' }, 503);
  }

  const authUrl = `https://api.notion.com/v1/oauth/authorize?client_id=${clientId}&response_type=code&owner=user&redirect_uri=${encodeURIComponent(redirectUri)}`;

  return jsonResponse({ url: authUrl });
}

/**
 * Handle Notion OAuth callback — exchange code for access token.
 * @param {Request} request
 * @param {Object} env
 * @returns {Promise<Response>}
 */
async function handleOAuthCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  if (!code) {
    return jsonResponse({ error: 'MISSING_CODE' }, 400);
  }

  const credentials = btoa(`${env.NOTION_CLIENT_ID}:${env.NOTION_CLIENT_SECRET}`);

  try {
    const response = await fetch('https://api.notion.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${credentials}`,
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: env.NOTION_REDIRECT_URI,
      }),
    });

    if (!response.ok) {
      return jsonResponse({ error: 'OAUTH_FAILED' }, 502);
    }

    const tokenData = await response.json();

    // Store the access token securely (associated with license key)
    // Implementation will be expanded in Sprint 2
    return new Response(
      '<html><body><script>window.close();</script><p>Authorization successful. You can close this tab.</p></body></html>',
      {
        headers: { 'Content-Type': 'text/html' },
      }
    );
  } catch {
    return jsonResponse({ error: 'OAUTH_ERROR' }, 500);
  }
}

/**
 * Sync trades to Notion database.
 * Placeholder — full implementation in Sprint 2.
 * @param {Request} request
 * @param {Object} env
 * @returns {Promise<Response>}
 */
async function handleSync(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'INVALID_JSON' }, 400);
  }

  if (!body.trades || !Array.isArray(body.trades) || body.trades.length === 0) {
    return jsonResponse({ error: 'NO_TRADES' }, 400);
  }

  // Placeholder response — Notion sync will be implemented in Sprint 2
  return jsonResponse({
    success: true,
    synced_count: body.trades.length,
    message: 'Sync endpoint ready — Notion integration coming in Sprint 2',
  });
}

