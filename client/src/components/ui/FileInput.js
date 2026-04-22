import { useRef, useState, useCallback, useId } from 'react';
import { cn } from '../../lib/cn';

const UploadIcon = () => (
  <svg className="h-8 w-8 text-text-dim" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12M8 8l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const FileIcon = () => (
  <svg className="h-5 w-5 flex-shrink-0 text-text-dim" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" strokeLinecap="round" strokeLinejoin="round" />
    <polyline points="14 2 14 8 20 8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function validate(file, accept, maxSize) {
  if (maxSize && file.size > maxSize) {
    const mb = (maxSize / 1_000_000).toFixed(0);
    return `Fichier trop volumineux (max ${mb} Mo)`;
  }
  if (accept) {
    const acceptedTypes = accept.split(',').map((t) => t.trim());
    const isAccepted = acceptedTypes.some((type) => {
      if (type.startsWith('.')) return file.name.toLowerCase().endsWith(type);
      if (type.endsWith('/*')) return file.type.startsWith(type.replace('/*', '/'));
      return file.type === type;
    });
    if (!isAccepted) return 'Type de fichier non accepté';
  }
  return null;
}

export default function FileInput({
  accept,
  onChange,
  maxSize,
  preview = false,
  className = '',
  ...props
}) {
  const id = useId();
  const inputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [error, setError] = useState(null);

  const handleFile = useCallback(
    (f) => {
      if (!f) return;
      const err = validate(f, accept, maxSize);
      if (err) {
        setError(err);
        setFile(null);
        setPreviewUrl(null);
        onChange?.(null);
        return;
      }
      setError(null);
      setFile(f);
      onChange?.(f);

      if (preview && f.type.startsWith('image/')) {
        const url = URL.createObjectURL(f);
        setPreviewUrl(url);
      } else {
        setPreviewUrl(null);
      }
    },
    [accept, maxSize, preview, onChange]
  );

  const handleChange = (e) => handleFile(e.target.files?.[0] ?? null);

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    handleFile(e.dataTransfer.files?.[0] ?? null);
  };

  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);

  const clear = () => {
    setFile(null);
    setPreviewUrl(null);
    setError(null);
    onChange?.(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const isImage = file?.type.startsWith('image/');
  const isPdf = file?.type === 'application/pdf';

  return (
    <div className={cn('w-full', className)}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed',
          'px-6 py-8 text-center cursor-pointer',
          'transition-colors duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
          isDragging
            ? 'border-primary bg-primary-ghost'
            : error
            ? 'border-danger bg-danger/5'
            : 'border-border bg-surface hover:border-primary hover:bg-primary-ghost'
        )}
        aria-label="Zone de dépôt de fichier"
      >
        <UploadIcon />
        <div className="text-sm text-text-muted">
          <span className="font-medium text-primary">Choisir un fichier</span> ou glisser-déposer
        </div>
        {accept && <div className="text-xs text-text-dim">{accept.replace(/application\//g, '').replace(/,/g, ', ')}</div>}
        {maxSize && <div className="text-xs text-text-dim">Max {(maxSize / 1_000_000).toFixed(0)} Mo</div>}
      </div>

      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept}
        onChange={handleChange}
        className="sr-only"
        {...props}
      />

      {error && (
        <p className="mt-2 text-sm text-danger" role="alert">{error}</p>
      )}

      {file && !error && (
        <div className="mt-3">
          {preview && isImage && previewUrl && (
            <div className="mb-2 overflow-hidden rounded-md border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt="Aperçu" className="max-h-48 w-full object-cover" />
            </div>
          )}
          <div className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2">
            <FileIcon />
            <span className="flex-1 truncate text-sm text-text">{file.name}</span>
            {preview && isPdf && (
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={(e) => { e.stopPropagation(); /* modal opens in Phase 3 */ }}
              >
                Aperçu
              </button>
            )}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); clear(); }}
              className="text-text-dim hover:text-danger transition-colors"
              aria-label="Supprimer le fichier"
            >
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
