import { cn } from '../../lib/cn';

/**
 * TableToolbar — search + filter row above a data table.
 *
 * Props:
 *   search:       string — current search value
 *   onSearch:     (value: string) => void
 *   searchPlaceholder: string
 *   actions:      ReactNode — right-side slot (e.g. export button)
 *   children:     ReactNode — left-side filter slot (e.g. FilterChips)
 */
export default function TableToolbar({
  search = '',
  onSearch,
  searchPlaceholder = 'Rechercher…',
  actions,
  children,
  className = '',
}) {
  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between', className)}>
      {/* Left: optional filter chips */}
      {children && <div className="min-w-0 flex-1">{children}</div>}

      {/* Right: search + actions */}
      <div className="flex shrink-0 items-center gap-2">
        {onSearch && (
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-text-dim" aria-hidden="true">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
                <circle cx="7" cy="7" r="4.5" />
                <path d="M10.5 10.5l3 3" strokeLinecap="round" />
              </svg>
            </span>
            <input
              type="search"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className={cn(
                'h-9 w-48 rounded-md border border-border bg-surface pl-9 pr-3 text-sm text-text',
                'placeholder:text-text-dim',
                'transition-colors duration-150 ease-smooth',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                'focus-visible:border-primary/50'
              )}
            />
          </div>
        )}
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
