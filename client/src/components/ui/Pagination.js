import { cn } from '../../lib/cn';

const ChevronLeft = () => (
  <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="M10 4L6 8l4 4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ChevronRight = () => (
  <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const NAV_BUTTON = cn(
  'flex h-9 w-9 items-center justify-center rounded-md border border-border',
  'text-text-muted hover:bg-surface-2 hover:text-text',
  'transition-colors duration-150 ease-smooth',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
  'disabled:opacity-40 disabled:cursor-not-allowed'
);

export default function Pagination({ page = 1, totalPages = 1, onChange, className = '' }) {
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  return (
    <nav
      aria-label="Pagination"
      className={cn('flex items-center gap-2', className)}
    >
      <button
        type="button"
        onClick={() => onChange?.(page - 1)}
        disabled={!hasPrev}
        aria-label="Page précédente"
        className={NAV_BUTTON}
      >
        <ChevronLeft />
      </button>

      <span className="text-sm text-text-muted hidden sm:inline">
        Page <span className="font-medium text-text">{page}</span> sur {totalPages}
      </span>
      <span className="text-sm text-text-muted sm:hidden">
        {page}/{totalPages}
      </span>

      <button
        type="button"
        onClick={() => onChange?.(page + 1)}
        disabled={!hasNext}
        aria-label="Page suivante"
        className={NAV_BUTTON}
      >
        <ChevronRight />
      </button>
    </nav>
  );
}
