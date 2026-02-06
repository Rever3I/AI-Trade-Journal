/**
 * Notion Integration Flow Tests
 *
 * Tests for the Notion helper module that orchestrates
 * OAuth, database setup, trade syncing, and disconnection.
 */

import {
  startNotionOAuth,
  pollNotionConnection,
  setupDatabase,
  syncTrades,
  disconnectNotion,
  isNotionReady,
} from '@lib/notion.js';
import { getNotionConnection, setNotionConnection } from '@lib/storage.js';

describe('Notion integration flow', () => {
  describe('startNotionOAuth', () => {
    it('should call getNotionAuthUrl and open a new tab', async () => {
      globalThis.__mockFetchResponses.push({
        ok: true,
        status: 200,
        body: { url: 'https://api.notion.com/v1/oauth/authorize?client_id=test' },
      });

      await startNotionOAuth();

      // Should have opened a tab with the auth URL
      expect(chrome.tabs.create).toHaveBeenCalledWith({
        url: 'https://api.notion.com/v1/oauth/authorize?client_id=test',
      });
    });
  });

  describe('pollNotionConnection', () => {
    it('should return connected after successful poll', async () => {
      // First poll returns not connected, second returns connected
      globalThis.__mockFetchResponses.push({
        ok: true,
        status: 200,
        body: { connected: false },
      });
      globalThis.__mockFetchResponses.push({
        ok: true,
        status: 200,
        body: { connected: true },
      });

      const result = await pollNotionConnection(2, 10);
      expect(result.connected).toBe(true);

      // Verify storage was updated
      const conn = await getNotionConnection();
      expect(conn.connected).toBe(true);
    });

    it('should return not connected after max attempts exhausted', async () => {
      // All polls return not connected
      for (let i = 0; i < 3; i++) {
        globalThis.__mockFetchResponses.push({
          ok: true,
          status: 200,
          body: { connected: false },
        });
      }

      const result = await pollNotionConnection(3, 10);
      expect(result.connected).toBe(false);
    });
  });

  describe('setupDatabase', () => {
    it('should create DB and store connection info', async () => {
      globalThis.__mockFetchResponses.push({
        ok: true,
        status: 200,
        body: {
          database_id: 'new-db-id-456',
          database_url: 'https://notion.so/db/456',
        },
      });

      const result = await setupDatabase();
      expect(result.database_id).toBe('new-db-id-456');

      // Verify storage was updated
      const conn = await getNotionConnection();
      expect(conn.connected).toBe(true);
      expect(conn.databaseId).toBe('new-db-id-456');
      expect(conn.databaseUrl).toBe('https://notion.so/db/456');
    });
  });

  describe('syncTrades', () => {
    it('should throw when no database ID is configured', async () => {
      // No Notion connection set up
      await expect(
        syncTrades([{ symbol: 'NVDA', action: 'BUY' }])
      ).rejects.toThrow('NOTION_NO_DATABASE');
    });

    it('should call API with trades and database ID', async () => {
      // Set up Notion connection with database ID
      await setNotionConnection(true, 'db-123', 'https://notion.so/db/123');

      globalThis.__mockFetchResponses.push({
        ok: true,
        status: 200,
        body: {
          success: true,
          results: [{ id: 'page-1' }, { id: 'page-2' }],
        },
      });

      const trades = [
        { symbol: 'NVDA', action: 'BUY', quantity: 100, price: 135.50 },
        { symbol: 'NVDA', action: 'SELL', quantity: 100, price: 142.30 },
      ];

      const result = await syncTrades(trades);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);

      // Verify the API was called with correct body
      const [, options] = fetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.trades).toEqual(trades);
      expect(body.database_id).toBe('db-123');
    });
  });

  describe('disconnectNotion', () => {
    it('should clear all Notion storage data', async () => {
      await setNotionConnection(true, 'db-123', 'https://notion.so/db/123');

      await disconnectNotion();

      const conn = await getNotionConnection();
      expect(conn.connected).toBe(false);
      expect(conn.databaseId).toBeNull();
      expect(conn.databaseUrl).toBeNull();
    });
  });

  describe('isNotionReady', () => {
    it('should return false when not connected and no databaseId', async () => {
      const ready = await isNotionReady();
      expect(ready).toBe(false);
    });

    it('should return false when connected but no databaseId', async () => {
      await setNotionConnection(true, null, null);
      const ready = await isNotionReady();
      expect(ready).toBe(false);
    });

    it('should return true when connected with databaseId', async () => {
      await setNotionConnection(true, 'db-id-789', 'https://notion.so/db/789');
      const ready = await isNotionReady();
      expect(ready).toBe(true);
    });
  });
});
