import { useState, useEffect } from 'preact/hooks';
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
  const [notionStatus, setNotionStatus] = useState(null);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [settingUpDb, setSettingUpDb] = useState(false);
  const [setupMessage, setSetupMessage] = useState('');

  // Check Notion status on mount if license is active
  useEffect(() => {
    if (state.licenseActive) {
      checkNotionStatus();
    }
  }, [state.licenseActive]);

  async function checkNotionStatus() {
    setCheckingStatus(true);
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'CHECK_NOTION_STATUS',
        payload: {},
      });
      setNotionStatus(response);
      if (onStateChange) {
        onStateChange();
      }
    } catch {
      // Status check failure is non-fatal
    } finally {
      setCheckingStatus(false);
    }
  }

  async function handleConnectNotion() {
    if (!state.licenseActive) {
      setActivationError(t('settingsLicenseRequired'));
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'OPEN_NOTION_AUTH',
        payload: {},
      });

      if (response.error) {
        setActivationError(response.error);
        return;
      }

      // Poll for connection status after OAuth tab opens
      let attempts = 0;
      const pollInterval = setInterval(async () => {
        attempts++;
        if (attempts > 30) {
          clearInterval(pollInterval);
          return;
        }
        try {
          const status = await chrome.runtime.sendMessage({
            action: 'CHECK_NOTION_STATUS',
            payload: {},
          });
          if (status.connected) {
            clearInterval(pollInterval);
            setNotionStatus(status);
            if (onStateChange) {
              onStateChange();
            }
          }
        } catch {
          // Polling failure is non-fatal
        }
      }, 3000);
    } catch {
      setActivationError(t('networkError'));
    }
  }

  async function handleSetupDatabase() {
    setSettingUpDb(true);
    setSetupMessage('');

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'SETUP_NOTION_DB',
        payload: {},
      });

      if (response.error) {
        setSetupMessage(t('settingsSetupFailed'));
      } else {
        setSetupMessage(t('settingsSetupComplete'));
        if (onStateChange) {
          onStateChange();
        }
      }
    } catch {
      setSetupMessage(t('settingsSetupFailed'));
    } finally {
      setSettingUpDb(false);
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

  const isConnected = state.notionConnected || notionStatus?.connected;
  const isDbConfigured = state.notionDbConfigured || notionStatus?.database_configured;

  return (
    <div class="flex flex-col gap-6">
      {/* License Key — show first if not activated */}
      {!state.licenseActive && (
        <section class="flex flex-col gap-2">
          <h3 class="text-sm font-medium text-text-secondary">
            {t('settingsLicenseKey')}
          </h3>
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
          {activating && <LoadingSpinner size="sm" />}
          {activationError && (
            <p class="text-xs text-loss">{activationError}</p>
          )}
        </section>
      )}

      {/* Notion Connection */}
      <section class="flex flex-col gap-2">
        <h3 class="text-sm font-medium text-text-secondary">
          {t('settingsNotionConnection')}
        </h3>
        <div class="card flex flex-col gap-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span
                class={`w-2 h-2 rounded-full ${isConnected ? 'bg-profit' : 'bg-loss'}`}
              />
              <span class="text-sm text-text-primary">
                {checkingStatus
                  ? t('settingsCheckingStatus')
                  : t(isConnected ? 'popupNotionConnected' : 'popupNotionDisconnected')}
              </span>
            </div>
            {!isConnected && (
              <button
                type="button"
                class="btn-secondary text-xs py-1 px-3"
                onClick={handleConnectNotion}
                disabled={!state.licenseActive}
              >
                {t('settingsConnectNotion')}
              </button>
            )}
          </div>

          {/* Workspace info */}
          {isConnected && notionStatus?.workspace_name && (
            <div class="text-xs text-text-muted">
              {t('settingsWorkspace')}: {notionStatus.workspace_name}
            </div>
          )}

          {/* Database setup */}
          {isConnected && !isDbConfigured && (
            <div class="flex flex-col gap-2">
              <button
                type="button"
                class="btn-primary text-sm w-full"
                onClick={handleSetupDatabase}
                disabled={settingUpDb}
              >
                {settingUpDb ? t('settingsSetupLoading') : t('settingsSetupDatabase')}
              </button>
              {setupMessage && (
                <p class={`text-xs ${setupMessage === t('settingsSetupComplete') ? 'text-profit' : 'text-loss'}`}>
                  {setupMessage}
                </p>
              )}
            </div>
          )}

          {/* Database ready */}
          {isConnected && isDbConfigured && (
            <div class="flex items-center gap-2 text-xs text-profit">
              <span class="w-1.5 h-1.5 rounded-full bg-profit" />
              {t('settingsDatabaseReady')}
            </div>
          )}
        </div>
      </section>

      {/* License Key — show status if active */}
      {state.licenseActive && (
        <section class="flex flex-col gap-2">
          <h3 class="text-sm font-medium text-text-secondary">
            {t('settingsLicenseKey')}
          </h3>
          <div class="card flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-profit" />
            <span class="text-sm text-profit">{t('popupLicenseActive')}</span>
          </div>
        </section>
      )}

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
