/**
 * Notion API helpers.
 * All actual Notion API calls go through the Worker proxy.
 * This module handles data formatting and validation before sync.
 */

import { getNotionAuthUrl } from './api.js';

/**
 * Required fields for a valid trade entry.
 */
const REQUIRED_FIELDS = ['symbol', 'action', 'quantity', 'price', 'datetime'];

/**
 * Valid action types.
 */
const VALID_ACTIONS = ['BUY', 'SELL', 'SHORT', 'COVER'];

/**
 * Validate a single trade object before Notion sync.
 * @param {Object} trade - Parsed trade object
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateTrade(trade) {
  const errors = [];

  for (const field of REQUIRED_FIELDS) {
    if (trade[field] === undefined || trade[field] === null || trade[field] === '') {
      errors.push(`missing_${field}`);
    }
  }

  if (trade.action && !VALID_ACTIONS.includes(trade.action)) {
    errors.push('invalid_action');
  }

  if (trade.quantity !== undefined && (typeof trade.quantity !== 'number' || trade.quantity <= 0)) {
    errors.push('invalid_quantity');
  }

  if (trade.price !== undefined && (typeof trade.price !== 'number' || trade.price <= 0)) {
    errors.push('invalid_price');
  }

  if (trade.datetime) {
    const date = new Date(trade.datetime);
    if (isNaN(date.getTime())) {
      errors.push('invalid_datetime');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate an array of trades.
 * @param {Array} trades
 * @returns {{ validTrades: Array, invalidTrades: Array<{trade: Object, errors: string[]}> }}
 */
export function validateTrades(trades) {
  const validTrades = [];
  const invalidTrades = [];

  for (const trade of trades) {
    const result = validateTrade(trade);
    if (result.valid) {
      validTrades.push(trade);
    } else {
      invalidTrades.push({ trade, errors: result.errors });
    }
  }

  return { validTrades, invalidTrades };
}

/**
 * Format a trade object for Notion database properties.
 * @param {Object} trade - Validated trade object
 * @returns {Object} Notion-formatted properties
 */
export function formatTradeForNotion(trade) {
  return {
    'Symbol': {
      title: [{ text: { content: trade.symbol } }],
    },
    'Action': {
      select: { name: trade.action },
    },
    'Quantity': {
      number: trade.quantity,
    },
    'Entry Price': {
      number: trade.price,
    },
    'Trade Date': {
      date: { start: trade.datetime },
    },
    'Commission': {
      number: trade.commission || 0,
    },
    'Broker': {
      select: { name: trade.broker_detected || 'Other' },
    },
    'Sync Status': {
      select: { name: 'Synced' },
    },
  };
}

/**
 * Initiate Notion OAuth flow via the Worker proxy.
 * Opens the OAuth authorization URL in a new tab.
 * @param {string} licenseKey - User's license key for auth
 * @returns {Promise<void>}
 */
export async function initiateNotionOAuth(licenseKey) {
  const response = await getNotionAuthUrl(licenseKey);
  if (response.url) {
    chrome.tabs.create({ url: response.url });
  }
}
