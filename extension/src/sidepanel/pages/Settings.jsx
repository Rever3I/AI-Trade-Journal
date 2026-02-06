import { useState } from 'preact/hooks';
import { t } from '../../lib/i18n.js';
import { LoadingSpinner } from '../components/LoadingSpinner.jsx';

/**
 * Settings page — Notion connection, license key, preferences.
 * @param {Object} props
 * @param {Object} props.state - Current extension state
 * @param {function} props.onStateChange - Callback after state changes
 */
export function Settings({ state, onStateChange }) {
  const [licenseInput, setLicenseInput] = useState('');
  const [activating, setActivating] = useState(false);
  const [activationError, setActivationError] = useState('');

  async function handleConnectNotion() {
    try {
      await chrome.runtime.sendMessage({ action: 'OPEN_NOTION_AUTH', payload: {} });
    } catch {
      // Notion auth will be implemented in Sprint 2
    }
  }

  async function handleActivateLicense() {
    if (!licenseInput.trim()) {
      return;
    }

    setActivationError('');
    setActivating(true);

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'VALIDATE_LICENSE',
        payload: { licenseKey: licenseInput.trim() },
      });

      if (response.error) {
        setActivationError(response.error);
        return;
      }

      setLicenseInput('');
      if (onStateChange) {
        onStateChange();
      }
    } catch {
      setActivationError(t('networkError'));
    } finally {
      setActivating(false);
    }
  }

  return (
    <div class="flex flex-col gap-6">
      {/* Notion Connection */}
      <section class="flex flex-col gap-2">
        <h3 class="text-sm font-medium text-text-secondary">
          {t('settingsNotionConnection')}
        </h3>
        <div class="card flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span
              class={`w-2 h-2 rounded-full ${state.notionConnected ? 'bg-profit' : 'bg-loss'}`}
            />
            <span class="text-sm text-text-primary">
              {t(state.notionConnected ? 'popupNotionConnected' : 'popupNotionDisconnected')}
            </span>
          </div>
          <button
            type="button"
            class="btn-secondary text-xs py-1 px-3"
            onClick={handleConnectNotion}
          >
            {t(state.notionConnected ? 'settingsDisconnect' : 'settingsConnectNotion')}
          </button>
        </div>
      </section>

      {/* License Key */}
      <section class="flex flex-col gap-2">
        <h3 class="text-sm font-medium text-text-secondary">
          {t('settingsLicenseKey')}
        </h3>
        {state.licenseActive ? (
          <div class="card flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-profit" />
            <span class="text-sm text-profit">{t('popupLicenseActive')}</span>
          </div>
        ) : (
          <div class="flex gap-2">
            <input
              type="text"
              class="input-field flex-1 text-sm"
              placeholder={t('settingsLicensePlaceholder')}
              value={licenseInput}
              maxLength={16}
              onInput={(e) => setLicenseInput(e.target.value)}
              disabled={activating}
            />
            <button
              type="button"
              class="btn-primary text-sm py-2 px-4"
              onClick={handleActivateLicense}
              disabled={!licenseInput.trim() || activating}
            >
              {activating ? '...' : t('settingsActivate')}
            </button>
          </div>
        )}
        {activating && <LoadingSpinner size="sm" />}
        {activationError && (
          <p class="text-xs text-loss">{activationError}</p>
        )}
      </section>

      {/* Language */}
      <section class="flex flex-col gap-2">
        <h3 class="text-sm font-medium text-text-secondary">
          {t('settingsLanguage')}
        </h3>
        <div class="card text-sm text-text-muted">
          {t('settingsLanguage')}: {state.settings?.language === 'zh_CN' ? '中文' : 'English'}
        </div>
      </section>
    </div>
  );
}
