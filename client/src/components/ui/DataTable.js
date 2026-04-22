import { cn } from '../../lib/cn';

/**
 * DataTable — accessible, sortable data table.
 *
 * Props:
 *   columns: Array<{
 *     key:       string,
 *     label:     string,
 *     sortable?: boolean,
 *     align?:    'left' | 'center' | 'right',
 *     className?: string,
 *     render?:  (value, row) => ReactNode,
 *   }>
 *   rows:       Array<Record<string, any>>
 *   rowKey:     string | ((row) => string) — unique key per row
 *   sortKey:    string | null
 *   sortDir:    'asc' | 'desc'
 *   onSort:     (key: string) => void
 *   onRowClick: (row) => void   — optional row click handler
 *   emptyLabel: string          — shown when rows is empty
 *   loading:    boolean
 *   stickyHeader: boolean
 */
const ALIGN = {
  left:   'text-left',
  center: 'text-center',
  right:  'text-right',
};

function SortIcon({ active, dir }) {
  return (
    <svg viewBox="0 0 12 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3 w-3 shrink-0" aria-hidden="true">
      <path
        d="M6 2v12M3 5l3-3 3 3"
        strokeLinecap="round" strokeLinejoin="round"
        className={cn(active && dir === 'asc' ? 'text-primary' : 'text-text-dim')}
      />
      <path
        d="M3 11l3 3 3-3"
        strokeLinecap="round" strokeLinejoin="round"
        className={cn(active && dir === 'desc' ? 'text-primary' : 'text-text-dim')}
      />
    </svg>
  );
}

function SkeletonRows({ cols }) {
  return Array.from({ length: 5 }, (_, i) => (
    <tr key={i} aria-hidden="true">
      {Array.from({ length: cols }, (_, j) => (
        <td key={j} className="px-4 py-3">
          <div className="h-4 rounded bg-border animate-shimmer" style={{ backgroundSize: '200% 100%', backgroundImage: 'linear-gradient(90deg, rgb(var(--border)) 25%, rgb(var(--surface-2)) 50%, rgb(var(--border)) 75%)' }} />
        </td>
      ))}
    </tr>
  ));
}

export default function DataTable({
  columns = [],
  rows = [],
  rowKey,
  sortKey = null,
  sortDir = 'asc',
  onSort,
  onRowClick,
  emptyLabel = 'Aucune donnée',
  loading = false,
  stickyHeader = false,
  className = '',
}) {
  const getKey = typeof rowKey === 'function'
    ? rowKey
    : (row) => row[rowKey];

  return (
    <div className={cn('w-full overflow-x-auto rounded-xl border border-border', className)}>
      <table className="w-full border-collapse text-sm" role="grid">
        <thead className={cn(
          'bg-surface-2',
          stickyHeader && 'sticky top-0 z-10'
        )}>
          <tr>
            {columns.map((col) => {
              const isActive = sortKey === col.key;
              return (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={col.sortable && isActive ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                  className={cn(
                    'px-4 py-3 text-xs font-semibold uppercase tracking-snug text-text-dim',
                    ALIGN[col.align ?? 'left'],
                    col.sortable && 'cursor-pointer select-none hover:text-text transition-colors duration-100',
                    isActive && 'text-text',
                    col.className
                  )}
                  onClick={col.sortable && onSort ? () => onSort(col.key) : undefined}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {col.label}
                    {col.sortable && <SortIcon active={isActive} dir={sortDir} />}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody className="divide-y divide-border bg-surface">
          {loading ? (
            <SkeletonRows cols={columns.length} />
          ) : rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-12 text-center text-sm text-text-dim"
              >
                {emptyLabel}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={getKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick(row); } } : undefined}
                role={onRowClick ? 'button' : undefined}
                className={cn(
                  'transition-colors duration-100',
                  onRowClick && 'cursor-pointer hover:bg-surface-2 focus-visible:outline-none focus-visible:bg-surface-2'
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      'px-4 py-3 text-text',
                      ALIGN[col.align ?? 'left'],
                      col.className
                    )}
                  >
                    {col.render ? col.render(row[col.key], row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
