import { h } from 'preact';
import { useState } from 'preact/hooks';
import { t } from '@lib/i18n.js';
import { formatLicenseInput } from '@lib/format.js';
import { setOnboardingComplete, setLicenseInfo, setNotionConnection } from '@lib/storage.js';
import { activateLicense } from '@lib/api.js';
import { startNotionOAuth, pollNotionConnection, setupDatabase } from '@lib/notion.js';
import { ErrorMessage } from './ErrorMessage.jsx';
import { LoadingButton } from './LoadingButton.jsx';

const STEPS = ['welcome', 'license', 'notion', 'database', 'done'];

export function Onboarding({ onComplete }) {
  const [step, setStep] = useState(0);
  const [licenseKey, setLicenseKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [notionConnected, setNotionConnected] = useState(false);
  const [databaseCreated, setDatabaseCreated] = useState(false);
  const [databaseUrl, setDatabaseUrl] = useState(null);

  const currentStep = STEPS[step];

  function goBack() {
    if (step > 1) {
      setError(null);
      setStep(step - 1);
    }
  }

  async function handleActivate() {
    setError(null);
    const clean = licenseKey.replace(/-/g, '');
    if (clean.length !== 16) {
      setError(t('error.invalidLicense'));
      return;
    }
    setLoading(true);
    try {
      await activateLicense(licenseKey);
      await setLicenseInfo(licenseKey, 'active');
      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleConnectNotion() {
    setError(null);
    setLoading(true);
    try {
      await startNotionOAuth();
      const result = await pollNotionConnection();
      if (result.connected) {
        setNotionConnected(true);
        setStep(3);
      } else {
        setError(t('error.notionDisconnected'));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateDatabase() {
    setError(null);
    setLoading(true);
    try {
      const result = await setupDatabase();
      setDatabaseCreated(true);
      setDatabaseUrl(result.database_url || null);
      setStep(4);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleFinish() {
    await setOnboardingComplete();
    onComplete();
  }

  return h('div', { class: 'min-h-screen flex flex-col p-6' },
    // Progress indicator
    step > 0 && step < 4 && h('div', { class: 'mb-6' },
      h('div', { class: 'flex items-center justify-between mb-2' },
        step > 1 && h('button', {
          class: 'text-gray-400 hover:text-gray-200 text-sm',
          onClick: goBack,
        }, t('onboarding.back')),
        step <= 1 && h('div', null),
        h('span', { class: 'text-gray-500 text-xs' },
          t('onboarding.step', { current: step, total: 3 })
        ),
      ),
      h('div', { class: 'flex gap-1' },
        [1, 2, 3].map(i =>
          h('div', {
            key: i,
            class: `h-1 flex-1 rounded-full ${i <= step ? 'bg-brand-500' : 'bg-surface-border'}`,
          })
        )
      ),
    ),

    // Content
    h('div', { class: 'flex-1 flex flex-col items-center justify-center' },
      // Welcome
      currentStep === 'welcome' && h('div', { class: 'text-center' },
        h('div', { class: 'text-5xl mb-6' }, '\u{1F4CA}'),
        h('h1', { class: 'text-2xl font-bold mb-3' }, t('onboarding.welcome.title')),
        h('p', { class: 'text-gray-400 mb-8 max-w-xs' }, t('onboarding.welcome.subtitle')),
        h('button', {
          class: 'btn-primary text-lg px-8 py-3',
          onClick: () => setStep(1),
        }, t('onboarding.welcome.start')),
      ),

      // License Key
      currentStep === 'license' && h('div', { class: 'w-full max-w-sm' },
        h('h2', { class: 'text-xl font-bold mb-2 text-center' }, t('onboarding.license.title')),
        h('div', { class: 'mt-6' },
          h('input', {
            type: 'text',
            class: 'input-field text-center text-lg tracking-wider font-mono',
            placeholder: t('onboarding.license.placeholder'),
            value: licenseKey,
            onInput: (e) => setLicenseKey(formatLicenseInput(e.target.value)),
            maxLength: 19,
          }),
        ),
        error && h(ErrorMessage, { message: error, onRetry: () => setError(null) }),
        h('div', { class: 'mt-4' },
          h(LoadingButton, {
            loading,
            class: 'btn-primary w-full',
            onClick: handleActivate,
            disabled: licenseKey.replace(/-/g, '').length !== 16,
          },
            loading ? t('onboarding.license.activating') : t('onboarding.license.activate')
          ),
        ),
      ),

      // Notion OAuth
      currentStep === 'notion' && h('div', { class: 'w-full max-w-sm text-center' },
        h('h2', { class: 'text-xl font-bold mb-2' }, t('onboarding.notion.title')),
        h('p', { class: 'text-gray-400 text-sm mb-6' }, t('onboarding.notion.desc')),
        error && h(ErrorMessage, { message: error, onRetry: () => setError(null) }),
        notionConnected
          ? h('div', { class: 'text-score-high font-medium' }, t('onboarding.notion.connected'))
          : h(LoadingButton, {
              loading,
              class: 'btn-primary w-full',
              onClick: handleConnectNotion,
            },
              loading ? t('onboarding.notion.connecting') : t('onboarding.notion.connect')
            ),
      ),

      // Database Setup
      currentStep === 'database' && h('div', { class: 'w-full max-w-sm text-center' },
        h('h2', { class: 'text-xl font-bold mb-2' }, t('onboarding.database.title')),
        h('p', { class: 'text-gray-400 text-sm mb-6' }, t('onboarding.database.desc')),
        error && h(ErrorMessage, { message: error, onRetry: () => setError(null) }),
        databaseCreated
          ? h('div', null,
              h('div', { class: 'text-score-high font-medium mb-3' }, t('common.success')),
              databaseUrl && h('a', {
                href: databaseUrl,
                target: '_blank',
                class: 'text-brand-400 hover:text-brand-300 text-sm underline',
              }, t('onboarding.database.viewInNotion')),
            )
          : h(LoadingButton, {
              loading,
              class: 'btn-primary w-full',
              onClick: handleCreateDatabase,
            },
              loading ? t('onboarding.database.creating') : t('onboarding.database.create')
            ),
      ),

      // Done
      currentStep === 'done' && h('div', { class: 'text-center' },
        h('div', { class: 'text-5xl mb-6' }, '\u{2705}'),
        h('h2', { class: 'text-xl font-bold mb-2' }, t('onboarding.done.title')),
        h('p', { class: 'text-gray-400 mb-8' }, t('onboarding.done.desc')),
        h('button', {
          class: 'btn-primary text-lg px-8 py-3',
          onClick: handleFinish,
        }, t('onboarding.done.start')),
      ),
    ),
  );
}
