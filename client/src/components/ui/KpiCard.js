import { cn } from '../../lib/cn';

/**
 * KpiCard — single metric display for dashboards.
 *
 * Props:
 *   label:   string   — metric name (required)
 *   value:   string | number — primary value (required)
 *   sub:     string   — secondary info below value (optional)
 *   icon:    ReactNode — icon rendered top-left (optional)
 *   trend:   'up' | 'down' | 'neutral' (optional, shows colored indicator)
 *   trendLabel: string — e.g. "+12% ce mois" (optional)
 *   variant: 'default' | 'primary' | 'success' | 'warning' | 'danger'
 */
const VARIANT_MAP = {
  default: {
    card:  'bg-surface border border-border',
    icon:  'bg-surface-2 text-text-muted',
    value: 'text-text',
  },
  primary: {
    card:  'bg-primary/5 border border-primary/20',
    icon:  'bg-primary/10 text-primary',
    value: 'text-primary',
  },
  success: {
    card:  'bg-status-approved-bg/30 border border-status-approved-text/20',
    icon:  'bg-status-approved-bg text-status-approved-text',
    value: 'text-status-approved-text',
  },
  warning: {
    card:  'bg-status-changes-bg/30 border border-status-changes-text/20',
    icon:  'bg-status-changes-bg text-status-changes-text',
    value: 'text-status-changes-text',
  },
  danger: {
    card:  'bg-status-rejected-bg/30 border border-status-rejected-text/20',
    icon:  'bg-status-rejected-bg text-status-rejected-text',
    value: 'text-status-rejected-text',
  },
};

const TREND_COLORS = {
  up:      'text-status-approved-text',
  down:    'text-status-rejected-text',
  neutral: 'text-text-dim',
};

const TrendArrow = ({ trend }) => {
  if (trend === 'up') {
    return (
      <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3 w-3 shrink-0" aria-hidden="true">
        <path d="M6 10V2M2 6l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (trend === 'down') {
    return (
      <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3 w-3 shrink-0" aria-hidden="true">
        <path d="M6 2v8M2 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3 w-3 shrink-0" aria-hidden="true">
      <path d="M2 6h8" strokeLinecap="round" />
    </svg>
  );
};

export default function KpiCard({
  label,
  value,
  sub,
  icon,
  trend,
  trendLabel,
  variant = 'default',
  className = '',
}) {
  const style = VARIANT_MAP[variant] ?? VARIANT_MAP.default;

  return (
    <div className={cn('rounded-xl p-5.5', style.card, className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-text-muted truncate">{label}</p>
          <p className={cn('mt-1.5 text-3xl font-bold tracking-tight', style.value)}>
            {value}
          </p>
          {sub && (
            <p className="mt-1 text-sm text-text-dim truncate">{sub}</p>
          )}
          {(trend || trendLabel) && (
            <div className={cn('mt-2 flex items-center gap-1 text-xs font-medium', TREND_COLORS[trend] ?? TREND_COLORS.neutral)}>
              {trend && <TrendArrow trend={trend} />}
              {trendLabel && <span>{trendLabel}</span>}
            </div>
          )}
        </div>
        {icon && (
          <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xl', style.icon)}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
