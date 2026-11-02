import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { fetchBlob, saveBlob } from '../../lib/download';
import { formatBytes, formatDate } from '../../lib/ideation';
import { cn } from '../../lib/cn';
import Button from '../ui/Button';
import Badge from '../ui/Badge';

const DownloadIcon = () => (
  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    <path d="M10 3v10M6 9l4 4 4-4M4 16h12" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * VersionHistory — versions d'un fichier (logo ou deck), de la plus récente à la plus ancienne,
 * chacune téléchargeable via la route authentifiée GET /api/ideas/:id/:kind/:version.
 *
 * Props: ideaId, kind ('logo' | 'deck'), file ({ current, versions } renvoyé par le serveur),
 *        emptyText (texte si aucune version).
 */
export default function VersionHistory({ ideaId, kind, file, emptyText = 'Aucun fichier déposé.' }) {
  const { token } = useAuth();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const versions = (file && file.versions) || [];
  const currentNumber = file && file.current ? file.current.number : null;

  const download = async (version) => {
    setBusy(version.number);
    setError(null);
    try {
      const blob = await fetchBlob(
        `/api/ideas/${encodeURIComponent(ideaId)}/${kind}/${version.number}`,
        token
      );
      saveBlob(blob, version.originalName || `${kind}-v${version.number}`);
    } catch (err) {
      setError(err.message || 'Téléchargement impossible');
    } finally {
      setBusy(null);
    }
  };

  if (versions.length === 0) {
    return <p className="text-sm text-text-muted">{emptyText}</p>;
  }

  return (
    <div>
      <ol className="divide-y divide-border rounded-lg border border-border">
        {versions.map((v) => {
          const isCurrent = v.number === currentNumber;
          return (
            <li
              key={v.number}
              className={cn(
                'flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between',
                isCurrent && 'bg-primary/5'
              )}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-text-muted">v{v.number}</span>
                  <span className="truncate text-sm font-medium text-text" title={v.originalName}>
                    {v.originalName}
                  </span>
                  {isCurrent && <Badge variant="approved" size="sm">Actuelle</Badge>}
                </div>
                <p className="mt-0.5 text-xs text-text-dim">
                  {v.author && v.author.name ? `${v.author.name} · ` : ''}
                  {formatDate(v.createdAt, true)}
                  {typeof v.size === 'number' ? ` · ${formatBytes(v.size)}` : ''}
                </p>
              </div>
              <Button
                size="sm"
                variant={isCurrent ? 'outline' : 'ghost'}
                loading={busy === v.number}
                disabled={busy !== null && busy !== v.number}
                onClick={() => download(v)}
                aria-label={`Télécharger la version ${v.number} (${v.originalName})`}
                className="self-start sm:self-auto"
              >
                {busy !== v.number && <DownloadIcon />}
                Télécharger
              </Button>
            </li>
          );
        })}
      </ol>
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
