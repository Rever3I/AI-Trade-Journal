import { useState, useEffect } from 'preact/hooks';
import { t } from '../lib/i18n.js';
import { SmartPaste } from './pages/SmartPaste.jsx';
import { History } from './pages/History.jsx';
import { Analysis } from './pages/Analysis.jsx';
import { Settings } from './pages/Settings.jsx';
import { TabBar } from './components/TabBar.jsx';

const TABS = [
  { id: 'smartpaste', labelKey: 'tabSmartPaste' },
  { id: 'history', labelKey: 'tabHistory' },
  { id: 'analysis', labelKey: 'tabAnalysis' },
  { id: 'settings', labelKey: 'tabSettings' },
];

export function App() {
  const [activeTab, setActiveTab] = useState('smartpaste');
  const [state, setState] = useState({
    notionConnected: false,
    licenseActive: false,
    notionDbConfigured: false,
    settings: { language: 'zh_CN', theme: 'dark' },
    recentSyncs: [],
    recentTrades: [],
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
      // Use default state on error
    } finally {
      setLoading(false);
    }
  }

  function renderActiveTab() {
    switch (activeTab) {
      case 'smartpaste':
        return (
          <SmartPaste
            notionConnected={state.notionConnected}
            notionDbConfigured={state.notionDbConfigured}
            onSyncComplete={loadState}
          />
        );
      case 'history':
        return <History syncs={state.recentSyncs} />;
      case 'analysis':
        return (
          <Analysis
            notionConnected={state.notionConnected}
            recentTrades={state.recentTrades}
          />
        );
      case 'settings':
        return <Settings state={state} onStateChange={loadState} />;
      default:
        return (
          <SmartPaste
            notionConnected={state.notionConnected}
            notionDbConfigured={state.notionDbConfigured}
            onSyncComplete={loadState}
          />
        );
    }
  }

  if (loading) {
    return (
      <div class="flex items-center justify-center h-screen bg-surface">
        <div class="animate-spin rounded-full h-8 w-8 border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div class="flex flex-col h-screen bg-surface w-panel max-w-full">
      <header class="flex items-center justify-between px-4 py-3 border-b border-text-muted/10">
        <h1 class="text-lg font-semibold text-text-primary">{t('extName')}</h1>
        <div class="flex items-center gap-2">
          <span
            class={`w-2 h-2 rounded-full ${state.notionConnected ? 'bg-profit' : 'bg-loss'}`}
            title={t(state.notionConnected ? 'popupNotionConnected' : 'popupNotionDisconnected')}
          />
        </div>
      </header>
      <TabBar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />
      <main class="flex-1 overflow-y-auto p-4">
        {renderActiveTab()}
      </main>
    </div>
  );
}
