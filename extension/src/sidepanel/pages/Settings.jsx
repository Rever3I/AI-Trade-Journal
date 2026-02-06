import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { t, setLocale, getLocale } from '@lib/i18n.js';
import { formatLicenseInput } from '@lib/format.js';
import {
  getLicenseInfo, setLicenseInfo,
  getNotionConnection, clearNotionConnection,
  getUsageToday, setValue,
} from '@lib/storage.js';
import { activateLicense, validateLicense } from '@lib/api.js';
import { startNotionOAuth, pollNotionConnection, setupDatabase } from '@lib/notion.js';
import { ErrorMessage } from '@components/ErrorMessage.jsx';
import { LoadingButton } from '@components/LoadingButton.jsx';

export function Settings() {
  const [license, setLicense] = useState({ key: null, status: 'inactive' });
  const [notion, setNotion] = useState({ connected: false, databaseId: null });
  const [usage, setUsage] = useState(0);
  const [locale, setLocaleState] = useState(getLocale());
  const [loading, setLoading] = useState({});
  const [error, setError] = useState(null);
  const [licenseInput, setLicenseInput] = useState('');

  async function handleActivateLicense() {
    setError(null);
    setLoading(prev => ({ ...prev, license: true }));
    try {
      await activateLicense(licenseInput);
      await setLicenseInfo(licenseInput, 'active');
      setLicense({ key: licenseInput, status: 'active' });
      setLicenseInput('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(prev => ({ ...prev, license: false }));
    }
  }

  async function handleConnectNotion() {
    setError(null);
    setLoading(prev => ({ ...prev, notion: true }));
    try {
      await startNotionOAuth();
      const result = await pollNotionConnection();
      if (result.connected) {
        setNotion(prev => ({ ...prev, connected: true }));
      } else {
        setError(t('error.notionDisconnected'));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(prev => ({ ...prev, notion: false }));
    }
  }

  async function handleDisconnectNotion() {
    await clearNotionConnection();
    setNotion({ connected: false, databaseId: null, databaseUrl: null });
  }

  async function handleSetupDatabase() {
    setError(null);
    setLoading(prev => ({ ...prev, database: true }));
    try {
      const result = await setupDatabase();
      setNotion(prev => ({
        ...prev,
        databaseId: result.database_id,
        databaseUrl: result.database_url,
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(prev => ({ ...prev, database: false }));
    }
  }

  async function handleLocaleChange(newLocale) {
    setLocale(newLocale);
    setLocaleState(newLocale);
    await setValue('locale', newLocale);
  }

  return h('div', { class: 'p-4 space-y-6' },
    h('h2', { class: 'text-lg font-semibold' }, t('settings.title')),

    error && h(ErrorMessage, { message: error, onRetry: () => setError(null) }),

    // Notion Connection
    h('section', { class: 'card' },
      h('h3', { class: 'text-sm font-medium text-gray-300 mb-3' }, t('settings.notion.title')),
      h('div', { class: 'flex items-center justify-between mb-3' },
        h('span', {
          class: `badge ${notion.connected ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'}`,
        }, notion.connected ? t('settings.notion.connected') : t('settings.notion.disconnected')),
        notion.connected
          ? h('button', {
              class: 'text-red-400 hover:text-red-300 text-xs',
              onClick: handleDisconnectNotion,
            }, t('settings.notion.disconnect'))
          : h(LoadingButton, {
              loading: loading.notion,
              class: 'btn-primary text-xs py-1 px-3',
              onClick: handleConnectNotion,
            }, t('settings.notion.connect')),
      ),
      notion.connected && !notion.databaseId && h('div', null,
        h(LoadingButton, {
          loading: loading.database,
          class: 'btn-secondary w-full text-sm',
          onClick: handleSetupDatabase,
        }, t('settings.notion.setupDb')),
      ),
      notion.databaseId && h('div', { class: 'text-xs text-gray-400' },
        t('settings.notion.database'), ': ',
        notion.databaseUrl
          ? h('a', {
              href: notion.databaseUrl,
              target: '_blank',
              class: 'text-brand-400 hover:text-brand-300',
            }, notion.databaseId.slice(0, 8) + '...')
          : h('span', null, notion.databaseId.slice(0, 8) + '...'),
      ),
    ),

    // License
    h('section', { class: 'card' },
      h('h3', { class: 'text-sm font-medium text-gray-300 mb-3' }, t('settings.license.title')),
      license.status === 'active'
        ? h('div', null,
            h('div', { class: 'flex items-center gap-2 mb-2' },
              h('span', { class: 'badge bg-green-900/40 text-green-400' }, t('settings.license.active')),
              h('span', { class: 'text-xs text-gray-400 font-mono' }, license.key),
            ),
            h('div', { class: 'text-xs text-gray-400' },
              t('settings.license.usage', { used: usage, limit: 10 }),
            ),
            h('div', { class: 'h-1.5 bg-surface-border rounded-full overflow-hidden mt-1' },
              h('div', {
                class: `h-full rounded-full ${usage >= 10 ? 'bg-red-500' : usage >= 7 ? 'bg-yellow-500' : 'bg-brand-500'}`,
                style: { width: `${Math.min((usage / 10) * 100, 100)}%` },
              }),
            ),
          )
        : h('div', null,
            h('div', { class: 'flex gap-2' },
              h('input', {
                class: 'input-field text-sm font-mono flex-1',
                placeholder: t('onboarding.license.placeholder'),
                value: licenseInput,
                onInput: (e) => setLicenseInput(formatLicenseInput(e.target.value)),
                maxLength: 19,
              }),
              h(LoadingButton, {
                loading: loading.license,
                class: 'btn-primary text-sm',
                onClick: handleActivateLicense,
                disabled: licenseInput.replace(/-/g, '').length !== 16,
              }, t('settings.license.activate')),
            ),
          ),
    ),

    // Language
    h('section', { class: 'card' },
      h('h3', { class: 'text-sm font-medium text-gray-300 mb-3' }, t('settings.language.title')),
      h('div', { class: 'flex gap-2' },
        ['zh_CN', 'en'].map(loc =>
          h('button', {
            key: loc,
            class: `flex-1 py-2 rounded-lg text-sm border transition-colors ${
              locale === loc
                ? 'border-brand-500 bg-brand-500/10 text-brand-400'
                : 'border-surface-border text-gray-400 hover:bg-surface-hover'
            }`,
            onClick: () => handleLocaleChange(loc),
          }, loc === 'zh_CN' ? '\u4E2D\u6587' : 'English'),
        ),
      ),
    ),

    // About
    h('section', { class: 'card' },
      h('h3', { class: 'text-sm font-medium text-gray-300 mb-2' }, t('settings.about.title')),
      h('p', { class: 'text-xs text-gray-500' }, t('settings.about.version', { version: '1.0.0' })),
    ),
  );
}
