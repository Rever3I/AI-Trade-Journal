import { h } from 'preact';

export function ConfidenceBadge({ value }) {
  let colorClass;
  if (value >= 0.9) {
    colorClass = 'bg-green-900/40 text-green-400 border-green-800/50';
  } else if (value >= 0.7) {
    colorClass = 'bg-yellow-900/40 text-yellow-400 border-yellow-800/50';
  } else {
    colorClass = 'bg-red-900/40 text-red-400 border-red-800/50';
  }

  return h('span', {
    class: `badge border ${colorClass}`,
  }, `${Math.round(value * 100)}%`);
}
