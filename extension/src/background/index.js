/**
 * Background Service Worker — central state hub.
 * Handles message passing between extension components,
 * manages extension lifecycle, and coordinates API calls.
 */

import { initStorage, get, set } from '../lib/storage.js';
import {
  parseTrades,
  validateLicense,
  getNotionStatus,
  setupNotionDatabase,
  createNotionTrades,
  analyzeTrades,
  writeNotionAnalysis,
} from '../lib/api.js';
import { initiateNotionOAuth } from '../lib/notion.js';

/** Message action types for chrome.runtime messaging. */
const Actions = {
  GET_STATE: 'GET_STATE',
  PARSE_TRADES: 'PARSE_TRADES',
  SYNC_TO_NOTION: 'SYNC_TO_NOTION',
  VALIDATE_LICENSE: 'VALIDATE_LICENSE',
  UPDATE_SETTINGS: 'UPDATE_SETTINGS',
  OPEN_SIDE_PANEL: 'OPEN_SIDE_PANEL',
  OPEN_NOTION_AUTH: 'OPEN_NOTION_AUTH',
  CHECK_NOTION_STATUS: 'CHECK_NOTION_STATUS',
  SETUP_NOTION_DB: 'SETUP_NOTION_DB',
  ANALYZE_TRADES: 'ANALYZE_TRADES',
  SAVE_ANALYSIS: 'SAVE_ANALYSIS',
};

/**
 * Initialize extension state on install/update.
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  try {
    await initStorage();

    if (details.reason === 'install') {
      await set('notionConnected', false);
      await set('licenseActive', false);
      await set('licenseKey', '');
      await set('syncHistory', []);
      await set('recentTrades', []);
      await set('settings', {
        language: 'zh_CN',
        theme: 'dark',
      });
    }
  } catch (error) {
    // Storage init failure is non-fatal for install event
  }
});

/**
 * Handle messages from popup, side panel, and content scripts.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.action) {
    sendResponse({ error: 'INVALID_MESSAGE' });
    return false;
  }

  handleMessage(message, sender)
    .then(sendResponse)
    .catch((error) => {
      sendResponse({
        error: error.message || 'UNKNOWN_ERROR',
        status: error.status,
      });
    });

  // Return true to indicate async response
  return true;
});

/**
 * Route messages to appropriate handlers.
 * @param {Object} message
 * @param {Object} sender
 * @returns {Promise<Object>}
 */
async function handleMessage(message, sender) {
  switch (message.action) {
    case Actions.GET_STATE:
      return getExtensionState();

    case Actions.PARSE_TRADES:
      return handleParseTrades(message.payload);

    case Actions.SYNC_TO_NOTION:
      return handleSyncToNotion(message.payload);

    case Actions.VALIDATE_LICENSE:
      return handleValidateLicense(message.payload);

    case Actions.UPDATE_SETTINGS:
      return handleUpdateSettings(message.payload);

    case Actions.OPEN_SIDE_PANEL:
      return handleOpenSidePanel(sender);

    case Actions.OPEN_NOTION_AUTH:
      return handleOpenNotionAuth();

    case Actions.CHECK_NOTION_STATUS:
      return handleCheckNotionStatus();

    case Actions.SETUP_NOTION_DB:
      return handleSetupNotionDb();

    case Actions.ANALYZE_TRADES:
      return handleAnalyzeTrades(message.payload);

    case Actions.SAVE_ANALYSIS:
      return handleSaveAnalysis(message.payload);

    default:
      return { error: 'UNKNOWN_ACTION' };
  }
}

/**
 * Get current extension state for UI rendering.
 */
async function getExtensionState() {
  await initStorage();
  const notionConnected = await get('notionConnected', false);
  const licenseActive = await get('licenseActive', false);
  const settings = await get('settings', { language: 'zh_CN', theme: 'dark' });
  const syncHistory = await get('syncHistory', []);
  const recentTrades = await get('recentTrades', []);
  const notionDbConfigured = await get('notionDbConfigured', false);

  return {
    notionConnected,
    licenseActive,
    settings,
    recentSyncs: syncHistory.slice(0, 10),
    recentTrades,
    notionDbConfigured,
  };
}

/**
 * Handle trade parsing request — delegates to Worker proxy.
 * @param {Object} payload - { rawText: string }
 */
async function handleParseTrades(payload) {
  if (!payload || !payload.rawText || payload.rawText.trim().length === 0) {
    return { error: 'EMPTY_INPUT' };
  }

  const licenseKey = await get('licenseKey', '');
  const result = await parseTrades(payload.rawText, licenseKey);

  // Store parsed trades for analysis tab
  if (result.trades && Array.isArray(result.trades)) {
    await set('recentTrades', result.trades);
  }

  return result;
}

