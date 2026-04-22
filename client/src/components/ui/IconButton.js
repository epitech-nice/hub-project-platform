import { forwardRef } from 'react';
import { cn } from '../../lib/cn';

const VARIANTS = {
  default: 'bg-surface-2 text-text hover:bg-border',
  ghost: 'bg-transparent text-text-muted hover:bg-surface-2',
  danger: 'bg-transparent text-danger hover:bg-danger/10',
};

const SIZES = {
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-11 w-11',
};

const IconButton = forwardRef(function IconButton(
  { variant = 'default', size = 'md', className = '', children, ...props },
  ref
) {
  if (process.env.NODE_ENV !== 'production' && !props['aria-label']) {
    console.warn('[IconButton] aria-label is required for accessibility.');
  }

  const classes = cn(
    'inline-flex items-center justify-center rounded-md',
    'transition-colors duration-200 ease-smooth',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
    'disabled:opacity-50 disabled:cursor-not-allowed',
    VARIANTS[variant] ?? VARIANTS.default,
    SIZES[size] ?? SIZES.md,
    className
  );

  return (
    <button ref={ref} type="button" className={classes} {...props}>
      {children}
    </button>
  );
});

export default IconButton;
