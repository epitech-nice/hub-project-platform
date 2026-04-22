import { forwardRef, useCallback } from 'react';
import { cn } from '../../lib/cn';

const Textarea = forwardRef(function Textarea(
  { error = false, autoGrow = false, className = '', onInput, rows = 3, ...props },
  ref
) {
  const handleInput = useCallback(
    (e) => {
      if (autoGrow) {
        e.target.style.height = 'auto';
        e.target.style.height = `${e.target.scrollHeight}px`;
      }
      onInput?.(e);
    },
    [autoGrow, onInput]
  );

  return (
    <textarea
      ref={ref}
      rows={rows}
      onInput={handleInput}
      className={cn(
        'w-full px-3 py-2 text-base bg-surface border rounded-md resize-y',
        'transition-colors duration-200 ease-smooth',
        'placeholder:text-text-dim',
        'focus:outline-none focus:ring-2',
        'disabled:bg-surface-2 disabled:text-text-dim disabled:cursor-not-allowed',
        error
          ? 'border-danger focus:border-danger focus:ring-danger/30'
          : 'border-border focus:border-primary focus:ring-primary/30',
        autoGrow && 'resize-none overflow-hidden',
        className
      )}
      style={{ fontSize: '16px' }}
      {...props}
    />
  );
});

export default Textarea;
