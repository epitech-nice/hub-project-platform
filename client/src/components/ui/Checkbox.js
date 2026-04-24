import { useId } from 'react';
import { cn } from '../../lib/cn';

export default function Checkbox({ label, description, checked, onChange, disabled = false, className = '', ...props }) {
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
          type="checkbox"
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          className="sr-only peer"
          {...props}
        />
        {/* Visual box — sibling of peer, bg+border respond to checked state */}
        <span
          className={cn(
            'absolute inset-0 rounded border-2 border-border bg-surface',
            'transition-colors duration-150 ease-smooth',
            'peer-checked:bg-primary peer-checked:border-primary',
            'peer-focus-visible:ring-2 peer-focus-visible:ring-primary/50 peer-focus-visible:ring-offset-1'
          )}
          aria-hidden="true"
        />
        {/* Checkmark — sibling of peer, opacity responds to checked state */}
        <svg
          className={cn(
            'absolute inset-0 h-full w-full p-0.5 text-white',
            'opacity-0 peer-checked:opacity-100 transition-opacity duration-150 ease-smooth',
            'pointer-events-none'
          )}
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M2 6l3 3 5-5" />
        </svg>
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
