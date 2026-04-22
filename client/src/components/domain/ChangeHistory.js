import StatusBadge from './StatusBadge';
import { cn } from '../../lib/cn';

function formatDate(dateStr) {
  try {
    return new Date(dateStr).toLocaleString('fr-FR', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

/**
 * ChangeHistory — table of status change history entries.
 *
 * Props:
 *   entries: Array<{ date, status, changedBy, comment }>
 */
export default function ChangeHistory({ entries = [], className = '' }) {
  if (!entries.length) return null;

  return (
    <div className={cn('rounded-xl border border-border overflow-hidden', className)}>
      <div className="px-4 py-3 bg-surface-2 border-b border-border">
        <h3 className="text-sm font-semibold text-text">Historique des modifications</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2">
              <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-snug text-text-dim">Date</th>
              <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-snug text-text-dim">Statut</th>
              <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-snug text-text-dim">Par</th>
              <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-snug text-text-dim">Commentaire</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-surface">
            {entries.map((h, i) => (
              <tr key={i} className="transition-colors duration-100 hover:bg-surface-2">
                <td className="px-4 py-3 text-text-muted whitespace-nowrap">{formatDate(h.date)}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={h.status} size="sm" />
                </td>
                <td className="px-4 py-3 text-text whitespace-nowrap">{h.changedBy ?? '—'}</td>
                <td className="px-4 py-3 text-text-muted">{h.comment || <span className="text-text-dim italic">Aucun commentaire</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
