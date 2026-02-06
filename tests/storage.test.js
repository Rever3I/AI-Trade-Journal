/**
 * Storage Module Tests
 *
 * Tests for the chrome.storage.local wrapper that manages
 * all persistent extension state: license, Notion connection,
 * parsed trades, sync history, and usage tracking.
 */

import {
  getValue,
  setValue,
  removeValue,
  getMultiple,
  setMultiple,
  isOnboardingComplete,
  setOnboardingComplete,
  getLicenseInfo,
  setLicenseInfo,
  getNotionConnection,
  setNotionConnection,
  clearNotionConnection,
  saveParsedTrades,
  getParsedTrades,
  addSyncHistoryEntry,
  getSyncHistory,
  getUsageToday,
  incrementUsage,
  STORAGE_KEYS,
} from '@lib/storage.js';

describe('Storage module', () => {
  describe('getValue / setValue — basic round-trip', () => {
    it('should store and retrieve a string value', async () => {
      await setValue('test_key', 'hello');
      const result = await getValue('test_key');
      expect(result).toBe('hello');
    });

    it('should store and retrieve an object value', async () => {
      const obj = { a: 1, b: 'two' };
      await setValue('obj_key', obj);
      const result = await getValue('obj_key');
      expect(result).toEqual(obj);
    });

    it('should return undefined for a key that was never set', async () => {
      const result = await getValue('nonexistent_key');
      expect(result).toBeUndefined();
    });
  });

  describe('getMultiple / setMultiple', () => {
    it('should retrieve multiple keys at once', async () => {
      await setValue('k1', 'v1');
      await setValue('k2', 'v2');
      const result = await getMultiple(['k1', 'k2']);
      expect(result.k1).toBe('v1');
      expect(result.k2).toBe('v2');
    });

    it('should set multiple keys at once', async () => {
      await setMultiple({ m1: 'a', m2: 'b', m3: 'c' });
      const result = await getMultiple(['m1', 'm2', 'm3']);
      expect(result.m1).toBe('a');
      expect(result.m2).toBe('b');
      expect(result.m3).toBe('c');
    });
  });

  describe('removeValue', () => {
    it('should remove a key from storage', async () => {
      await setValue('remove_me', 'exists');
      expect(await getValue('remove_me')).toBe('exists');
      await removeValue('remove_me');
      expect(await getValue('remove_me')).toBeUndefined();
    });
  });

  describe('Onboarding', () => {
    it('should return false by default for isOnboardingComplete', async () => {
      const result = await isOnboardingComplete();
      expect(result).toBe(false);
    });

    it('should return true after setOnboardingComplete', async () => {
      await setOnboardingComplete();
      const result = await isOnboardingComplete();
      expect(result).toBe(true);
    });
  });

  describe('License info', () => {
    it('should return default inactive state when no license set', async () => {
      const info = await getLicenseInfo();
      expect(info.key).toBeNull();
      expect(info.status).toBe('inactive');
    });

    it('should store and retrieve license key and status', async () => {
      await setLicenseInfo('ABCD-1234-EFGH-5678', 'active');
      const info = await getLicenseInfo();
      expect(info.key).toBe('ABCD-1234-EFGH-5678');
      expect(info.status).toBe('active');
    });
  });

  describe('Notion connection', () => {
    it('should return default disconnected state', async () => {
      const conn = await getNotionConnection();
      expect(conn.connected).toBe(false);
      expect(conn.databaseId).toBeNull();
      expect(conn.databaseUrl).toBeNull();
    });

    it('should store connection info', async () => {
      await setNotionConnection(true, 'db-id-123', 'https://notion.so/db/123');
      const conn = await getNotionConnection();
      expect(conn.connected).toBe(true);
      expect(conn.databaseId).toBe('db-id-123');
      expect(conn.databaseUrl).toBe('https://notion.so/db/123');
    });

    it('should clear all Notion data on clearNotionConnection', async () => {
      await setNotionConnection(true, 'db-id-123', 'https://notion.so/db/123');
      // Also seed the token to verify it gets cleared
      globalThis.__seedStorage({ [STORAGE_KEYS.NOTION_TOKEN]: 'secret-token' });

      await clearNotionConnection();

      const conn = await getNotionConnection();
      expect(conn.connected).toBe(false);
      expect(conn.databaseId).toBeNull();
      expect(conn.databaseUrl).toBeNull();
      // Token should also be cleared
      const token = await getValue(STORAGE_KEYS.NOTION_TOKEN);
      expect(token).toBeUndefined();
    });
  });

  describe('Parsed trades', () => {
    it('should save and retrieve parsed trades round-trip', async () => {
      const trades = [
        { symbol: 'NVDA', action: 'BUY', quantity: 100, price: 135.50 },
        { symbol: 'AAPL', action: 'SELL', quantity: 50, price: 189.20 },
      ];
      await saveParsedTrades(trades);
      const result = await getParsedTrades();
      expect(result).toEqual(trades);
    });

    it('should return empty array when no trades saved', async () => {
      const result = await getParsedTrades();
      expect(result).toEqual([]);
    });
  });

  describe('Sync history', () => {
    it('should add entry to front of history list', async () => {
      const entry1 = { tradeCount: 4, status: 'synced' };
      const entry2 = { tradeCount: 2, status: 'synced' };

      await addSyncHistoryEntry(entry1);
      await addSyncHistoryEntry(entry2);

      const history = await getSyncHistory();
      expect(history).toHaveLength(2);
      // Second entry should be first (most recent)
      expect(history[0].tradeCount).toBe(2);
      expect(history[1].tradeCount).toBe(4);
    });

    it('should return entries in reverse chronological order', async () => {
      for (let i = 0; i < 5; i++) {
        await addSyncHistoryEntry({ tradeCount: i + 1, status: 'synced' });
      }
      const history = await getSyncHistory();
      expect(history).toHaveLength(5);
      // Most recent (tradeCount: 5) should be first
      expect(history[0].tradeCount).toBe(5);
      expect(history[4].tradeCount).toBe(1);
    });

    it('should include id and timestamp on each entry', async () => {
      await addSyncHistoryEntry({ tradeCount: 3, status: 'synced' });
      const history = await getSyncHistory();
      expect(history[0].id).toBeDefined();
      expect(typeof history[0].id).toBe('string');
      expect(history[0].timestamp).toBeDefined();
      // Timestamp should be a valid ISO string
      expect(new Date(history[0].timestamp).toISOString()).toBe(history[0].timestamp);
    });

    it('should prune history to MAX 50 entries', async () => {
      // Add 55 entries
      for (let i = 0; i < 55; i++) {
        await addSyncHistoryEntry({ tradeCount: i + 1, status: 'synced' });
      }
      const history = await getSyncHistory();
      expect(history.length).toBeLessThanOrEqual(50);
      // The most recent entry (tradeCount: 55) should be at position 0
      expect(history[0].tradeCount).toBe(55);
    });

    it('should return empty array when no history exists', async () => {
      const history = await getSyncHistory();
      expect(history).toEqual([]);
    });
  });

  describe('Usage tracking', () => {
    it('should return 0 for new day (no usage recorded)', async () => {
      const usage = await getUsageToday();
      expect(usage).toBe(0);
    });

    it('should increment usage counter', async () => {
      const count1 = await incrementUsage();
      expect(count1).toBe(1);
      const count2 = await incrementUsage();
      expect(count2).toBe(2);
      const count3 = await incrementUsage();
      expect(count3).toBe(3);
    });

    it('should reset counter when date changes', async () => {
      // Seed with yesterday's date
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().slice(0, 10);

      globalThis.__seedStorage({
        [STORAGE_KEYS.USAGE_TODAY]: 8,
        [STORAGE_KEYS.USAGE_DATE]: yesterdayStr,
      });

      const usage = await getUsageToday();
      expect(usage).toBe(0);
    });
  });
});
