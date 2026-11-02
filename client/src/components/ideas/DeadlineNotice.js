import { cn } from '../../lib/cn';
import { formatDeadline, isDeadlinePassed } from '../../lib/ideation';

/**
 * DeadlineNotice — bandeau de date limite (GET /api/ideas/settings → deadlineDate).
 * Rien si aucune date n'est fixée. Indicatif : le serveur reste l'autorité (403).
 */
export default function DeadlineNotice({ deadlineDate, className = '' }) {
  const label = formatDeadline(deadlineDate);
  if (!label) return null;
  const passed = isDeadlinePassed(deadlineDate);
  const tone = passed ? 'rejected' : 'pending';

  return (
    <div
      role={passed ? 'alert' : 'status'}
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
        {passed ? (
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
