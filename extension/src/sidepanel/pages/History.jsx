import { t } from '../../lib/i18n.js';

/**
 * History page — shows recent sync history and results.
 * @param {Object} props
 * @param {Array} props.syncs - Recent sync history entries
 */
export function History({ syncs }) {
  if (!syncs || syncs.length === 0) {
    return (
      <div class="flex flex-col items-center justify-center py-12 text-text-secondary">
        <svg class="w-12 h-12 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p class="text-sm">{t('historyEmpty')}</p>
      </div>
    );
  }

  function formatDate(isoString) {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) {
      return isoString;
    }
    return date.toLocaleString();
  }

  return (
    <div class="flex flex-col gap-2">
      {syncs.map((sync, index) => (
        <div key={index} class="card flex items-center justify-between">
          <div class="flex flex-col">
            <span class="text-sm text-text-primary font-medium">
              {t('historyTradeCount', [String(sync.tradeCount)])}
            </span>
            <span class="text-xs text-text-muted">
              {formatDate(sync.timestamp)}
            </span>
          </div>
          <span
            class={`text-xs px-2 py-1 rounded-full ${
              sync.status === 'success'
                ? 'bg-profit/10 text-profit'
                : 'bg-loss/10 text-loss'
            }`}
          >
            {sync.status === 'success' ? '✓' : '✗'}
          </span>
        </div>
      ))}
    </div>
  );
}
