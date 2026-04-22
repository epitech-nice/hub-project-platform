import Link from 'next/link';
import { useRouter } from 'next/router';
import { toast } from 'react-toastify';
import { useApi } from '../../hooks/useApi';
import { cn } from '../../lib/cn';
import StatusBadge from '../domain/StatusBadge';
import Button from '../ui/Button';

export default function ProjectCard({ project, onDelete, isCreator = true }) {
  const isPendingOrChanges = project.status === 'pending' || project.status === 'pending_changes';
  const router = useRouter();
  const { delete: deleteRequest } = useApi();

  const handleEdit = () => router.push(`/projects/edit/${project._id}`);

  const handleDelete = async () => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce projet ? Cette action est irréversible.')) return;
    try {
      await deleteRequest(`/api/projects/${project._id}`);
      onDelete?.(project._id);
    } catch {
      toast.error('Une erreur est survenue lors de la suppression du projet.');
    }
  };

  return (
    <div className={cn(
      'flex flex-col rounded-xl border border-border bg-surface p-5.5',
      'transition-shadow duration-200 ease-smooth hover:shadow-md',
      'border-l-4',
      isCreator ? 'border-l-primary' : 'border-l-secondary'
    )}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-text truncate">{project.name}</h3>
          {!isCreator && (
            <p className="text-xs text-text-dim mt-0.5">Vous êtes membre de ce projet</p>
          )}
        </div>
        <StatusBadge status={project.status} size="sm" />
      </div>

      {/* Description */}
      <p className="text-sm text-text-muted line-clamp-2 mb-4 flex-1">{project.description}</p>

      {/* Technologies */}
      {project.technologies?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {project.technologies.map((tech, i) => (
            <span key={i} className="rounded-md bg-surface-2 px-2 py-0.5 text-xs text-text-muted border border-border">
              {tech}
            </span>
          ))}
        </div>
      )}

      {/* Meta */}
      <div className="text-xs text-text-dim mb-4 space-y-0.5">
        <p>Étudiants : {project.studentCount}</p>
        <p>Soumis le {new Date(project.createdAt).toLocaleDateString('fr-FR')}</p>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between gap-2 pt-3 border-t border-border">
        <Link href={`/projects/${project._id}`}>
          <a>
            <Button size="sm" variant="outline">Voir les détails</Button>
          </a>
        </Link>

        {isCreator && isPendingOrChanges && (
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={handleEdit}>Modifier</Button>
            <Button size="sm" variant="danger" onClick={handleDelete}>Supprimer</Button>
          </div>
        )}
      </div>
    </div>
  );
}
