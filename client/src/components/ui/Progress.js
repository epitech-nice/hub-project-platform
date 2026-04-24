import { cn } from '../../lib/cn';

const RADIUS = 36;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function Progress({
  value = 0,
  max = 100,
  variant = 'linear',
  label,
  className = '',
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));

  if (variant === 'circular') {
    const offset = CIRCUMFERENCE - (pct / 100) * CIRCUMFERENCE;
    return (
      <div className={cn('inline-flex flex-col items-center gap-1', className)}>
        <svg
          width="88"
          height="88"
          viewBox="0 0 88 88"
          fill="none"
          aria-label={label ?? `${Math.round(pct)}%`}
          role="progressbar"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={max}
        >
          <circle cx="44" cy="44" r={RADIUS} stroke="rgb(var(--surface-2))" strokeWidth="8" />
          <circle
            cx="44"
            cy="44"
            r={RADIUS}
            stroke="rgb(var(--primary))"
            strokeWidth="8"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform="rotate(-90 44 44)"
            className="transition-all duration-300 ease-smooth"
          />
          <text x="44" y="44" textAnchor="middle" dominantBaseline="central" className="text-xs font-medium fill-current">
            {Math.round(pct)}%
          </text>
        </svg>
        {label && <span className="text-xs text-text-muted">{label}</span>}
      </div>
    );
  }

  return (
    <div className={cn('w-full', className)}>
      {label && (
        <div className="flex justify-between text-xs text-text-muted mb-1">
          <span>{label}</span>
          <span>{Math.round(pct)}%</span>
        </div>
      )}
      <div
        className="h-2 bg-surface-2 rounded-full overflow-hidden"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
      >
        <div
          className="h-full bg-primary rounded-full transition-all duration-300 ease-smooth"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
