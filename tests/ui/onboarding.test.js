/**
 * Onboarding Logic Tests
 *
 * Tests for onboarding state flow, license key formatting,
 * and license activation storage. These test the business logic,
 * not the rendering.
 */

import { describe, it, expect } from 'vitest';
import {
  isOnboardingComplete,
  setOnboardingComplete,
  setLicenseInfo,
  getLicenseInfo,
} from '@lib/storage.js';
import { t } from '@lib/i18n.js';

/**
 * Formats raw license key input with auto-dashes.
 * Mirrors the logic used in the Onboarding UI component.
 * Input: "ABCD1234EFGH5678" -> "ABCD-1234-EFGH-5678"
 * Strips non-alphanumeric characters, converts to uppercase,
 * and truncates at 16 alphanumeric characters (19 with dashes).
 */
function formatLicenseInput(raw) {
  const clean = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const truncated = clean.slice(0, 16);
  const groups = [];
  for (let i = 0; i < truncated.length; i += 4) {
    groups.push(truncated.slice(i, i + 4));
  }
  return groups.join('-');
}

describe('Onboarding Flow', () => {
  describe('onboarding state', () => {
    it('onboarding_complete defaults to false when not in storage', async () => {
      const complete = await isOnboardingComplete();
      expect(complete).toBe(false);
    });

    it('after setOnboardingComplete, isOnboardingComplete returns true', async () => {
      await setOnboardingComplete();
      const complete = await isOnboardingComplete();
      expect(complete).toBe(true);
    });

    it('pre-seeding onboarding_complete = true means already onboarded', async () => {
      globalThis.__seedStorage({ onboarding_complete: true });
      const complete = await isOnboardingComplete();
      expect(complete).toBe(true);
    });
  });

  describe('license key format', () => {
    it('formats raw input "ABCD1234EFGH5678" to "ABCD-1234-EFGH-5678"', () => {
      expect(formatLicenseInput('ABCD1234EFGH5678')).toBe('ABCD-1234-EFGH-5678');
    });

    it('strips lowercase and converts to uppercase', () => {
      expect(formatLicenseInput('abcd1234efgh5678')).toBe('ABCD-1234-EFGH-5678');
    });

    it('strips invalid characters (!, @, #, spaces)', () => {
      expect(formatLicenseInput('AB!CD @12#34 EF GH 56 78')).toBe('ABCD-1234-EFGH-5678');
    });

    it('truncates at 16 alphanumeric chars (19 with dashes)', () => {
      const result = formatLicenseInput('ABCD1234EFGH5678EXTRACHARACTERS');
      expect(result).toBe('ABCD-1234-EFGH-5678');
      expect(result.length).toBe(19);
    });

    it('partial input "ABCD" returns "ABCD" without trailing dash', () => {
      expect(formatLicenseInput('ABCD')).toBe('ABCD');
    });

    it('empty input returns empty string', () => {
      expect(formatLicenseInput('')).toBe('');
    });
  });

  describe('license activation flow', () => {
    it('after activation, license info is stored as active', async () => {
      await setLicenseInfo('ABCD-1234-EFGH-5678', 'active');
      const info = await getLicenseInfo();
      expect(info.key).toBe('ABCD-1234-EFGH-5678');
      expect(info.status).toBe('active');
    });

    it('getLicenseInfo returns inactive status by default', async () => {
      const info = await getLicenseInfo();
      expect(info.key).toBeNull();
      expect(info.status).toBe('inactive');
    });
  });

  describe('i18n integration', () => {
    it('onboarding i18n keys resolve to non-empty strings', () => {
      const keys = [
        'onboarding.welcome.title',
        'onboarding.welcome.start',
        'onboarding.license.title',
        'onboarding.license.activate',
        'onboarding.notion.title',
        'onboarding.done.title',
      ];
      for (const key of keys) {
        const value = t(key);
        expect(value).not.toBe(key);
        expect(value.length).toBeGreaterThan(0);
      }
    });

    it('onboarding step string interpolates current and total', () => {
      const result = t('onboarding.step', { current: 2, total: 5 });
      expect(result).toContain('2');
      expect(result).toContain('5');
    });
  });
});
