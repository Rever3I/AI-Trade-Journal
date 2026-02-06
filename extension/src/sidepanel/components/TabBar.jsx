import { t } from '../../lib/i18n.js';

/**
 * Tab navigation bar component.
 * @param {Object} props
 * @param {Array<{id: string, labelKey: string}>} props.tabs
 * @param {string} props.activeTab
 * @param {function} props.onTabChange
 */
export function TabBar({ tabs, activeTab, onTabChange }) {
  return (
    <nav class="flex border-b border-text-muted/10">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          class={`flex-1 py-2.5 text-sm font-medium transition-colors duration-200 border-b-2 ${
            activeTab === tab.id
              ? 'text-accent border-accent'
              : 'text-text-secondary border-transparent hover:text-text-primary hover:border-text-muted/30'
          }`}
          onClick={() => onTabChange(tab.id)}
        >
          {t(tab.labelKey)}
        </button>
      ))}
    </nav>
  );
}
