import { getNotionConnection, setNotionConnection, clearNotionConnection } from './storage.js';
import { getNotionAuthUrl, checkNotionStatus, createNotionDatabase, syncTradesToNotion, saveAnalysisToNotion } from './api.js';

export async function startNotionOAuth() {
  const { url } = await getNotionAuthUrl();
  if (typeof chrome !== 'undefined' && chrome.tabs) {
    await chrome.tabs.create({ url });
  } else {
    window.open(url, '_blank');
  }
}

export async function pollNotionConnection(maxAttempts = 30, intervalMs = 2000) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const status = await checkNotionStatus();
      if (status.connected) {
        await setNotionConnection(true, null, null);
        return { connected: true };
      }
    } catch {
      // Continue polling
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  return { connected: false };
}

export async function setupDatabase() {
  const result = await createNotionDatabase();
  if (result.database_id) {
    await setNotionConnection(
      true,
      result.database_id,
      result.database_url || null
    );
  }
  return result;
}

export async function syncTrades(trades, onProgress) {
  const conn = await getNotionConnection();
  if (!conn.databaseId) {
    throw new Error('NOTION_NO_DATABASE');
  }

  const result = await syncTradesToNotion(trades, conn.databaseId);

  if (onProgress && result.results) {
    result.results.forEach((r, i) => {
      onProgress(i + 1, trades.length);
    });
  }

  return result;
}

export async function saveAnalysis(pageId, analysis) {
  return saveAnalysisToNotion(pageId, analysis);
}

export async function disconnectNotion() {
  await clearNotionConnection();
}

export async function isNotionReady() {
  const conn = await getNotionConnection();
  return conn.connected && !!conn.databaseId;
}
