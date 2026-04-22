import { cn } from '../../lib/cn';

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long',
    });
  } catch {
    return dateStr;
  }
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const diff = Math.ceil((new Date(dateStr) - Date.now()) / (1000 * 60 * 60 * 24));
  return diff;
}

function PhaseStep({ label, date, icon, past, active, urgent }) {
  return (
    <div className="flex items-start gap-3">
      <div className={cn(
        'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm',
        past   && 'bg-status-approved-bg text-status-approved-text',
        active && !urgent && 'bg-primary/10 text-primary ring-2 ring-primary/30',
        active && urgent  && 'bg-status-rejected-bg text-status-rejected-text ring-2 ring-status-rejected-text/30',
        !past && !active && 'bg-surface-2 text-text-dim',
      )}
        style={past ? { backgroundColor: 'rgb(var(--status-approved-bg))', color: 'rgb(var(--status-approved-text))' } : undefined}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className={cn('text-sm font-medium', past ? 'text-text-muted line-through' : active ? 'text-text' : 'text-text-dim')}>
          {label}
        </p>
        <p className={cn('text-xs', urgent ? 'text-status-rejected-text font-medium' : 'text-text-dim')}
          style={urgent ? { color: 'rgb(var(--status-rejected-text))' } : undefined}
        >
          {formatDate(date)}
          {active && daysUntil(date) !== null && (
            <span className="ml-1">
              ({daysUntil(date) > 0 ? `J-${daysUntil(date)}` : daysUntil(date) === 0 ? "aujourd'hui" : 'dépassé'})
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

/**
 * CycleTimeline — visual timeline of a simulated enrollment cycle phases.
 *
 * Props:
 *   startDate:          string (ISO date)
 *   defenseDate:        string (ISO date — vendredi présentation)
 *   submissionDeadline: string (ISO date — mercredi soumission)
 *   status:             'pending' | 'pending_changes' | 'approved' | 'rejected'
 *   cycleNumber:        number
 *   isDoubleCycle:      boolean
 */
export default function CycleTimeline({ startDate, defenseDate, submissionDeadline, status, cycleNumber, isDoubleCycle, className = '' }) {
  const now = Date.now();
  const defensePast   = defenseDate        && new Date(defenseDate)        < now;
  const submissionPast= submissionDeadline && new Date(submissionDeadline) < now;
  const daysLeft      = submissionDeadline ? daysUntil(submissionDeadline) : null;
  const isUrgent      = daysLeft !== null && daysLeft <= 2 && !submissionPast;

  return (
    <div className={cn('rounded-xl border border-border bg-surface p-4', className)}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text">
          Cycle n°{cycleNumber}
          {isDoubleCycle && (
            <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              Double cycle
            </span>
          )}
        </h3>
        {status === 'approved' && (
          <span className="text-xs font-medium" style={{ color: 'rgb(var(--status-approved-text))' }}>Validé</span>
        )}
      </div>

      <div className="space-y-4">
        <PhaseStep
          label="Début du cycle"
          date={startDate}
          icon="▶"
          past={!!startDate && new Date(startDate) < now}
          active={false}
        />
        <div className="ml-4 border-l-2 border-border pl-4 -mt-2 pt-2 space-y-4">
          <PhaseStep
            label="Présentation (vendredi)"
            date={defenseDate}
            icon="🎤"
            past={defensePast}
            active={!defensePast}
          />
          <PhaseStep
            label="Soumission GitHub (mercredi)"
            date={submissionDeadline}
            icon="📤"
            past={submissionPast}
            active={!submissionPast && defensePast}
            urgent={isUrgent}
          />
        </div>
      </div>
    </div>
  );
}
