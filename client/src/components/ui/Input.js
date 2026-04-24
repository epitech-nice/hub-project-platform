import { forwardRef } from 'react';
import { cn } from '../../lib/cn';

const Input = forwardRef(function Input(
  { error = false, leadingIcon, trailingIcon, className = '', style, ...props },
  ref
) {
  const base = cn(
    'h-10 md:h-11 w-full px-3 text-base bg-surface border rounded-md',
    'transition-colors duration-200 ease-smooth',
    'placeholder:text-text-dim',
    'focus:outline-none focus:ring-2',
    'disabled:bg-surface-2 disabled:text-text-dim disabled:cursor-not-allowed',
    error
      ? 'border-danger focus:border-danger focus:ring-danger/30'
      : 'border-border focus:border-primary focus:ring-primary/30'
  );

  const hasIcon = leadingIcon || trailingIcon;

  if (!hasIcon) {
    return (
      <input
        ref={ref}
        className={cn(base, className)}
        style={{ fontSize: '16px', ...style }}
        {...props}
      />
    );
  }

  return (
    <div className="relative flex items-center">
      {leadingIcon && (
        <span className="absolute left-3 text-text-dim pointer-events-none">{leadingIcon}</span>
      )}
      <input
        ref={ref}
        className={cn(base, leadingIcon && 'pl-9', trailingIcon && 'pr-9', className)}
        style={{ fontSize: '16px', ...style }}
        {...props}
      />
      {trailingIcon && (
        <span className="absolute right-3 text-text-dim pointer-events-none">{trailingIcon}</span>
      )}
    </div>
  );
});

export default Input;
