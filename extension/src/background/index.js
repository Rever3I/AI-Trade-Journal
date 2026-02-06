/**
 * Background Service Worker — central state hub.
 * Handles message passing between extension components,
 * manages extension lifecycle, and coordinates API calls.
 */

import { initStorage, get, set } from '../lib/storage.js';
import { parseTrades, syncToNotion, validateLicense } from '../lib/api.js';
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

  return {
    notionConnected,
    licenseActive,
    settings,
    recentSyncs: syncHistory.slice(0, 10),
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
  return result;
}

/**
 * Handle Notion sync request — delegates to Worker proxy.
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
  const result = await syncToNotion(payload.trades, licenseKey);

  if (!result.error) {
    const syncHistory = await get('syncHistory', []);
    syncHistory.unshift({
      timestamp: new Date().toISOString(),
      tradeCount: payload.trades.length,
      status: 'success',
    });
    await set('syncHistory', syncHistory.slice(0, 100));
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
    await initiateNotionOAuth();
    return { success: true };
  } catch (error) {
    return { error: error.message };
  }
}

/** Export action types for use by other components. */
export { Actions };
