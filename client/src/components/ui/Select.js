import { forwardRef } from 'react';
import { cn } from '../../lib/cn';

const ChevronDown = () => (
  <svg className="h-4 w-4 pointer-events-none" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const Select = forwardRef(function Select(
  { error = false, className = '', children, ...props },
  ref
) {
  return (
    <div className="relative flex items-center">
      <select
        ref={ref}
        className={cn(
          'h-10 md:h-11 w-full pl-3 pr-9 text-base bg-surface border rounded-md appearance-none',
          'transition-colors duration-200 ease-smooth',
          'focus:outline-none focus:ring-2',
          'disabled:bg-surface-2 disabled:text-text-dim disabled:cursor-not-allowed',
          error
            ? 'border-danger focus:border-danger focus:ring-danger/30'
            : 'border-border focus:border-primary focus:ring-primary/30',
          className
        )}
        style={{ fontSize: '16px' }}
        {...props}
      >
        {children}
      </select>
      <span className="absolute right-3 text-text-dim">
        <ChevronDown />
      </span>
    </div>
  );
});

export default Select;
