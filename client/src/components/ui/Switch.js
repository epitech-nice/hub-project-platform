import { useId } from 'react';
import { cn } from '../../lib/cn';

export default function Switch({ label, description, checked, onChange, disabled = false, className = '', ...props }) {
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
      <div className="relative flex-shrink-0 mt-0.5">
        <input
          id={id}
          type="checkbox"
          role="switch"
          aria-checked={checked}
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          className="sr-only peer"
          {...props}
        />
        {/* Track: 44×24 */}
        <span
          className={cn(
            'block h-6 w-11 rounded-full border-2 border-transparent bg-border',
            'transition-colors duration-200 ease-smooth',
            'peer-checked:bg-primary',
            'peer-focus-visible:ring-2 peer-focus-visible:ring-primary/50 peer-focus-visible:ring-offset-1'
          )}
          aria-hidden="true"
        />
        {/* Thumb */}
        <span
          className={cn(
            'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm',
            'transition-transform duration-200 ease-smooth',
            'peer-checked:translate-x-5',
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
