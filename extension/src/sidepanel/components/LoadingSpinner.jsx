/**
 * Loading spinner component with optional message.
 * @param {Object} props
 * @param {string} [props.message] - Loading message to display
 * @param {string} [props.size='md'] - Size variant: 'sm', 'md', 'lg'
 */
export function LoadingSpinner({ message, size = 'md' }) {
  const sizeClasses = {
    sm: 'h-4 w-4 border',
    md: 'h-6 w-6 border-2',
    lg: 'h-8 w-8 border-2',
  };

  return (
    <div class="flex flex-col items-center justify-center gap-2 py-4">
      <div
        class={`animate-spin rounded-full border-accent border-t-transparent ${sizeClasses[size] || sizeClasses.md}`}
      />
      {message && (
        <span class="text-sm text-text-secondary">{message}</span>
      )}
    </div>
  );
}
