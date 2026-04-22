import { cn } from '../../lib/cn';

const API = process.env.NEXT_PUBLIC_API_URL || '';

/**
 * SubjectFilePreview — card showing a simulated project subject file (PDF or image).
 *
 * Props:
 *   filePath:  string — server path (e.g. "/uploads/simulated-subjects/file.pdf")
 *   title:     string — project title (used for alt text)
 *   compact:   boolean — smaller card for catalog grid (default: false)
 */
function isPdf(path) {
  return path?.toLowerCase().endsWith('.pdf');
}

function FileIcon() {
  return (
    <svg viewBox="0 0 40 48" fill="none" className="h-12 w-12 text-text-dim" aria-hidden="true">
      <path d="M6 4h20l10 10v30a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2z" stroke="currentColor" strokeWidth="2" />
      <path d="M26 4v10h10" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M12 22h16M12 28h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export default function SubjectFilePreview({ filePath, title, compact = false, className = '' }) {
  if (!filePath) {
    return (
      <div className={cn(
        'flex items-center justify-center rounded-xl border border-dashed border-border bg-surface-2 text-text-dim',
        compact ? 'h-32' : 'h-48',
        className
      )}>
        <span className="text-sm">Aucun sujet disponible</span>
      </div>
    );
  }

  const src = `${API}${filePath}`;
  const pdf = isPdf(filePath);

  return (
    <div className={cn('rounded-xl border border-border bg-surface overflow-hidden', className)}>
      {pdf ? (
        <div className={cn('flex flex-col items-center justify-center gap-3 bg-surface-2', compact ? 'h-32' : 'h-48')}>
          <FileIcon />
          <span className="text-xs text-text-muted">Sujet PDF</span>
        </div>
      ) : (
        <div className={cn('bg-surface-2 overflow-hidden', compact ? 'h-32' : 'h-48')}>
          <img
            src={src}
            alt={`Sujet — ${title ?? 'projet'}`}
            className="h-full w-full object-cover object-top"
          />
        </div>
      )}
      <div className="flex items-center justify-between px-3 py-2 border-t border-border">
        <span className="text-xs text-text-muted truncate">{title ?? 'Sujet'}</span>
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            'ml-3 shrink-0 text-xs font-medium text-primary hover:underline',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded'
          )}
          aria-label={`Ouvrir le sujet${title ? ` — ${title}` : ''}`}
        >
          {pdf ? 'Ouvrir PDF' : 'Voir image'}
        </a>
      </div>
    </div>
  );
}
