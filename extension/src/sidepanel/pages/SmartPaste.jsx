import { useState } from 'preact/hooks';
import { t } from '../../lib/i18n.js';
import { TradeTable } from '../components/TradeTable.jsx';
import { LoadingSpinner } from '../components/LoadingSpinner.jsx';

/**
 * Smart Paste page — paste CSV/text, parse, preview, sync to Notion.
 * @param {Object} props
 * @param {boolean} props.notionConnected
 * @param {boolean} props.notionDbConfigured
 * @param {function} props.onSyncComplete
 */
export function SmartPaste({ notionConnected, notionDbConfigured, onSyncComplete }) {
  const [rawInput, setRawInput] = useState('');
  const [parsedTrades, setParsedTrades] = useState(null);
  const [parseLoading, setParsing] = useState(false);
  const [syncLoading, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [syncResult, setSyncResult] = useState(null);

  async function handleParse() {
    if (!rawInput.trim()) {
      return;
    }

    setError('');
    setSyncResult(null);
    setParsedTrades(null);
    setParsing(true);

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'PARSE_TRADES',
        payload: { rawText: rawInput },
      });

      if (response.error) {
        setError(response.error === 'NOT_TRADE_DATA'
          ? t('noTradesFound')
          : response.error === 'RATE_LIMITED'
            ? t('rateLimitDaily')
            : t('parseError'));
        return;
      }

      const trades = response.trades || response;
      if (Array.isArray(trades) && trades.length > 0) {
        setParsedTrades(trades);
      } else {
        setError(t('noTradesFound'));
      }
    } catch {
      setError(t('networkError'));
    } finally {
      setParsing(false);
    }
  }

  async function handleSync() {
    if (!parsedTrades || parsedTrades.length === 0 || !notionConnected) {
      return;
    }

    setError('');
    setSyncResult(null);
    setSyncing(true);

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'SYNC_TO_NOTION',
        payload: { trades: parsedTrades },
      });

      if (response.error) {
        setError(response.error === 'NOTION_NOT_CONNECTED'
          ? t('connectNotionFirst')
          : t('syncError'));
        return;
      }

      setSyncResult(response);
      setParsedTrades(null);
      setRawInput('');
      if (onSyncComplete) {
        onSyncComplete();
      }
    } catch {
      setError(t('networkError'));
    } finally {
      setSyncing(false);
    }
  }

  const canSync = notionConnected && notionDbConfigured;

  return (
    <div class="flex flex-col gap-4">
      <textarea
        class="input-field w-full h-40 resize-y font-mono text-sm"
        placeholder={t('smartPastePlaceholder')}
        value={rawInput}
        onInput={(e) => setRawInput(e.target.value)}
        disabled={parseLoading || syncLoading}
      />

      <button
        type="button"
        class="btn-primary w-full"
        onClick={handleParse}
        disabled={!rawInput.trim() || parseLoading}
      >
        {parseLoading ? t('parsing') : t('parseButton')}
      </button>

      {parseLoading && <LoadingSpinner message={t('parsing')} />}

      {error && (
        <div class="card border-loss/30 bg-loss/10 text-loss text-sm">
          {error}
        </div>
      )}

      {syncResult && (
        <div class="card border-profit/30 bg-profit/10 text-sm flex flex-col gap-2">
          <p class="text-profit font-medium">
            {t('syncResultSynced', [String(syncResult.synced_count || 0)])}
          </p>
          {syncResult.error_count > 0 && (
            <p class="text-loss text-xs">
              {t('syncResultErrors', [String(syncResult.error_count)])}
            </p>
          )}
          {syncResult.results && syncResult.results.length > 0 && (
            <div class="flex flex-wrap gap-1 mt-1">
              {syncResult.results.slice(0, 5).map((r, i) => (
                <span key={i} class="text-xs text-text-muted bg-surface-raised px-2 py-0.5 rounded">
                  {r.symbol}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {parsedTrades && parsedTrades.length > 0 && (
        <div class="flex flex-col gap-3">
          <TradeTable trades={parsedTrades} />
          <button
            type="button"
            class="btn-primary w-full"
            onClick={handleSync}
            disabled={!canSync || syncLoading}
          >
            {syncLoading
              ? t('syncing')
              : canSync
                ? t('confirmSync')
                : t('connectNotionFirst')}
          </button>
        </div>
      )}
    </div>
  );
}
