import { h } from 'preact';

export function ScoreBadge({ score, size = 'md' }) {
  let colorClass;
  if (score >= 80) {
    colorClass = 'bg-green-900/40 text-green-400 border-green-700';
  } else if (score >= 60) {
    colorClass = 'bg-yellow-900/40 text-yellow-400 border-yellow-700';
  } else {
    colorClass = 'bg-red-900/40 text-red-400 border-red-700';
  }

  const sizeClass = size === 'lg'
    ? 'w-16 h-16 text-2xl font-bold'
    : 'w-10 h-10 text-sm font-semibold';

  return h('div', {
    class: `${sizeClass} ${colorClass} rounded-full border-2 flex items-center justify-center`,
  }, score);
}
