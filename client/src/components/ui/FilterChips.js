import { cn } from '../../lib/cn';

/**
 * FilterChips — horizontal scrollable row of filter buttons.
 *
 * Props:
 *   options: Array<{ value: string, label: string, count?: number }>
 *   value:   string — currently active value
 *   onChange: (value: string) => void
 */
export default function FilterChips({ options = [], value, onChange, className = '' }) {
  return (
    <div className={cn('flex items-center gap-2 overflow-x-auto pb-px', className)} role="group" aria-label="Filtres">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium',
              'transition-colors duration-150 ease-smooth',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
              active
                ? 'bg-primary text-white'
                : 'bg-surface-2 text-text-muted hover:text-text hover:bg-border'
            )}
          >
            {opt.label}
            {opt.count !== undefined && (
              <span className={cn(
                'rounded-full px-1.5 py-0.5 text-xs font-semibold leading-none',
                active ? 'bg-white/25 text-white' : 'bg-border text-text-dim'
              )}>
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
