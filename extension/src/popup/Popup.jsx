import { useState, useEffect } from 'preact/hooks';
import { t } from '../lib/i18n.js';

/**
 * Popup UI — quick status overview and actions.
 * Compact view showing connection status with action buttons.
 */
export function Popup() {
  const [state, setState] = useState({
    notionConnected: false,
    licenseActive: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadState();
  }, []);

  async function loadState() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'GET_STATE' });
      if (response && !response.error) {
        setState(response);
      }
    } catch {
      // Use default state
    } finally {
      setLoading(false);
    }
  }

  async function handleOpenSidePanel() {
    try {
      await chrome.runtime.sendMessage({ action: 'OPEN_SIDE_PANEL' });
      window.close();
    } catch {
      // Side panel open failed
    }
  }

  if (loading) {
    return (
      <div class="w-64 p-4 flex items-center justify-center">
        <div class="animate-spin rounded-full h-6 w-6 border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div class="w-64 bg-surface">
      <div class="p-4 border-b border-text-muted/10">
        <h1 class="text-base font-semibold text-text-primary">{t('extName')}</h1>
      </div>

      <div class="p-4 flex flex-col gap-3">
        <h2 class="text-xs font-medium text-text-secondary uppercase tracking-wider">
          {t('popupStatus')}
        </h2>

        <div class="flex items-center gap-2">
          <span class={`w-2 h-2 rounded-full ${state.notionConnected ? 'bg-profit' : 'bg-loss'}`} />
          <span class="text-sm text-text-primary">
            {t(state.notionConnected ? 'popupNotionConnected' : 'popupNotionDisconnected')}
          </span>
        </div>

        <div class="flex items-center gap-2">
          <span class={`w-2 h-2 rounded-full ${state.licenseActive ? 'bg-profit' : 'bg-loss'}`} />
          <span class="text-sm text-text-primary">
            {t(state.licenseActive ? 'popupLicenseActive' : 'popupLicenseInactive')}
          </span>
        </div>
      </div>

      <div class="p-4 pt-0 flex flex-col gap-2">
        <button
          type="button"
          class="btn-primary w-full text-sm"
          onClick={handleOpenSidePanel}
        >
          {t('popupOpenPanel')}
        </button>
      </div>
    </div>
  );
}
