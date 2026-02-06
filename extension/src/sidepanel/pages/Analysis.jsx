import { useState } from 'preact/hooks';
import { t } from '../../lib/i18n.js';

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
 */
export function Analysis({ notionConnected }) {
  const [selectedTemplate, setSelectedTemplate] = useState(null);

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
          >
            {t(tmpl.labelKey)}
          </button>
        ))}
      </div>

      {selectedTemplate && (
        <div class="card text-sm text-text-secondary text-center">
          {t('analysisNoTrades')}
        </div>
      )}
    </div>
  );
}
