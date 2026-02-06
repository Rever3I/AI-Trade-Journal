/**
 * License Flow Tests
 *
 * Tests for the license activation and validation workflow,
 * including format checking and API header inclusion after activation.
 */

import { activateLicense, ApiError, WORKER_URL } from '@lib/api.js';
import { setLicenseInfo, getLicenseInfo } from '@lib/storage.js';

/**
 * Validates license key format: XXXX-XXXX-XXXX-XXXX
 * Each segment is 4 uppercase alphanumeric characters.
 */
function isValidLicenseFormat(key) {
  if (typeof key !== 'string') return false;
  return /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key);
}

describe('License flow', () => {
  describe('License format validation', () => {
    it('should accept valid format XXXX-XXXX-XXXX-XXXX with uppercase alphanumeric', () => {
      expect(isValidLicenseFormat('ABCD-1234-EFGH-5678')).toBe(true);
      expect(isValidLicenseFormat('A1B2-C3D4-E5F6-G7H8')).toBe(true);
      expect(isValidLicenseFormat('0000-0000-0000-0000')).toBe(true);
      expect(isValidLicenseFormat('ZZZZ-ZZZZ-ZZZZ-ZZZZ')).toBe(true);
    });

    it('should reject format that is too short', () => {
      expect(isValidLicenseFormat('ABCD-1234')).toBe(false);
      expect(isValidLicenseFormat('ABC')).toBe(false);
      expect(isValidLicenseFormat('')).toBe(false);
    });

    it('should reject format with wrong characters (lowercase, special)', () => {
      expect(isValidLicenseFormat('abcd-1234-efgh-5678')).toBe(false);
      expect(isValidLicenseFormat('AB!D-1234-EFGH-5678')).toBe(false);
      expect(isValidLicenseFormat('ABCD 1234 EFGH 5678')).toBe(false);
    });
  });

  describe('License activation', () => {
    it('should activate an unused license and store active status', async () => {
      globalThis.__mockFetchResponses.push({
        ok: true,
        status: 200,
        body: { status: 'active', key: 'ABCD-1234-EFGH-5678' },
      });

      const result = await activateLicense('ABCD-1234-EFGH-5678');
      expect(result.status).toBe('active');

      // Store it in local storage as if the UI would do
      await setLicenseInfo(result.key, result.status);
      const info = await getLicenseInfo();
      expect(info.key).toBe('ABCD-1234-EFGH-5678');
      expect(info.status).toBe('active');
    });
  });

  describe('License key included in API headers after activation', () => {
    it('should include X-License-Key header in subsequent API requests', async () => {
      // Seed an active license in storage
      await setLicenseInfo('TEST-KEY0-ABCD-1234', 'active');

      globalThis.__mockFetchResponses.push({
        ok: true,
        status: 200,
        body: { valid: true },
      });

      // Any API call (e.g., activateLicense) should include the header
      await activateLicense('ANOTHER-KEY');

      const [, options] = fetch.mock.calls[0];
      expect(options.headers['X-License-Key']).toBe('TEST-KEY0-ABCD-1234');
    });
  });
});
