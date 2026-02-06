import { useState } from 'preact/hooks';
import { t } from '../../lib/i18n.js';
import { LoadingSpinner } from '../components/LoadingSpinner.jsx';

const TEMPLATES = [
  { id: 'daily_review', labelKey: 'analysisDailyReview' },
  { id: 'single_trade', labelKey: 'analysisSingleTrade' },
  { id: 'weekly_stats', labelKey: 'analysisWeeklyStats' },
  { id: 'strategy_eval', labelKey: 'analysisStrategyEval' },
  { id: 'emotion_check', labelKey: 'analysisEmotionCheck' },
  { id: 'risk_assessment', labelKey: 'analysisRiskAssessment' },
];

/**
 * Analysis page — trigger AI review on demand with preset templates.
 * @param {Object} props
 * @param {boolean} props.notionConnected
 * @param {Array} props.recentTrades
 */
export function Analysis({ notionConnected, recentTrades }) {
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');

  const hasTrades = recentTrades && recentTrades.length > 0;

  async function handleAnalyze() {
    if (!selectedTemplate || !hasTrades) {
      return;
    }

    setError('');
    setAnalysisResult(null);
    setSaveStatus('');
    setAnalyzing(true);

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'ANALYZE_TRADES',
        payload: { analysisType: selectedTemplate },
      });

      if (response.error) {
        if (response.error === 'RATE_LIMITED') {
          setError(response.message === 'MONTHLY_LIMIT_REACHED'
            ? t('rateLimitMonthly')
            : t('rateLimitDaily'));
        } else {
          setError(t('analysisError'));
        }
        return;
      }

      if (response.analysis) {
        setAnalysisResult(response.analysis);
      } else {
        setError(t('analysisError'));
      }
    } catch {
      setError(t('networkError'));
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleSaveToNotion(pageId) {
    if (!analysisResult || !pageId) {
      return;
    }

    setSaving(true);
    setSaveStatus('');

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'SAVE_ANALYSIS',
        payload: { pageId, analysis: analysisResult },
      });

      if (response.error) {
        setSaveStatus('error');
      } else {
        setSaveStatus('saved');
      }
    } catch {
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div class="flex flex-col gap-4">
      <h2 class="text-sm font-medium text-text-secondary">
        {t('analysisSelectTemplate')}
      </h2>

      <div class="grid grid-cols-2 gap-2">
        {TEMPLATES.map((tmpl) => (
          <button
            key={tmpl.id}
            type="button"
            class={`card text-left text-sm transition-colors cursor-pointer ${
              selectedTemplate === tmpl.id
                ? 'border-accent/50 bg-accent/10 text-accent'
                : 'hover:border-text-muted/30 text-text-primary'
            }`}
            onClick={() => setSelectedTemplate(tmpl.id)}
            disabled={analyzing}
          >
            {t(tmpl.labelKey)}
          </button>
        ))}
      </div>

      {selectedTemplate && !hasTrades && (
        <div class="card text-sm text-text-secondary text-center">
          {t('analysisNoTrades')}
        </div>
      )}

      {selectedTemplate && hasTrades && (
        <div class="flex flex-col gap-3">
          <div class="text-xs text-text-muted">
            {t('analysisTradeCount', [String(recentTrades.length)])}
          </div>
          <button
            type="button"
            class="btn-primary w-full"
            onClick={handleAnalyze}
            disabled={analyzing}
          >
            {analyzing ? t('analysisLoading') : t('analysisRunButton')}
          </button>
        </div>
      )}

      {analyzing && <LoadingSpinner message={t('analysisLoading')} />}

      {error && (
        <div class="card border-loss/30 bg-loss/10 text-loss text-sm">
          {error}
        </div>
      )}

      {analysisResult && (
        <AnalysisResultDisplay
          result={analysisResult}
          notionConnected={notionConnected}
          saving={saving}
          saveStatus={saveStatus}
          onSave={handleSaveToNotion}
        />
      )}
    </div>
  );
}

/**
 * Display analysis results with metrics, insights, and action items.
 */
