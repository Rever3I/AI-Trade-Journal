/**
 * i18n Module Tests
 *
 * Tests for the internationalization module that handles
 * Chinese-first / English-fallback string lookups with interpolation.
 */

import { t, setLocale, getLocale, initLocale } from '@lib/i18n.js';

describe('i18n module', () => {
  // Reset locale to default before each test
  beforeEach(() => {
    setLocale('zh_CN');
  });

  describe('getLocale / setLocale', () => {
    it('should default to zh_CN', () => {
      expect(getLocale()).toBe('zh_CN');
    });

    it('should switch to English with setLocale("en")', () => {
      setLocale('en');
      expect(getLocale()).toBe('en');
    });

    it('should ignore invalid locale and stay on current', () => {
      setLocale('en');
      expect(getLocale()).toBe('en');
      setLocale('invalid_locale');
      expect(getLocale()).toBe('en');
    });

    it('should switch back from en to zh_CN', () => {
      setLocale('en');
      expect(getLocale()).toBe('en');
      setLocale('zh_CN');
      expect(getLocale()).toBe('zh_CN');
    });
  });

  describe('t() — string lookup', () => {
    it('should return Chinese string for known key in zh_CN locale', () => {
      const result = t('tab.smartPaste');
      expect(result).toBe('智能粘贴');
    });

    it('should return English string for known key in en locale', () => {
      setLocale('en');
      const result = t('tab.smartPaste');
      expect(result).toBe('Smart Paste');
    });

    it('should return the key itself for unknown key (fallback)', () => {
      const result = t('nonexistent.key.that.does.not.exist');
      expect(result).toBe('nonexistent.key.that.does.not.exist');
    });

    it('should interpolate single param correctly', () => {
      const result = t('smartPaste.preview.tradeCount', { count: 5 });
      expect(result).toBe('共 5 笔交易');
    });

    it('should interpolate multiple params correctly', () => {
      const result = t('onboarding.step', { current: 2, total: 4 });
      expect(result).toBe('步骤 2/4');
    });

    it('should handle empty params without breaking', () => {
      const result = t('tab.smartPaste', {});
      expect(result).toBe('智能粘贴');
    });

    it('should leave unreplaced placeholders as-is when params are not provided', () => {
      // The charCount key has {count} and {lines} placeholders
      // Calling with only one param should leave the other placeholder
      const result = t('smartPaste.charCount', { count: 42 });
      expect(result).toContain('42');
      expect(result).toContain('{lines}');
    });

    it('should interpolate params in English locale', () => {
      setLocale('en');
      const result = t('smartPaste.preview.tradeCount', { count: 10 });
      expect(result).toBe('10 trades found');
    });
  });

  describe('critical error messages exist in both locales', () => {
    const criticalKeys = [
      'error.network',
      'error.rateLimit',
      'error.notionDisconnected',
      'error.invalidLicense',
      'error.licenseUsed',
      'error.parseFailed',
      'error.syncFailed',
      'error.analysisFailed',
      'error.unknown',
    ];

    it('should have all critical error keys in zh_CN locale', () => {
      setLocale('zh_CN');
      for (const key of criticalKeys) {
        const result = t(key);
        // Should not return the key itself (which means it was not found)
        expect(result).not.toBe(key);
        expect(result.length).toBeGreaterThan(0);
      }
    });

    it('should have all critical error keys in en locale', () => {
      setLocale('en');
      for (const key of criticalKeys) {
        const result = t(key);
        expect(result).not.toBe(key);
        expect(result.length).toBeGreaterThan(0);
      }
    });
  });

  describe('initLocale', () => {
    it('should load locale from chrome.storage if available', async () => {
      globalThis.__seedStorage({ locale: 'en' });
      await initLocale();
      expect(getLocale()).toBe('en');
    });
  });
});
