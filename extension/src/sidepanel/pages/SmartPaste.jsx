import { h } from 'preact';
import { useState } from 'preact/hooks';
import { t } from '@lib/i18n.js';
import { parseTrades } from '@lib/api.js';
import { syncTrades } from '@lib/notion.js';
import { saveParsedTrades, addSyncHistoryEntry, getNotionConnection } from '@lib/storage.js';
import { ErrorMessage } from '@components/ErrorMessage.jsx';
import { LoadingButton } from '@components/LoadingButton.jsx';
import { ConfidenceBadge } from '@components/ConfidenceBadge.jsx';

export function SmartPaste() {
  const [rawText, setRawText] = useState('');
  const [trades, setTrades] = useState(null);
  const [meta, setMeta] = useState(null);
  const [editingIdx, setEditingIdx] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [parseLoading, setParseLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncProgress, setSyncProgress] = useState(null);
  const [syncDone, setSyncDone] = useState(false);
  const [notionUrl, setNotionUrl] = useState(null);
  const [error, setError] = useState(null);

  const charCount = rawText.length;
  const lineCount = rawText ? rawText.split('\n').length : 0;

  async function handleParse() {
    if (!rawText.trim()) return;
    setError(null);
    setParseLoading(true);
    setSyncDone(false);
    try {
      const result = await parseTrades(rawText);
      if (result.error) {
        setError(result.message || t('error.parseFailed'));
        return;
      }
      setTrades(result.trades || []);
      setMeta(result.meta || null);
      await saveParsedTrades(result.trades || []);
    } catch (err) {
      setError(err.message || t('error.parseFailed'));
    } finally {
      setParseLoading(false);
    }
  }

  async function handleSync() {
    if (!trades || trades.length === 0) return;
    setError(null);
    setSyncLoading(true);
    setSyncProgress({ current: 0, total: trades.length });
    try {
      const conn = await getNotionConnection();
      if (!conn.databaseId) {
        setError(t('error.notionDisconnected'));
        return;
      }
      const result = await syncTrades(trades, (current, total) => {
        setSyncProgress({ current, total });
      });
      setSyncDone(true);
      setNotionUrl(conn.databaseUrl);
      await addSyncHistoryEntry({
        tradeCount: trades.length,
        symbols: [...new Set(trades.map(tr => tr.symbol))],
        status: 'synced',
      });
    } catch (err) {
      setError(err.message || t('error.syncFailed'));
    } finally {
      setSyncLoading(false);
      setSyncProgress(null);
    }
  }

  function handleClear() {
    setRawText('');
    setTrades(null);
    setMeta(null);
    setError(null);
    setSyncDone(false);
    setNotionUrl(null);
  }

  function startEdit(idx) {
    setEditingIdx(idx);
    setEditForm({ ...trades[idx] });
  }

  function saveEdit() {
    if (editingIdx === null) return;
    const updated = [...trades];
    updated[editingIdx] = {
      ...editForm,
      quantity: Number(editForm.quantity),
      price: Number(editForm.price),
      commission: Number(editForm.commission || 0),
    };
    setTrades(updated);
    setEditingIdx(null);
    setEditForm({});
  }

  function cancelEdit() {
    setEditingIdx(null);
    setEditForm({});
  }

  // Empty state
  if (!trades && !parseLoading) {
    return h('div', { class: 'p-4' },
      h('h2', { class: 'text-lg font-semibold mb-4' }, t('smartPaste.title')),

      h('div', { class: 'relative' },
        h('textarea', {
          class: 'input-field h-48 resize-none text-sm font-mono',
          placeholder: t('smartPaste.placeholder'),
          value: rawText,
          onInput: (e) => setRawText(e.target.value),
        }),
        rawText.length > 0 && h('div', {
          class: 'absolute bottom-2 right-3 text-gray-500 text-xs',
        }, t('smartPaste.charCount', { count: charCount, lines: lineCount })),
      ),

      error && h(ErrorMessage, { message: error, onRetry: () => setError(null) }),

      h('div', { class: 'flex gap-2 mt-3' },
        h(LoadingButton, {
          loading: parseLoading,
          class: 'btn-primary flex-1',
          onClick: handleParse,
          disabled: !rawText.trim(),
        }, parseLoading ? t('smartPaste.parsing') : t('smartPaste.parse')),
        rawText && h('button', {
          class: 'btn-secondary',
          onClick: handleClear,
        }, t('smartPaste.clear')),
      ),

      // Example hint
      !rawText && h('div', { class: 'mt-6 card' },
        h('p', { class: 'text-gray-500 text-xs mb-2' }, t('smartPaste.empty.title')),
        h('pre', { class: 'text-gray-600 text-xs whitespace-pre-wrap font-mono' },
          t('smartPaste.empty.example')
        ),
      ),
    );
  }

  // Parse results / preview
  return h('div', { class: 'p-4' },
    h('h2', { class: 'text-lg font-semibold mb-1' }, t('smartPaste.preview.title')),
    meta && h('p', { class: 'text-gray-400 text-sm mb-4' },
      t('smartPaste.preview.tradeCount', { count: trades.length }),
      meta.skipped_rows > 0 && ` ${t('smartPaste.preview.skippedRows', { count: meta.skipped_rows })}`,
    ),

    error && h(ErrorMessage, { message: error, onRetry: () => setError(null) }),

    // Sync success banner
    syncDone && h('div', { class: 'mb-4 p-3 bg-green-900/30 border border-green-800/50 rounded-lg' },
      h('p', { class: 'text-green-400 font-medium text-sm' }, t('smartPaste.syncSuccess')),
      notionUrl && h('a', {
        href: notionUrl,
        target: '_blank',
        class: 'text-brand-400 hover:text-brand-300 text-sm mt-1 inline-block',
      }, t('smartPaste.viewInNotion')),
    ),

    // Trade list
    h('div', { class: 'space-y-2 mb-4 max-h-[60vh] overflow-y-auto' },
      trades && trades.map((trade, idx) =>
        editingIdx === idx
          ? h(TradeEditRow, {
              key: idx,
              form: editForm,
              onChange: setEditForm,
              onSave: saveEdit,
              onCancel: cancelEdit,
            })
          : h(TradeRow, {
              key: idx,
              trade,
              onEdit: () => startEdit(idx),
            })
      ),
    ),

    // Actions
    h('div', { class: 'flex gap-2' },
      !syncDone && h(LoadingButton, {
        loading: syncLoading,
        class: 'btn-primary flex-1',
        onClick: handleSync,
        disabled: !trades || trades.length === 0,
      },
        syncLoading && syncProgress
          ? t('smartPaste.syncing', syncProgress)
          : t('smartPaste.sync')
      ),
      h('button', {
        class: 'btn-secondary',
        onClick: handleClear,
      }, t('smartPaste.clear')),
    ),
  );
}

