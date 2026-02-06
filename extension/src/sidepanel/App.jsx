import { h, render } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { t, initLocale } from '@lib/i18n.js';
import { isOnboardingComplete } from '@lib/storage.js';
import { Onboarding } from './components/Onboarding.jsx';
import { TabBar } from './components/TabBar.jsx';
import { SmartPaste } from './pages/SmartPaste.jsx';
import { History } from './pages/History.jsx';
import { Analysis } from './pages/Analysis.jsx';
import { Settings } from './pages/Settings.jsx';

const TABS = ['smartPaste', 'history', 'analysis', 'settings'];

function App() {
  const [ready, setReady] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [activeTab, setActiveTab] = useState('smartPaste');

  useEffect(() => {
    async function init() {
      await initLocale();
      const complete = await isOnboardingComplete();
      setShowOnboarding(!complete);
      setReady(true);
    }
    init();
  }, []);

  if (!ready) {
    return h('div', { class: 'flex items-center justify-center min-h-screen' },
      h('div', { class: 'text-gray-400 text-sm' }, t('common.loading'))
    );
  }

  if (showOnboarding) {
    return h(Onboarding, {
      onComplete: () => setShowOnboarding(false),
    });
  }

  const pageMap = {
    smartPaste: SmartPaste,
    history: History,
    analysis: Analysis,
    settings: Settings,
  };

  const ActivePage = pageMap[activeTab] || SmartPaste;

  return h('div', { class: 'flex flex-col h-screen w-panel max-w-full' },
    h('div', { class: 'flex-1 overflow-y-auto' },
      h(ActivePage, null)
    ),
    h(TabBar, { active: activeTab, onChange: setActiveTab })
  );
}

render(h(App, null), document.getElementById('app'));
