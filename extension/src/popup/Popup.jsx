import { h, render } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { t, initLocale } from '@lib/i18n.js';
import { getLicenseInfo, getNotionConnection, getUsageToday } from '@lib/storage.js';

function Popup() {
  const [license, setLicense] = useState(null);
  const [notion, setNotion] = useState(null);
  const [usage, setUsage] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function init() {
      await initLocale();
      const lic = await getLicenseInfo();
      const not = await getNotionConnection();
      const used = await getUsageToday();
      setLicense(lic);
      setNotion(not);
      setUsage(used);
      setReady(true);
    }
    init();
  }, []);

  function openSidePanel() {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' });
    }
    window.close();
  }

  if (!ready) {
    return h('div', { class: 'p-4 text-center text-gray-400 text-sm' }, t('common.loading'));
  }

  return h('div', { class: 'p-4 min-w-[280px]' },
    // Header
    h('div', { class: 'flex items-center gap-2 mb-4' },
      h('span', { class: 'text-xl' }, '\u{1F4CA}'),
      h('h1', { class: 'text-sm font-bold' }, 'AI Trade Journal'),
    ),

    // Status indicators
    h('div', { class: 'space-y-2 mb-4' },
      h(StatusRow, {
        label: t('settings.license.title'),
        connected: license?.status === 'active',
        detail: license?.status === 'active' ? license.key : null,
      }),
      h(StatusRow, {
        label: t('settings.notion.title'),
        connected: notion?.connected,
        detail: notion?.databaseId ? t('settings.notion.database') : null,
      }),
    ),

    // Usage
    h('div', { class: 'mb-4' },
      h('div', { class: 'text-xs text-gray-400 mb-1' },
        t('settings.license.usage', { used: usage, limit: 10 }),
      ),
      h('div', { class: 'h-1.5 bg-surface-border rounded-full overflow-hidden' },
        h('div', {
          class: `h-full rounded-full ${usage >= 10 ? 'bg-red-500' : 'bg-brand-500'}`,
          style: { width: `${Math.min((usage / 10) * 100, 100)}%` },
        }),
      ),
    ),

    // Open side panel button
    h('button', {
      class: 'btn-primary w-full text-sm',
      onClick: openSidePanel,
    }, t('tab.smartPaste')),
  );
}

function StatusRow({ label, connected, detail }) {
  return h('div', { class: 'flex items-center justify-between' },
    h('span', { class: 'text-xs text-gray-400' }, label),
    h('div', { class: 'flex items-center gap-1.5' },
      detail && h('span', { class: 'text-xs text-gray-500 font-mono max-w-[120px] truncate' }, detail),
      h('span', {
        class: `w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`,
      }),
    ),
  );
}

render(h(Popup, null), document.getElementById('popup-root'));
