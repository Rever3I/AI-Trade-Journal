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

  function statusBadge(sync) {
    if (sync.status === 'success') {
      return { class: 'bg-profit/10 text-profit', text: '✓' };
    }
    if (sync.status === 'partial') {
      return { class: 'bg-yellow-500/10 text-yellow-400', text: t('historyPartialSync') };
    }
    return { class: 'bg-loss/10 text-loss', text: '✗' };
  }

  return (
    <div class="flex flex-col gap-2">
      {syncs.map((sync, index) => {
        const badge = statusBadge(sync);
        return (
          <div key={index} class="card flex flex-col gap-2">
            <div class="flex items-center justify-between">
              <div class="flex flex-col">
                <span class="text-sm text-text-primary font-medium">
                  {t('historyTradeCount', [String(sync.tradeCount)])}
                </span>
                <span class="text-xs text-text-muted">
                  {formatDate(sync.timestamp)}
                </span>
              </div>
              <span class={`text-xs px-2 py-1 rounded-full ${badge.class}`}>
                {badge.text}
              </span>
            </div>

            {sync.errorCount > 0 && (
              <div class="text-xs text-loss">
                {t('syncResultErrors', [String(sync.errorCount)])}
              </div>
            )}

            {sync.results && sync.results.length > 0 && (
              <div class="flex flex-wrap gap-1">
                {sync.results.slice(0, 8).map((r, i) => (
                  <span key={i} class="text-xs text-text-muted bg-surface-raised px-1.5 py-0.5 rounded">
                    {r.symbol}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
