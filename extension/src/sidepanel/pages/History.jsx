import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { t } from '@lib/i18n.js';
import { getSyncHistory } from '@lib/storage.js';

const STATUS_STYLES = {
  synced: 'bg-green-900/40 text-green-400',
  pending: 'bg-yellow-900/40 text-yellow-400',
  error: 'bg-red-900/40 text-red-400',
};

export function History() {
  const [history, setHistory] = useState([]);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    async function load() {
      const entries = await getSyncHistory();
      setHistory(entries);
    }
    load();
  }, []);

  if (history.length === 0) {
    return h('div', { class: 'p-4' },
      h('h2', { class: 'text-lg font-semibold mb-4' }, t('history.title')),
      h('div', { class: 'card text-center py-12' },
        h('p', { class: 'text-gray-500' }, t('history.empty')),
      ),
    );
  }

  return h('div', { class: 'p-4' },
    h('h2', { class: 'text-lg font-semibold mb-4' }, t('history.title')),
    h('div', { class: 'space-y-2' },
      history.map(entry =>
        h('div', {
          key: entry.id,
          class: 'card cursor-pointer hover:bg-surface-hover transition-colors',
          onClick: () => setExpandedId(expandedId === entry.id ? null : entry.id),
        },
          h('div', { class: 'flex items-center justify-between' },
            h('div', null,
              h('div', { class: 'text-sm font-medium text-gray-200' },
                formatDate(entry.timestamp),
              ),
              h('div', { class: 'text-xs text-gray-400 mt-0.5' },
                t('history.trades', { count: entry.tradeCount || 0 }),
                entry.symbols && entry.symbols.length > 0 &&
                  ` \u00B7 ${entry.symbols.slice(0, 4).join(', ')}${entry.symbols.length > 4 ? '...' : ''}`,
              ),
            ),
            h('span', {
              class: `badge ${STATUS_STYLES[entry.status] || STATUS_STYLES.pending}`,
            }, t(`history.status.${entry.status || 'pending'}`)),
          ),
          // Expanded details
          expandedId === entry.id && entry.trades && h('div', {
            class: 'mt-3 pt-3 border-t border-surface-border',
          },
            h('div', { class: 'space-y-1' },
              entry.trades.map((trade, i) =>
                h('div', { key: i, class: 'flex justify-between text-xs text-gray-400' },
                  h('span', null, `${trade.symbol} ${trade.action} ${trade.quantity}@${trade.price}`),
                  trade.confidence && h('span', null, `${Math.round(trade.confidence * 100)}%`),
                )
              ),
            ),
            entry.analysis && h('div', { class: 'mt-2 text-xs text-gray-400' },
              h('span', { class: 'font-medium' }, t('history.score', { score: entry.analysis.score })),
              ' \u00B7 ',
              entry.analysis.summary,
            ),
          ),
        )
      ),
    ),
  );
}

function formatDate(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  return d.toLocaleDateString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
