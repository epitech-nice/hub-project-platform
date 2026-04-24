import Link from 'next/link';
import { useRouter } from 'next/router';
import { toast } from 'react-toastify';
import { useApi } from '../../hooks/useApi';
import { cn } from '../../lib/cn';
import StatusBadge from '../domain/StatusBadge';
import Button from '../ui/Button';

export default function WorkshopCard({ workshop, onDelete, isMain = true }) {
  const isPendingOrChanges = workshop.status === 'pending' || workshop.status === 'pending_changes';
  const router = useRouter();
  const { delete: deleteRequest } = useApi();

  const handleEdit = () => router.push(`/workshops/edit/${workshop._id}`);

  const handleDelete = async () => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce workshop ? Cette action est irréversible.')) return;
    try {
      await deleteRequest(`/api/workshops/${workshop._id}`);
      onDelete?.(workshop._id);
    } catch {
      toast.error('Une erreur est survenue lors de la suppression du workshop.');
    }
  };

  return (
    <div className={cn(
      'flex flex-col rounded-xl border border-border bg-surface p-5.5',
      'transition-shadow duration-200 ease-smooth hover:shadow-md',
      'border-l-4',
      isMain ? 'border-l-accent' : 'border-l-secondary'
    )}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-text truncate">{workshop.title}</h3>
          {!isMain && (
            <p className="text-xs text-text-dim mt-0.5">Vous êtes intervenant</p>
          )}
        </div>
        <StatusBadge status={workshop.status} size="sm" />
      </div>

      {/* Details */}
      <p className="text-sm text-text-muted line-clamp-2 mb-4 flex-1">{workshop.details}</p>

      {/* Meta */}
      <div className="text-xs text-text-dim mb-4 space-y-0.5">
        <p>Intervenants : {workshop.instructorCount}</p>
        <p>Soumis le {new Date(workshop.createdAt).toLocaleDateString('fr-FR')}</p>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between gap-2 pt-3 border-t border-border">
        <Link href={`/workshops/${workshop._id}`}>
          <a>
            <Button size="sm" variant="outline">Voir les détails</Button>
          </a>
        </Link>

        {isMain && isPendingOrChanges && (
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={handleEdit}>Modifier</Button>
            <Button size="sm" variant="danger" onClick={handleDelete}>Supprimer</Button>
          </div>
        )}
      </div>
    </div>
  );
}
