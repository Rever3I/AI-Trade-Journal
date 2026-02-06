/**
 * Format a license key input: strip non-alphanumeric, uppercase, add dashes.
 * @param {string} value - Raw input value
 * @returns {string} Formatted as XXXX-XXXX-XXXX-XXXX
 */
export function formatLicenseInput(value) {
  const clean = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 16);
  const parts = [];
  for (let i = 0; i < clean.length; i += 4) {
    parts.push(clean.slice(i, i + 4));
  }
  return parts.join('-');
}

/**
 * Validate license key format: 16 alphanumeric chars with dashes.
 * @param {string} key - License key with dashes
 * @returns {boolean}
 */
export function isValidLicenseFormat(key) {
  return /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key);
}