function TradeRow({ trade, onEdit }) {
  const pnlColor = trade.action === 'BUY' || trade.action === 'SHORT'
    ? 'text-gray-300'
    : 'text-gray-300';

  return h('div', { class: 'card flex items-center gap-3 p-3' },
    h('div', { class: 'flex-1 min-w-0' },
      h('div', { class: 'flex items-center gap-2' },
        h('span', { class: 'font-semibold text-sm' }, trade.symbol),
        h('span', {
          class: `badge text-xs ${
            trade.action === 'BUY' ? 'bg-green-900/40 text-green-400' :
            trade.action === 'SELL' ? 'bg-red-900/40 text-red-400' :
            trade.action === 'SHORT' ? 'bg-orange-900/40 text-orange-400' :
            'bg-blue-900/40 text-blue-400'
          }`,
        }, trade.action),
        trade.is_option && h('span', { class: 'badge bg-purple-900/40 text-purple-400 text-xs' }, t('smartPaste.preview.option')),
      ),
      h('div', { class: 'text-gray-400 text-xs mt-1' },
        `${trade.quantity} @ $${trade.price}`,
        trade.datetime && ` \u00B7 ${new Date(trade.datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      ),
    ),
    h(ConfidenceBadge, { value: trade.confidence }),
    h('button', {
      class: 'text-gray-500 hover:text-gray-300 text-xs',
      onClick: onEdit,
    }, t('smartPaste.preview.edit')),
  );
}

function TradeEditRow({ form, onChange, onSave, onCancel }) {
  function update(field, value) {
    onChange({ ...form, [field]: value });
  }

  return h('div', { class: 'card p-3 space-y-2 border-brand-500/50' },
    h('div', { class: 'grid grid-cols-2 gap-2' },
      h('input', {
        class: 'input-field text-sm',
        value: form.symbol,
        onInput: (e) => update('symbol', e.target.value),
        placeholder: t('smartPaste.preview.symbolPlaceholder'),
      }),
      h('select', {
        class: 'input-field text-sm',
        value: form.action,
        onChange: (e) => update('action', e.target.value),
      },
        ['BUY', 'SELL', 'SHORT', 'COVER'].map(a =>
          h('option', { key: a, value: a }, a)
        )
      ),
      h('input', {
        class: 'input-field text-sm',
        type: 'number',
        value: form.quantity,
        onInput: (e) => update('quantity', e.target.value),
        placeholder: t('smartPaste.preview.qtyPlaceholder'),
      }),
      h('input', {
        class: 'input-field text-sm',
        type: 'number',
        step: '0.01',
        value: form.price,
        onInput: (e) => update('price', e.target.value),
        placeholder: t('smartPaste.preview.pricePlaceholder'),
      }),
    ),
    h('div', { class: 'flex gap-2 justify-end' },
      h('button', { class: 'btn-secondary text-xs py-1 px-3', onClick: onCancel },
        t('smartPaste.preview.cancel')
      ),
      h('button', { class: 'btn-primary text-xs py-1 px-3', onClick: onSave },
        t('smartPaste.preview.save')
      ),
    ),
  );
}
