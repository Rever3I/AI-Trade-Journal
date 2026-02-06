import { h } from 'preact';
import { t } from '@lib/i18n.js';

const TAB_ICONS = {
  smartPaste: '\u{1F4CB}',
  history: '\u{1F4C5}',
  analysis: '\u{1F4CA}',
  settings: '\u{2699}\u{FE0F}',
};

const TAB_KEYS = ['smartPaste', 'history', 'analysis', 'settings'];

export function TabBar({ active, onChange }) {
  return h('nav', {
    class: 'flex border-t border-surface-border bg-surface-card shrink-0',
  },
    TAB_KEYS.map(key =>
      h('button', {
        key,
        class: `flex-1 flex flex-col items-center py-2 px-1 text-xs transition-colors
          ${active === key ? 'text-brand-400' : 'text-gray-500 hover:text-gray-300'}`,
        onClick: () => onChange(key),
      },
        h('span', { class: 'text-base mb-0.5' }, TAB_ICONS[key]),
        h('span', null, t(`tab.${key}`)),
      )
    )
  );
}
