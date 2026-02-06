import { h } from 'preact';

export function LoadingButton({ loading, children, class: className, ...props }) {
  return h('button', {
    class: className || 'btn-primary',
    disabled: loading || props.disabled,
    ...props,
  },
    loading && h('span', { class: 'inline-block w-4 h-4 mr-2 border-2 border-white/30 border-t-white rounded-full animate-spin' }),
    children,
  );
}
