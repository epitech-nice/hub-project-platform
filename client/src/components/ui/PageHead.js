import { cn } from '../../lib/cn';

/**
 * PageHead — page title + optional subtitle + right-side actions slot.
 *
 * Props:
 *   title:    string (required)
 *   sub:      string (optional)
 *   back:     ReactNode — back link/button rendered before the title
 *   actions:  ReactNode — right-side slot
 *   border:   boolean — show bottom border (default: false)
 */
export default function PageHead({ title, sub, back, actions, border = false, className = '' }) {
  return (
    <div className={cn(
      'flex flex-col gap-4 py-6 sm:flex-row sm:items-start sm:justify-between',
      border && 'border-b border-border pb-6',
      className
    )}>
      <div className="min-w-0">
        {back && <div className="mb-2">{back}</div>}
        <h1 className="text-2xl font-bold tracking-tight text-text truncate">{title}</h1>
        {sub && <p className="mt-1 text-sm text-text-muted">{sub}</p>}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
