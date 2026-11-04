import { cn } from '../../lib/cn';
import { formatDate, formatDeadline, isDeadlinePassed, isIdeaUnlocked } from '../../lib/ideation';

/**
 * DeadlineNotice — bandeau de date limite (GET /api/ideas/settings → deadlineDate).
 * Rien si aucune date n'est fixée. Indicatif : le serveur reste l'autorité (403).
 * `idea` (facultatif) : si le staff l'a débloquée après la date limite, le bandeau l'indique.
 */
export default function DeadlineNotice({ deadlineDate, idea, className = '' }) {
  const label = formatDeadline(deadlineDate);
  if (!label) return null;
  const passed = isDeadlinePassed(deadlineDate);
  const reopened = passed && isIdeaUnlocked(idea);
  const tone = reopened ? 'approved' : passed ? 'rejected' : 'pending';

  return (
    <div
      role={passed && !reopened ? 'alert' : 'status'}
      className={cn('flex items-start gap-3 rounded-lg border px-4 py-3', className)}
      style={{
        backgroundColor: `rgb(var(--status-${tone}-bg))`,
        borderColor: `rgb(var(--status-${tone}-text) / 0.35)`,
        color: `rgb(var(--status-${tone}-text))`,
      }}
    >
      <svg className="mt-0.5 h-5 w-5 shrink-0" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <circle cx="10" cy="10" r="7.5" />
        <path d="M10 6v4l2.5 2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="text-sm">
        {reopened ? (
          <>
            <p className="font-semibold">Idée rouverte par le staff jusqu&apos;au {formatDate(idea.unlockedUntil, true)}</p>
            <p className="mt-0.5">La date limite ({label}) est dépassée, mais cette idée reste modifiable jusque-là.</p>
          </>
        ) : passed ? (
          <>
            <p className="font-semibold">Date limite dépassée ({label})</p>
            <p className="mt-0.5">
              Création, modification, dépôt de fichiers, liens et invitations sont fermés. La consultation et les téléchargements restent ouverts.
            </p>
          </>
        ) : (
          <p>
            <span className="font-semibold">Date limite de dépôt :</span> {label}, jusqu&apos;à 23 h 59 (heure de Paris).
          </p>
        )}
      </div>
    </div>
  );
}
