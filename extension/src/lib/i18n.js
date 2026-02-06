/**
 * i18n utility for Chrome Extension internationalization.
 * Wraps chrome.i18n.getMessage with fallback support.
 */

/**
 * Get a localized message by key.
 * @param {string} key - Message key from _locales/messages.json
 * @param {string|string[]} [substitutions] - Placeholder substitutions
 * @returns {string} Localized message or key as fallback
 */
export function t(key, substitutions) {
  try {
    const message = chrome.i18n.getMessage(key, substitutions);
    return message || key;
  } catch {
    return key;
  }
}

/**
 * Get the current UI language.
 * @returns {string} Language code (e.g., 'zh_CN', 'en')
 */
export function getUILanguage() {
  try {
    return chrome.i18n.getUILanguage();
  } catch {
    return 'zh-CN';
  }
}

/**
 * Check if current language is Chinese.
 * @returns {boolean}
 */
export function isChinese() {
  const lang = getUILanguage();
  return lang.startsWith('zh');
}
