import { useId } from 'react';
import { cn } from '../../lib/cn';

export default function Radio({ label, description, checked, onChange, disabled = false, className = '', ...props }) {
  const id = useId();

  return (
    <label
      htmlFor={id}
      className={cn(
        'flex items-start gap-3 py-1 cursor-pointer min-h-[44px]',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
    >
      <div className="relative flex-shrink-0 mt-0.5 h-5 w-5">
        <input
          id={id}
          type="radio"
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          className="sr-only peer"
          {...props}
        />
        {/* Outer ring */}
        <span
          className={cn(
            'absolute inset-0 rounded-full border-2 border-border bg-surface',
            'transition-colors duration-150',
            'peer-checked:border-primary',
            'peer-focus-visible:ring-2 peer-focus-visible:ring-primary/50 peer-focus-visible:ring-offset-1'
          )}
          aria-hidden="true"
        />
        {/* Inner dot */}
        <span
          className={cn(
            'absolute inset-[4px] rounded-full bg-primary',
            'opacity-0 peer-checked:opacity-100 transition-opacity duration-150',
            'pointer-events-none'
          )}
          aria-hidden="true"
        />
      </div>
      {(label || description) && (
        <div>
          {label && <div className="text-base font-medium leading-tight">{label}</div>}
          {description && <div className="text-sm text-text-muted mt-0.5">{description}</div>}
        </div>
      )}
    </label>
  );
}
