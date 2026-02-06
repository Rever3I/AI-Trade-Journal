/**
 * Chrome storage wrapper with caching layer.
 * Uses chrome.storage.local for persistence, with in-memory cache
 * to avoid repeated async reads on every render.
 */

const cache = new Map();
let cacheInitialized = false;

/**
 * Initialize the in-memory cache from chrome.storage.local.
 * Call once at extension startup.
 */
export async function initStorage() {
  try {
    const data = await chrome.storage.local.get(null);
    for (const [key, value] of Object.entries(data)) {
      cache.set(key, value);
    }
    cacheInitialized = true;
  } catch (error) {
    cacheInitialized = false;
    throw error;
  }
}

/**
 * Get a value from storage (cache-first).
 * @param {string} key
 * @param {*} defaultValue
 * @returns {Promise<*>}
 */
export async function get(key, defaultValue = null) {
  if (cache.has(key)) {
    return cache.get(key);
  }

  try {
    const result = await chrome.storage.local.get(key);
    const value = result[key] !== undefined ? result[key] : defaultValue;
    cache.set(key, value);
    return value;
  } catch {
    return defaultValue;
  }
}

/**
 * Set a value in storage (updates cache + persistent storage).
 * @param {string} key
 * @param {*} value
 */
export async function set(key, value) {
  cache.set(key, value);
  try {
    await chrome.storage.local.set({ [key]: value });
  } catch (error) {
    cache.delete(key);
    throw error;
  }
}

/**
 * Remove a value from storage.
 * @param {string} key
 */
export async function remove(key) {
  cache.delete(key);
  try {
    await chrome.storage.local.remove(key);
  } catch (error) {
    throw error;
  }
}

/**
 * Get multiple values at once.
 * @param {string[]} keys
 * @returns {Promise<Object>}
 */
export async function getMultiple(keys) {
  const result = {};
  const uncachedKeys = [];

  for (const key of keys) {
    if (cache.has(key)) {
      result[key] = cache.get(key);
    } else {
      uncachedKeys.push(key);
    }
  }

  if (uncachedKeys.length > 0) {
    try {
      const stored = await chrome.storage.local.get(uncachedKeys);
      for (const key of uncachedKeys) {
        const value = stored[key] !== undefined ? stored[key] : null;
        cache.set(key, value);
        result[key] = value;
      }
    } catch {
      for (const key of uncachedKeys) {
        result[key] = null;
      }
    }
  }

  return result;
}

/**
 * Listen for storage changes (from other contexts like background worker).
 * @param {function} callback - Called with (changes, areaName)
 */
export function onChanged(callback) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local') {
      for (const [key, { newValue }] of Object.entries(changes)) {
        if (newValue !== undefined) {
          cache.set(key, newValue);
        } else {
          cache.delete(key);
        }
      }
      callback(changes, areaName);
    }
  });
}

/** Check if storage cache is initialized. */
export function isInitialized() {
  return cacheInitialized;
}
