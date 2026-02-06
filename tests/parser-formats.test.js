/**
 * Parser Format Validation Tests
 *
 * Tests client-side validation of parsed trade results.
 * Since we cannot call the Claude API in tests, we validate the expected
 * output format that the parser prompt should produce.
 */

const VALID_ACTIONS = ['BUY', 'SELL', 'SHORT', 'COVER'];
const VALID_BROKERS = ['Futu', 'IBKR', 'Webull', 'Schwab', 'Tiger', 'Longbridge', 'unknown'];
const VALID_CURRENCIES = ['USD', 'HKD', 'CNY'];

/**
 * Validates a single parsed trade object.
 * Returns { valid: boolean, errors: string[] }
 */
function validateParsedTrade(trade) {
  const errors = [];

  // Required fields
  if (!trade.symbol || typeof trade.symbol !== 'string') {
    errors.push('symbol is required and must be a string');
  }
  if (!trade.action || !VALID_ACTIONS.includes(trade.action)) {
    errors.push(`action must be one of: ${VALID_ACTIONS.join(', ')}`);
  }
  if (typeof trade.quantity !== 'number' || trade.quantity <= 0) {
    errors.push('quantity must be a positive number');
  }
  if (typeof trade.price !== 'number' || trade.price <= 0) {
    errors.push('price must be a positive number');
  }
  if (!trade.datetime || !isValidISO8601(trade.datetime)) {
    errors.push('datetime must be a valid ISO 8601 string');
  }
  if (typeof trade.confidence !== 'number' || trade.confidence < 0 || trade.confidence > 1) {
    errors.push('confidence must be a number between 0 and 1');
  }

  // Optional but must be valid if present
  if (trade.broker_detected !== undefined && !VALID_BROKERS.includes(trade.broker_detected)) {
    errors.push(`broker_detected must be one of: ${VALID_BROKERS.join(', ')}`);
  }
  if (trade.currency !== undefined && !VALID_CURRENCIES.includes(trade.currency)) {
    errors.push(`currency must be one of: ${VALID_CURRENCIES.join(', ')}`);
  }
  if (trade.total_amount !== undefined && (typeof trade.total_amount !== 'number' || trade.total_amount < 0)) {
    errors.push('total_amount must be a non-negative number');
  }
  if (trade.commission !== undefined && typeof trade.commission !== 'number') {
    errors.push('commission must be a number');
  }

  // Options trades validation
  if (trade.is_option === true) {
    if (!trade.option_details || typeof trade.option_details !== 'object') {
      errors.push('option trades must include option_details object');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates an array of parsed trades.
 * Returns { valid: boolean, results: Array<{ index, valid, errors }> }
 */
function validateParsedTrades(trades) {
  if (!Array.isArray(trades)) {
    return { valid: false, results: [{ index: -1, valid: false, errors: ['Input must be an array'] }] };
  }
  if (trades.length === 0) {
    return { valid: true, results: [] };
  }
  const results = trades.map((trade, index) => {
    const { valid, errors } = validateParsedTrade(trade);
    return { index, valid, errors };
  });
  const allValid = results.every(r => r.valid);
  return { valid: allValid, results };
}

/**
 * Check for possible duplicate trades in a batch.
 */
function detectDuplicates(trades) {
  const seen = new Map();
  return trades.map((trade, index) => {
    const key = `${trade.symbol}-${trade.action}-${trade.quantity}-${trade.price}-${trade.datetime}`;
    if (seen.has(key)) {
      return { ...trade, possible_duplicate: true, duplicate_of: seen.get(key) };
    }
    seen.set(key, index);
    return trade;
  });
}

function isValidISO8601(str) {
  if (typeof str !== 'string') return false;
  // Accept ISO 8601 date-time patterns
  const iso8601Regex = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/;
  if (!iso8601Regex.test(str)) return false;
  const date = new Date(str);
  return !isNaN(date.getTime());
}

// --- Fixtures: simulated parsed outputs from Claude for each broker ---

function makeFutuTrades() {
  return [
    { symbol: 'NVDA', action: 'BUY', quantity: 100, price: 135.50, datetime: '2024-01-15T09:35:22-05:00', total_amount: 13550.00, commission: 0.99, broker_detected: 'Futu', currency: 'USD', confidence: 0.95 },
    { symbol: 'AAPL', action: 'BUY', quantity: 50, price: 185.20, datetime: '2024-01-15T09:42:15-05:00', total_amount: 9260.00, commission: 0.99, broker_detected: 'Futu', currency: 'USD', confidence: 0.95 },
    { symbol: 'NVDA', action: 'SELL', quantity: 100, price: 138.80, datetime: '2024-01-15T14:22:08-05:00', total_amount: 13880.00, commission: 0.99, broker_detected: 'Futu', currency: 'USD', confidence: 0.95 },
    { symbol: 'AAPL', action: 'SELL', quantity: 50, price: 184.50, datetime: '2024-01-15T15:10:33-05:00', total_amount: 9225.00, commission: 0.99, broker_detected: 'Futu', currency: 'USD', confidence: 0.92 },
  ];
}

function makeIBKRTrades() {
  return [
    { symbol: 'TSLA', action: 'BUY', quantity: 200, price: 215.30, datetime: '2024-01-15T10:05:30-05:00', total_amount: 43060.00, commission: 1.00, broker_detected: 'IBKR', currency: 'USD', confidence: 0.93 },
    { symbol: 'TSLA', action: 'SELL', quantity: 200, price: 218.50, datetime: '2024-01-15T14:30:15-05:00', total_amount: 43700.00, commission: 1.00, broker_detected: 'IBKR', currency: 'USD', confidence: 0.93 },
    { symbol: 'MSFT', action: 'BUY', quantity: 100, price: 390.25, datetime: '2024-01-15T11:00:00-05:00', total_amount: 39025.00, commission: 0.65, broker_detected: 'IBKR', currency: 'USD', confidence: 0.93 },
    { symbol: 'MSFT', action: 'SELL', quantity: 100, price: 388.10, datetime: '2024-01-15T15:45:00-05:00', total_amount: 38810.00, commission: 0.65, broker_detected: 'IBKR', currency: 'USD', confidence: 0.93 },
  ];
}

function makeWebullTrades() {
  return [
    { symbol: 'AMZN', action: 'BUY', quantity: 30, price: 178.50, datetime: '2024-01-15T09:31:05-05:00', total_amount: 5355.00, commission: 0.00, broker_detected: 'Webull', currency: 'USD', confidence: 0.94 },
    { symbol: 'AMZN', action: 'SELL', quantity: 30, price: 180.20, datetime: '2024-01-15T13:45:22-05:00', total_amount: 5406.00, commission: 0.00, broker_detected: 'Webull', currency: 'USD', confidence: 0.94 },
    { symbol: 'META', action: 'BUY', quantity: 25, price: 370.80, datetime: '2024-01-15T10:15:30-05:00', total_amount: 9270.00, commission: 0.00, broker_detected: 'Webull', currency: 'USD', confidence: 0.94 },
    { symbol: 'META', action: 'SELL', quantity: 25, price: 373.50, datetime: '2024-01-15T14:20:00-05:00', total_amount: 9337.50, commission: 0.00, broker_detected: 'Webull', currency: 'USD', confidence: 0.94 },
  ];
}

function makeSchwabTrades() {
  return [
    { symbol: 'GOOGL', action: 'BUY', quantity: 40, price: 155.30, datetime: '2024-01-15T09:30:00-05:00', total_amount: 6212.00, commission: 0.00, broker_detected: 'Schwab', currency: 'USD', confidence: 0.90 },
    { symbol: 'GOOGL', action: 'SELL', quantity: 40, price: 157.80, datetime: '2024-01-15T12:00:00-05:00', total_amount: 6312.00, commission: 0.00, broker_detected: 'Schwab', currency: 'USD', confidence: 0.90 },
    { symbol: 'AMD', action: 'BUY', quantity: 75, price: 165.40, datetime: '2024-01-15T10:00:00-05:00', total_amount: 12405.00, commission: 0.00, broker_detected: 'Schwab', currency: 'USD', confidence: 0.90 },
    { symbol: 'AMD', action: 'SELL', quantity: 75, price: 168.20, datetime: '2024-01-15T14:30:00-05:00', total_amount: 12615.00, commission: 0.00, broker_detected: 'Schwab', currency: 'USD', confidence: 0.90 },
  ];
}

function makeFreeformTrades() {
  return [
    { symbol: 'NVDA', action: 'BUY', quantity: 100, price: 135.50, datetime: '2024-01-15T09:35:00-05:00', broker_detected: 'unknown', currency: 'USD', confidence: 0.80 },
    { symbol: 'NVDA', action: 'SELL', quantity: 100, price: 142.30, datetime: '2024-01-15T14:15:00-05:00', broker_detected: 'unknown', currency: 'USD', confidence: 0.80 },
    { symbol: 'AAPL', action: 'BUY', quantity: 50, price: 189.20, datetime: '2024-01-15T12:00:00-05:00', broker_detected: 'unknown', currency: 'USD', confidence: 0.75 },
    { symbol: 'AAPL', action: 'SELL', quantity: 50, price: 191.50, datetime: '2024-01-15T12:30:00-05:00', broker_detected: 'unknown', currency: 'USD', confidence: 0.75 },
    { symbol: 'TSLA', action: 'SHORT', quantity: 200, price: 215.30, datetime: '2024-01-15T13:00:00-05:00', broker_detected: 'unknown', currency: 'USD', confidence: 0.78 },
    { symbol: 'TSLA', action: 'COVER', quantity: 200, price: 210.80, datetime: '2024-01-15T15:00:00-05:00', broker_detected: 'unknown', currency: 'USD', confidence: 0.78 },
  ];
}


describe('Parser Format Validation', () => {
  describe('validateParsedTrade', () => {
    it('should validate correct Futu-style parsed trades', () => {
      const trades = makeFutuTrades();
      const result = validateParsedTrades(trades);
      expect(result.valid).toBe(true);
      expect(result.results).toHaveLength(4);
      result.results.forEach(r => {
        expect(r.valid).toBe(true);
        expect(r.errors).toHaveLength(0);
      });
    });

    it('should validate correct IBKR-style parsed trades', () => {
      const trades = makeIBKRTrades();
      const result = validateParsedTrades(trades);
      expect(result.valid).toBe(true);
      result.results.forEach(r => expect(r.valid).toBe(true));
    });

    it('should validate correct Webull-style parsed trades', () => {
      const trades = makeWebullTrades();
      const result = validateParsedTrades(trades);
      expect(result.valid).toBe(true);
      result.results.forEach(r => expect(r.valid).toBe(true));
    });

    it('should validate correct Schwab-style parsed trades', () => {
      const trades = makeSchwabTrades();
      const result = validateParsedTrades(trades);
      expect(result.valid).toBe(true);
      result.results.forEach(r => expect(r.valid).toBe(true));
    });

    it('should validate correct freeform-style parsed trades', () => {
      const trades = makeFreeformTrades();
      const result = validateParsedTrades(trades);
      expect(result.valid).toBe(true);
      result.results.forEach(r => expect(r.valid).toBe(true));
    });

    it('should validate options trades with is_option and option_details', () => {
      const trade = {
        symbol: 'NVDA',
        action: 'BUY',
        quantity: 5,
        price: 12.50,
        datetime: '2024-01-15T09:35:00-05:00',
        confidence: 0.88,
        broker_detected: 'IBKR',
        currency: 'USD',
        is_option: true,
        option_details: {
          type: 'CALL',
          strike: 140.00,
          expiry: '2024-02-16',
        },
      };
      const result = validateParsedTrade(trade);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate fractional shares (quantity: 0.5)', () => {
      const trade = {
        symbol: 'AMZN',
        action: 'BUY',
        quantity: 0.5,
        price: 178.50,
        datetime: '2024-01-15T09:30:00-05:00',
        confidence: 0.90,
        broker_detected: 'Schwab',
        currency: 'USD',
      };
      const result = validateParsedTrade(trade);
      expect(result.valid).toBe(true);
    });

    it('should reject trade with missing symbol', () => {
      const trade = {
        action: 'BUY',
        quantity: 100,
        price: 135.50,
        datetime: '2024-01-15T09:35:00-05:00',
        confidence: 0.95,
      };
      const result = validateParsedTrade(trade);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('symbol'))).toBe(true);
    });

    it('should reject trade with invalid action "HOLD"', () => {
      const trade = {
        symbol: 'NVDA',
        action: 'HOLD',
        quantity: 100,
        price: 135.50,
        datetime: '2024-01-15T09:35:00-05:00',
        confidence: 0.95,
      };
      const result = validateParsedTrade(trade);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('action'))).toBe(true);
    });

    it('should reject trade with negative quantity', () => {
      const trade = {
        symbol: 'NVDA',
        action: 'BUY',
        quantity: -100,
        price: 135.50,
        datetime: '2024-01-15T09:35:00-05:00',
        confidence: 0.95,
      };
      const result = validateParsedTrade(trade);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('quantity'))).toBe(true);
    });

    it('should reject trade with zero price', () => {
      const trade = {
        symbol: 'NVDA',
        action: 'BUY',
        quantity: 100,
        price: 0,
        datetime: '2024-01-15T09:35:00-05:00',
        confidence: 0.95,
      };
      const result = validateParsedTrade(trade);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('price'))).toBe(true);
    });

    it('should reject trade with confidence > 1', () => {
      const trade = {
        symbol: 'NVDA',
        action: 'BUY',
        quantity: 100,
        price: 135.50,
        datetime: '2024-01-15T09:35:00-05:00',
        confidence: 1.5,
      };
      const result = validateParsedTrade(trade);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('confidence'))).toBe(true);
    });

    it('should reject trade with confidence < 0', () => {
      const trade = {
        symbol: 'NVDA',
        action: 'BUY',
        quantity: 100,
        price: 135.50,
        datetime: '2024-01-15T09:35:00-05:00',
        confidence: -0.1,
      };
      const result = validateParsedTrade(trade);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('confidence'))).toBe(true);
    });

    it('should reject trade with invalid datetime format', () => {
      const trade = {
        symbol: 'NVDA',
        action: 'BUY',
        quantity: 100,
        price: 135.50,
        datetime: 'Jan 15 2024 9:35am',
        confidence: 0.95,
      };
      const result = validateParsedTrade(trade);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('datetime'))).toBe(true);
    });
  });

  describe('validateParsedTrades (batch)', () => {
    it('should validate empty trade array and return valid', () => {
      const result = validateParsedTrades([]);
      expect(result.valid).toBe(true);
      expect(result.results).toHaveLength(0);
    });

    it('should validate a large batch of 100 trades all passing', () => {
      const trades = [];
      for (let i = 0; i < 100; i++) {
        trades.push({
          symbol: `STOCK${i}`,
          action: VALID_ACTIONS[i % 4],
          quantity: (i + 1) * 10,
          price: 100 + i * 0.5,
          datetime: `2024-01-15T09:${String(30 + (i % 30)).padStart(2, '0')}:00-05:00`,
          confidence: 0.90,
          broker_detected: 'unknown',
          currency: 'USD',
        });
      }
      const result = validateParsedTrades(trades);
      expect(result.valid).toBe(true);
      expect(result.results).toHaveLength(100);
    });

    it('should reject non-array input', () => {
      const result = validateParsedTrades('not an array');
      expect(result.valid).toBe(false);
      expect(result.results[0].errors[0]).toContain('array');
    });
  });

  describe('detectDuplicates', () => {
    it('should flag possible duplicate trades', () => {
      const trades = [
        { symbol: 'NVDA', action: 'BUY', quantity: 100, price: 135.50, datetime: '2024-01-15T09:35:00-05:00', confidence: 0.95 },
        { symbol: 'NVDA', action: 'BUY', quantity: 100, price: 135.50, datetime: '2024-01-15T09:35:00-05:00', confidence: 0.95 },
        { symbol: 'AAPL', action: 'SELL', quantity: 50, price: 189.20, datetime: '2024-01-15T10:00:00-05:00', confidence: 0.90 },
      ];
      const result = detectDuplicates(trades);
      expect(result[0].possible_duplicate).toBeUndefined();
      expect(result[1].possible_duplicate).toBe(true);
      expect(result[1].duplicate_of).toBe(0);
      expect(result[2].possible_duplicate).toBeUndefined();
    });
  });
});
