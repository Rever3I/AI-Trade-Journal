const STORAGE_KEYS = {
  ONBOARDING_COMPLETE: 'onboarding_complete',
  LICENSE_KEY: 'license_key',
  LICENSE_STATUS: 'license_status',
  NOTION_CONNECTED: 'notion_connected',
  NOTION_TOKEN: 'notion_token_id',
  NOTION_DATABASE_ID: 'notion_database_id',
  NOTION_DATABASE_URL: 'notion_database_url',
  LOCALE: 'locale',
  PARSED_TRADES: 'parsed_trades',
  SYNC_HISTORY: 'sync_history',
  USAGE_TODAY: 'usage_today',
  USAGE_DATE: 'usage_date',
};

const MAX_HISTORY_ENTRIES = 50;

function getStorage() {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    return chrome.storage.local;
  }
  // Fallback for testing
  const store = {};
  return {
    get: (keys) => Promise.resolve(
      Array.isArray(keys)
        ? keys.reduce((acc, k) => { if (store[k] !== undefined) acc[k] = store[k]; return acc; }, {})
        : typeof keys === 'string'
          ? { [keys]: store[keys] }
          : {}
    ),
    set: (items) => { Object.assign(store, items); return Promise.resolve(); },
    remove: (keys) => {
      const arr = Array.isArray(keys) ? keys : [keys];
      arr.forEach(k => delete store[k]);
      return Promise.resolve();
    },
  };
}

export async function getValue(key) {
  const storage = getStorage();
  const result = await storage.get(key);
  return result[key];
}

export async function setValue(key, value) {
  const storage = getStorage();
  await storage.set({ [key]: value });
}

export async function removeValue(key) {
  const storage = getStorage();
  await storage.remove(key);
}

export async function getMultiple(keys) {
  const storage = getStorage();
  return storage.get(keys);
}

export async function setMultiple(items) {
  const storage = getStorage();
  await storage.set(items);
}

export async function isOnboardingComplete() {
  return (await getValue(STORAGE_KEYS.ONBOARDING_COMPLETE)) === true;
}

export async function setOnboardingComplete() {
  await setValue(STORAGE_KEYS.ONBOARDING_COMPLETE, true);
}

export async function getLicenseInfo() {
  const data = await getMultiple([
    STORAGE_KEYS.LICENSE_KEY,
    STORAGE_KEYS.LICENSE_STATUS,
  ]);
  return {
    key: data[STORAGE_KEYS.LICENSE_KEY] || null,
    status: data[STORAGE_KEYS.LICENSE_STATUS] || 'inactive',
  };
}

export async function setLicenseInfo(key, status) {
  await setMultiple({
    [STORAGE_KEYS.LICENSE_KEY]: key,
    [STORAGE_KEYS.LICENSE_STATUS]: status,
  });
}

export async function getNotionConnection() {
  const data = await getMultiple([
    STORAGE_KEYS.NOTION_CONNECTED,
    STORAGE_KEYS.NOTION_DATABASE_ID,
    STORAGE_KEYS.NOTION_DATABASE_URL,
  ]);
  return {
    connected: data[STORAGE_KEYS.NOTION_CONNECTED] === true,
    databaseId: data[STORAGE_KEYS.NOTION_DATABASE_ID] || null,
    databaseUrl: data[STORAGE_KEYS.NOTION_DATABASE_URL] || null,
  };
}

export async function setNotionConnection(connected, databaseId, databaseUrl) {
  await setMultiple({
    [STORAGE_KEYS.NOTION_CONNECTED]: connected,
    [STORAGE_KEYS.NOTION_DATABASE_ID]: databaseId || null,
    [STORAGE_KEYS.NOTION_DATABASE_URL]: databaseUrl || null,
  });
}

export async function clearNotionConnection() {
  await getStorage().remove([
    STORAGE_KEYS.NOTION_CONNECTED,
    STORAGE_KEYS.NOTION_TOKEN,
    STORAGE_KEYS.NOTION_DATABASE_ID,
    STORAGE_KEYS.NOTION_DATABASE_URL,
  ]);
}

export async function saveParsedTrades(trades) {
  await setValue(STORAGE_KEYS.PARSED_TRADES, trades);
}

export async function getParsedTrades() {
  return (await getValue(STORAGE_KEYS.PARSED_TRADES)) || [];
}

export async function clearParsedTrades() {
  await removeValue(STORAGE_KEYS.PARSED_TRADES);
}

export async function addSyncHistoryEntry(entry) {
  const history = (await getValue(STORAGE_KEYS.SYNC_HISTORY)) || [];
  history.unshift({
    ...entry,
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    timestamp: new Date().toISOString(),
  });
  // Prune to max entries
  if (history.length > MAX_HISTORY_ENTRIES) {
    history.length = MAX_HISTORY_ENTRIES;
  }
  await setValue(STORAGE_KEYS.SYNC_HISTORY, history);
  return history;
}

export async function getSyncHistory() {
  return (await getValue(STORAGE_KEYS.SYNC_HISTORY)) || [];
}

export async function getUsageToday() {
  const today = new Date().toISOString().slice(0, 10);
  const data = await getMultiple([
    STORAGE_KEYS.USAGE_TODAY,
    STORAGE_KEYS.USAGE_DATE,
  ]);
  if (data[STORAGE_KEYS.USAGE_DATE] !== today) {
    await setMultiple({
      [STORAGE_KEYS.USAGE_TODAY]: 0,
      [STORAGE_KEYS.USAGE_DATE]: today,
    });
    return 0;
  }
  return data[STORAGE_KEYS.USAGE_TODAY] || 0;
}

export async function incrementUsage() {
  const today = new Date().toISOString().slice(0, 10);
  const data = await getMultiple([
    STORAGE_KEYS.USAGE_TODAY,
    STORAGE_KEYS.USAGE_DATE,
  ]);
  let count = 0;
  if (data[STORAGE_KEYS.USAGE_DATE] === today) {
    count = (data[STORAGE_KEYS.USAGE_TODAY] || 0);
  }
  count += 1;
  await setMultiple({
    [STORAGE_KEYS.USAGE_TODAY]: count,
    [STORAGE_KEYS.USAGE_DATE]: today,
  });
  return count;
}

export { STORAGE_KEYS };
