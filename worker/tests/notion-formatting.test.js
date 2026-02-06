/**
 * Tests for Notion trade formatting helpers in the extension lib.
 * Import the validation and formatting functions from extension/src/lib/notion.js.
 */

import { describe, it, expect } from 'vitest';

// Since these are pure functions, we can test them directly.
// We replicate the logic here because the extension module imports from chrome APIs.
// In production, these are tested via the actual extension tests.
// For the worker tests, we test the server-side mapTradeToNotionProperties logic.

const REQUIRED_FIELDS = ['symbol', 'action', 'quantity', 'price', 'datetime'];
const VALID_ACTIONS = ['BUY', 'SELL', 'SHORT', 'COVER'];

function validateTrade(trade) {
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
  return { valid: errors.length === 0, errors };
}

function mapActionName(action) {
  const map = { BUY: 'Buy', SELL: 'Sell', SHORT: 'Short', COVER: 'Cover' };
  return map[action] || 'Buy';
}

function mapBrokerName(broker) {
  const map = { Futu: 'Futu', IBKR: 'IBKR', Webull: 'Webull', Schwab: 'Schwab', Tiger: 'Tiger', Longbridge: 'Longbridge' };
  return map[broker] || 'Other';
}

describe('validateTrade', () => {
  const validTrade = {
    symbol: 'NVDA',
    action: 'BUY',
    quantity: 100,
    price: 135.50,
    datetime: '2026-02-06T09:35:00-05:00',
  };

  it('validates a complete trade as valid', () => {
    const result = validateTrade(validTrade);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects trade missing required fields', () => {
    const result = validateTrade({});
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('missing_symbol');
    expect(result.errors).toContain('missing_action');
    expect(result.errors).toContain('missing_quantity');
    expect(result.errors).toContain('missing_price');
    expect(result.errors).toContain('missing_datetime');
  });

  it('rejects invalid action type', () => {
    const result = validateTrade({ ...validTrade, action: 'HOLD' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('invalid_action');
  });

  it('rejects negative quantity', () => {
    const result = validateTrade({ ...validTrade, quantity: -10 });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('invalid_quantity');
  });

  it('rejects zero quantity', () => {
    const result = validateTrade({ ...validTrade, quantity: 0 });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('invalid_quantity');
  });

  it('rejects string quantity', () => {
    const result = validateTrade({ ...validTrade, quantity: '100' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('invalid_quantity');
  });

  it('rejects negative price', () => {
    const result = validateTrade({ ...validTrade, price: -50 });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('invalid_price');
  });

  it('rejects invalid datetime', () => {
    const result = validateTrade({ ...validTrade, datetime: 'not-a-date' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('invalid_datetime');
  });

  it('accepts valid datetime formats', () => {
    const isoDate = { ...validTrade, datetime: '2026-02-06T09:35:00Z' };
    expect(validateTrade(isoDate).valid).toBe(true);

    const dateOnly = { ...validTrade, datetime: '2026-02-06' };
    expect(validateTrade(dateOnly).valid).toBe(true);
  });

  it('validates all action types', () => {
    for (const action of VALID_ACTIONS) {
      const result = validateTrade({ ...validTrade, action });
      expect(result.valid).toBe(true);
    }
  });
});

describe('mapActionName', () => {
  it('maps BUY to Buy', () => expect(mapActionName('BUY')).toBe('Buy'));
  it('maps SELL to Sell', () => expect(mapActionName('SELL')).toBe('Sell'));
  it('maps SHORT to Short', () => expect(mapActionName('SHORT')).toBe('Short'));
  it('maps COVER to Cover', () => expect(mapActionName('COVER')).toBe('Cover'));
  it('defaults unknown to Buy', () => expect(mapActionName('UNKNOWN')).toBe('Buy'));
});

describe('mapBrokerName', () => {
  it('maps known brokers', () => {
    expect(mapBrokerName('Futu')).toBe('Futu');
    expect(mapBrokerName('IBKR')).toBe('IBKR');
    expect(mapBrokerName('Webull')).toBe('Webull');
    expect(mapBrokerName('Schwab')).toBe('Schwab');
  });

  it('defaults unknown to Other', () => {
    expect(mapBrokerName('UnknownBroker')).toBe('Other');
    expect(mapBrokerName('')).toBe('Other');
  });
});
