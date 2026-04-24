import { cn } from '../../lib/cn';

/**
 * CreditChip — displays a credit value in a styled pill.
 *
 * Props:
 *   value:   number | null — credit amount (e.g. 0, 0.5, 1, 1.5, 2…)
 *   max:     number | null — max credits for the cycle (optional, shows "/max")
 *   size:    'sm' | 'md'
 */
export default function CreditChip({ value, max, size = 'md', className = '' }) {
  const hasValue = value !== null && value !== undefined;

  const color = !hasValue
    ? 'bg-surface-2 text-text-dim'
    : value === 0
      ? 'bg-status-rejected-bg text-status-rejected-text'
      : value >= 1
        ? 'bg-status-approved-bg text-status-approved-text'
        : 'bg-status-pending-bg text-status-pending-text';

  const sizeClass = size === 'sm'
    ? 'px-2 py-0.5 text-xs'
    : 'px-2.5 py-0.5 text-xs';

  return (
    <span
      className={cn('inline-flex items-center gap-0.5 rounded-full font-semibold', sizeClass, className)}
      style={{
        backgroundColor: `rgb(var(--status-${!hasValue ? 'neutral' : value === 0 ? 'rejected' : value >= 1 ? 'approved' : 'pending'}-bg))`,
        color: `rgb(var(--status-${!hasValue ? 'neutral' : value === 0 ? 'rejected' : value >= 1 ? 'approved' : 'pending'}-text))`,
      }}
      aria-label={hasValue ? `${value}${max ? `/${max}` : ''} crédit${value > 1 ? 's' : ''}` : 'Crédits non définis'}
    >
      {hasValue ? value : '—'}
      {max !== undefined && max !== null && <span className="opacity-60">/{max}</span>}
      <span className="ml-0.5 opacity-75">cr</span>
    </span>
  );
}