function AnalysisResultDisplay({ result, notionConnected, saving, saveStatus, onSave }) {
  return (
    <div class="flex flex-col gap-3">
      {/* Header: score + summary */}
      <div class="card flex items-start gap-3">
        {result.score !== undefined && (
          <div class="flex flex-col items-center min-w-[48px]">
            <span class={`text-2xl font-bold ${scoreColor(result.score)}`}>
              {result.score}
            </span>
            <span class="text-xs text-text-muted">{t('analysisScore')}</span>
          </div>
        )}
        <div class="flex-1">
          <h3 class="text-sm font-medium text-text-primary mb-1">
            {t('analysisComplete')}
          </h3>
          {result.summary && (
            <p class="text-sm text-text-secondary">{result.summary}</p>
          )}
        </div>
      </div>

      {/* Metrics */}
      {result.metrics && (
        <div class="card">
          <h4 class="text-xs font-medium text-text-muted mb-2">
            {t('analysisMetrics')}
          </h4>
          <div class="grid grid-cols-3 gap-2 text-center">
            {result.metrics.win_rate !== undefined && (
              <MetricItem
                label={t('analysisWinRate')}
                value={`${(result.metrics.win_rate * 100).toFixed(0)}%`}
              />
            )}
            {result.metrics.profit_factor !== undefined && (
              <MetricItem
                label={t('analysisProfitFactor')}
                value={result.metrics.profit_factor.toFixed(1)}
              />
            )}
            {result.metrics.total_pnl !== undefined && (
              <MetricItem
                label={t('analysisTotalPnl')}
                value={`${result.metrics.total_pnl >= 0 ? '+' : ''}${result.metrics.total_pnl.toFixed(2)}`}
                color={result.metrics.total_pnl >= 0 ? 'text-profit' : 'text-loss'}
              />
            )}
          </div>
        </div>
      )}

      {/* Insights */}
      {result.insights && result.insights.length > 0 && (
        <div class="card">
          <h4 class="text-xs font-medium text-text-muted mb-2">
            {t('analysisInsights')}
          </h4>
          <div class="flex flex-col gap-1.5">
            {result.insights.map((insight, i) => (
              <InsightItem key={i} insight={insight} />
            ))}
          </div>
        </div>
      )}

      {/* Action Items */}
      {result.action_items && result.action_items.length > 0 && (
        <div class="card">
          <h4 class="text-xs font-medium text-text-muted mb-2">
            {t('analysisActionItems')}
          </h4>
          <ul class="flex flex-col gap-1 text-sm text-text-primary">
            {result.action_items.map((item, i) => (
              <li key={i} class="flex gap-2">
                <span class="text-accent shrink-0">*</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Save to Notion (optional) */}
      {notionConnected && (
        <div class="flex items-center gap-2">
          {saveStatus === 'saved' ? (
            <span class="text-sm text-profit">{t('analysisSaved')}</span>
          ) : saveStatus === 'error' ? (
            <span class="text-sm text-loss">{t('analysisSaveFailed')}</span>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** Single metric display */
function MetricItem({ label, value, color = 'text-text-primary' }) {
  return (
    <div class="flex flex-col">
      <span class={`text-lg font-semibold ${color}`}>{value}</span>
      <span class="text-xs text-text-muted">{label}</span>
    </div>
  );
}

/** Single insight display with severity badge */
function InsightItem({ insight }) {
  const severityStyles = {
    critical: 'bg-loss/10 text-loss border-loss/20',
    warning: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    info: 'bg-accent/10 text-accent border-accent/20',
  };
  const severityLabels = {
    critical: t('insightCritical'),
    warning: t('insightWarning'),
    info: t('insightInfo'),
  };

  const style = severityStyles[insight.severity] || severityStyles.info;
  const label = severityLabels[insight.severity] || severityLabels.info;

  return (
    <div class={`rounded px-2 py-1.5 text-sm border ${style}`}>
      <span class="text-xs font-medium opacity-70 mr-1">[{label}]</span>
      {insight.text}
    </div>
  );
}

/** Get color class based on score value */
function scoreColor(score) {
  if (score >= 80) return 'text-profit';
  if (score >= 50) return 'text-yellow-400';
  return 'text-loss';
}