/**
 * Handle Notion sync request — creates trades via Worker proxy.
 * @param {Object} payload - { trades: Array }
 */
async function handleSyncToNotion(payload) {
  if (!payload || !payload.trades || payload.trades.length === 0) {
    return { error: 'NO_TRADES' };
  }

  const notionConnected = await get('notionConnected', false);
  if (!notionConnected) {
    return { error: 'NOTION_NOT_CONNECTED' };
  }

  const licenseKey = await get('licenseKey', '');
  const result = await createNotionTrades(payload.trades, licenseKey);

  if (!result.error) {
    const syncHistory = await get('syncHistory', []);
    syncHistory.unshift({
      timestamp: new Date().toISOString(),
      tradeCount: result.synced_count || payload.trades.length,
      errorCount: result.error_count || 0,
      status: result.error_count > 0 ? 'partial' : 'success',
      results: result.results || [],
    });
    await set('syncHistory', syncHistory.slice(0, 100));

    // Store trades for analysis
    await set('recentTrades', payload.trades);
  }

  return result;
}

/**
 * Handle license validation request.
 * @param {Object} payload - { licenseKey: string }
 */
async function handleValidateLicense(payload) {
  if (!payload || !payload.licenseKey) {
    return { error: 'MISSING_LICENSE_KEY' };
  }

  const result = await validateLicense(payload.licenseKey);

  if (result.valid) {
    await set('licenseKey', payload.licenseKey);
    await set('licenseActive', true);
  }

  return result;
}

/**
 * Handle settings update.
 * @param {Object} payload - Settings object to merge
 */
async function handleUpdateSettings(payload) {
  if (!payload) {
    return { error: 'MISSING_PAYLOAD' };
  }

  const currentSettings = await get('settings', {});
  const updatedSettings = { ...currentSettings, ...payload };
  await set('settings', updatedSettings);
  return { success: true, settings: updatedSettings };
}

/**
 * Handle open side panel request from popup.
 * @param {Object} sender - Message sender info
 */
async function handleOpenSidePanel(sender) {
  try {
    const tab = sender.tab || (await getCurrentTab());
    if (tab) {
      await chrome.sidePanel.open({ tabId: tab.id });
    }
    return { success: true };
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Get the current active tab.
 * @returns {Promise<chrome.tabs.Tab|null>}
 */
async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

/**
 * Handle Notion OAuth initiation.
 */
async function handleOpenNotionAuth() {
  try {
    const licenseKey = await get('licenseKey', '');
    if (!licenseKey) {
      return { error: 'LICENSE_REQUIRED' };
    }
    await initiateNotionOAuth(licenseKey);
    return { success: true };
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Check Notion connection status via Worker API.
 * Updates local storage with the result.
 */
async function handleCheckNotionStatus() {
  try {
    const licenseKey = await get('licenseKey', '');
    if (!licenseKey) {
      return { connected: false };
    }

    const status = await getNotionStatus(licenseKey);
    await set('notionConnected', status.connected || false);
    await set('notionDbConfigured', status.database_configured || false);

    return status;
  } catch (error) {
    return { connected: false, error: error.message };
  }
}

/**
 * Set up the Notion Trading Journal database.
 */
async function handleSetupNotionDb() {
  try {
    const licenseKey = await get('licenseKey', '');
    if (!licenseKey) {
      return { error: 'LICENSE_REQUIRED' };
    }

    const result = await setupNotionDatabase(licenseKey);

    if (result.success) {
      await set('notionDbConfigured', true);
    }

    return result;
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Handle AI trade analysis request.
 * @param {Object} payload - { trades, analysisType, language }
 */
async function handleAnalyzeTrades(payload) {
  if (!payload || !payload.analysisType) {
    return { error: 'MISSING_ANALYSIS_TYPE' };
  }

  const trades = payload.trades || (await get('recentTrades', []));
  if (!trades || trades.length === 0) {
    return { error: 'NO_TRADES' };
  }

  const licenseKey = await get('licenseKey', '');
  const settings = await get('settings', {});
  const language = payload.language || (settings.language === 'zh_CN' ? 'zh' : 'en');

  const result = await analyzeTrades(trades, payload.analysisType, language, licenseKey);
  return result;
}

/**
 * Save AI analysis to a Notion trade page.
 * @param {Object} payload - { pageId, analysis }
 */
async function handleSaveAnalysis(payload) {
  if (!payload || !payload.pageId || !payload.analysis) {
    return { error: 'MISSING_FIELDS' };
  }

  const licenseKey = await get('licenseKey', '');
  const result = await writeNotionAnalysis(payload.pageId, payload.analysis, licenseKey);
  return result;
}

/** Export action types for use by other components. */
export { Actions };
