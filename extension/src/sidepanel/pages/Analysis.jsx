import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { t } from '@lib/i18n.js';
import { analyzeTrades } from '@lib/api.js';
import { saveAnalysis } from '@lib/notion.js';
import { getParsedTrades, getUsageToday, incrementUsage, getNotionConnection } from '@lib/storage.js';
import { ErrorMessage } from '@components/ErrorMessage.jsx';
import { LoadingButton } from '@components/LoadingButton.jsx';
import { ScoreBadge } from '@components/ScoreBadge.jsx';

const TEMPLATES = [
  'daily_review',
  'single_trade',
  'weekly_stats',
  'strategy_eval',
  'emotion_check',
  'risk_assessment',
];

const SEVERITY_STYLES = {
  info: 'bg-blue-900/30 border-blue-800/50 text-blue-300',
  warning: 'bg-yellow-900/30 border-yellow-800/50 text-yellow-300',
  critical: 'bg-red-900/30 border-red-800/50 text-red-300',
};

const CATEGORY_ICONS = {
  execution: '\u{1F3AF}',
  risk: '\u{1F6E1}\u{FE0F}',
  pattern: '\u{1F4C8}',
  emotion: '\u{1F9E0}',
  improvement: '\u{1F4A1}',
};

export function Analysis() {
  const [trades, setTrades] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState('daily_review');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [usage, setUsage] = useState(0);

  useEffect(() => {
    async function loadTrades() {
      const parsed = await getParsedTrades();
      setTrades(parsed);
      const used = await getUsageToday();
      setUsage(used);
    }
    loadTrades();
  }, []);

  async function handleAnalyze() {
    if (trades.length === 0) return;
    setError(null);
    setResult(null);
    setSaved(false);
    setLoading(true);
    try {
      const analysis = await analyzeTrades(trades, selectedTemplate);
      if (analysis.error) {
        setError(analysis.message || t('error.analysisFailed'));
        return;
      }
      setResult(analysis);
      const newUsage = await incrementUsage();
      setUsage(newUsage);
    } catch (err) {
      setError(err.message || t('error.analysisFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveToNotion() {
    if (!result) return;
    setSaveLoading(true);
    try {
      const conn = await getNotionConnection();
      if (!conn.databaseId) {
        setError(t('error.notionDisconnected'));
        return;
      }
      await saveAnalysis(null, result);
      setSaved(true);
    } catch (err) {
      setError(err.message || t('error.syncFailed'));
    } finally {
      setSaveLoading(false);
    }
  }

  if (trades.length === 0) {
    return h('div', { class: 'p-4' },
      h('h2', { class: 'text-lg font-semibold mb-4' }, t('analysis.title')),
      h('div', { class: 'card text-center py-8' },
        h('p', { class: 'text-gray-400' }, t('analysis.noTrades')),
      ),
    );
  }

  return h('div', { class: 'p-4' },
    h('h2', { class: 'text-lg font-semibold mb-4' }, t('analysis.title')),

    // Usage indicator
    h('div', { class: 'mb-4' },
      h('div', { class: 'flex justify-between text-xs text-gray-400 mb-1' },
        h('span', null, t('settings.license.usage', { used: usage, limit: 10 })),
      ),
      h('div', { class: 'h-1.5 bg-surface-border rounded-full overflow-hidden' },
        h('div', {
          class: `h-full rounded-full transition-all ${usage >= 10 ? 'bg-red-500' : usage >= 7 ? 'bg-yellow-500' : 'bg-brand-500'}`,
          style: { width: `${Math.min((usage / 10) * 100, 100)}%` },
        }),
      ),
    ),

    // Template selector
    h('div', { class: 'mb-4' },
      h('label', { class: 'text-sm text-gray-400 mb-2 block' }, t('analysis.selectTemplate')),
      h('div', { class: 'grid grid-cols-2 gap-2' },
        TEMPLATES.map(tmpl =>
          h('button', {
            key: tmpl,
            class: `text-left p-2 rounded-lg border text-sm transition-colors ${
              selectedTemplate === tmpl
                ? 'border-brand-500 bg-brand-500/10 text-brand-400'
                : 'border-surface-border bg-surface-card text-gray-300 hover:bg-surface-hover'
            }`,
            onClick: () => setSelectedTemplate(tmpl),
          }, t(`analysis.templates.${tmpl}`))
        ),
      ),
    ),

    error && h(ErrorMessage, { message: error, onRetry: () => setError(null) }),

    // Analyze button
    !result && h(LoadingButton, {
      loading,
      class: 'btn-primary w-full mb-4',
      onClick: handleAnalyze,
      disabled: usage >= 10,
    }, loading ? t('analysis.analyzing') : t('analysis.analyze')),

    // Results
    result && h('div', { class: 'space-y-4' },
      // Score + Summary
      h('div', { class: 'card flex items-center gap-4' },
        h(ScoreBadge, { score: result.score, size: 'lg' }),
        h('div', { class: 'flex-1' },
          h('div', { class: 'text-xs text-gray-400 mb-1' }, t('analysis.score')),
          h('p', { class: 'text-sm text-gray-200' }, result.summary),
        ),
      ),

      // Metrics grid
      result.metrics && h('div', { class: 'card' },
        h('h3', { class: 'text-sm font-medium text-gray-300 mb-3' }, t('analysis.metrics')),
        h('div', { class: 'grid grid-cols-3 gap-3' },
          result.metrics.win_rate != null && h(MetricCell, {
            label: t('analysis.metrics.winRate'),
            value: `${Math.round(result.metrics.win_rate * 100)}%`,
          }),
          result.metrics.avg_r_multiple != null && h(MetricCell, {
            label: t('analysis.metrics.rMultiple'),
            value: result.metrics.avg_r_multiple.toFixed(1),
          }),
          result.metrics.profit_factor != null && h(MetricCell, {
            label: t('analysis.metrics.profitFactor'),
            value: result.metrics.profit_factor.toFixed(1),
          }),
          result.metrics.total_trades != null && h(MetricCell, {
            label: t('analysis.metrics.totalTrades'),
            value: result.metrics.total_trades,
          }),
          result.metrics.total_pnl != null && h(MetricCell, {
            label: t('analysis.metrics.totalPnl'),
            value: `$${result.metrics.total_pnl.toFixed(0)}`,
            positive: result.metrics.total_pnl >= 0,
          }),
          result.metrics.avg_hold_time_minutes != null && h(MetricCell, {
            label: t('analysis.metrics.avgHoldTime'),
            value: `${result.metrics.avg_hold_time_minutes}min`,
          }),
        ),
      ),

      // Insights
      result.insights && result.insights.length > 0 && h('div', { class: 'card' },
        h('h3', { class: 'text-sm font-medium text-gray-300 mb-3' }, t('analysis.insights')),
        h('div', { class: 'space-y-2' },
          result.insights.map((insight, i) =>
            h('div', {
              key: i,
              class: `p-2 rounded-lg border text-sm ${SEVERITY_STYLES[insight.severity] || SEVERITY_STYLES.info}`,
            },
              h('span', { class: 'font-medium text-xs mr-2' },
                `${CATEGORY_ICONS[insight.category] || ''} ${t(`analysis.category.${insight.category}`) || insight.category}`
              ),
              insight.text,
            )
          ),
        ),
      ),

      // Action items
      result.action_items && result.action_items.length > 0 && h('div', { class: 'card' },
        h('h3', { class: 'text-sm font-medium text-gray-300 mb-3' }, t('analysis.actionItems')),
        h('ul', { class: 'space-y-2' },
          result.action_items.map((item, i) =>
            h('li', { key: i, class: 'flex items-start gap-2 text-sm text-gray-300' },
              h('input', { type: 'checkbox', class: 'mt-1 accent-brand-500' }),
              h('span', null, item),
            )
          ),
        ),
      ),

      // Actions
      h('div', { class: 'flex gap-2' },
        h(LoadingButton, {
          loading: saveLoading,
          class: 'btn-primary flex-1',
          onClick: handleSaveToNotion,
          disabled: saved,
        }, saved ? t('analysis.saved') : saveLoading ? t('analysis.saving') : t('analysis.saveToNotion')),
        h('button', {
          class: 'btn-secondary',
          onClick: () => { setResult(null); setSaved(false); },
        }, t('analysis.reanalyze')),
      ),
    ),
  );
}

function MetricCell({ label, value, positive }) {
  const valueColor = positive === true ? 'text-green-400' :
    positive === false ? 'text-red-400' : 'text-gray-100';

  return h('div', { class: 'text-center' },
    h('div', { class: 'text-xs text-gray-500 mb-1' }, label),
    h('div', { class: `text-sm font-semibold ${valueColor}` }, value),
  );
}
