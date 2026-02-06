import { h } from 'preact';
import { t } from '@lib/i18n.js';

export function ErrorMessage({ message, onRetry, retryLabel }) {
  if (!message) return null;

  return h('div', {
    class: 'mt-3 p-3 bg-red-900/30 border border-red-800/50 rounded-lg',
  },
    h('p', { class: 'text-red-300 text-sm' }, message),
    onRetry && h('button', {
      class: 'mt-2 text-red-400 hover:text-red-300 text-xs underline',
      onClick: onRetry,
    }, retryLabel || t('error.retry')),
  );
}
