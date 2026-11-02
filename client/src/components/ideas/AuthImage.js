import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { fetchBlob } from '../../lib/download';
import { cn } from '../../lib/cn';

// Seuls les logos raster s'affichent ; un SVG n'est jamais rendu (servi en pièce jointe)
const DISPLAYABLE = ['image/png', 'image/jpeg'];

// Visuel par défaut : initiale du titre sur un fond teinté par la couleur primaire
export function DefaultVisual({ title, className = '' }) {
  const initial = (String(title || '').trim()[0] || '#').toUpperCase();
  return (
    <div
      className={cn(
        'relative flex h-full w-full items-center justify-center overflow-hidden',
        'bg-primary/10 text-primary',
        className
      )}
      aria-hidden="true"
    >
      <span
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 20%, rgb(var(--primary) / 0.25), transparent 55%), radial-gradient(circle at 85% 80%, rgb(var(--primary) / 0.15), transparent 50%)',
        }}
      />
      <span className="relative text-4xl font-extrabold tracking-tight">{initial}</span>
    </div>
  );
}

/**
 * AuthImage — logo d'une idée chargé avec le token (un <img src> ne peut pas
 * envoyer l'en-tête Authorization). Visuel par défaut si pas de logo, SVG ou erreur.
 *
 * Props: ideaId, hasLogo, title (pour le visuel par défaut et l'alt), version (optionnel,
 * change la clé de chargement après un remplacement), className.
 */
export default function AuthImage({ ideaId, hasLogo, title, version, className = '' }) {
  const { token } = useAuth();
  const [src, setSrc] = useState(null);

  useEffect(() => {
    setSrc(null);
    if (!hasLogo || !ideaId || !token) return undefined;

    let cancelled = false;
    let objectUrl = null;

    fetchBlob(`/api/ideas/${encodeURIComponent(ideaId)}/logo`, token)
      .then((blob) => {
        if (cancelled || !DISPLAYABLE.includes(blob.type)) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {
        // Visuel par défaut en cas d'erreur
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [ideaId, hasLogo, token, version]);

  if (!src) return <DefaultVisual title={title} className={className} />;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={title ? `Logo de ${title}` : 'Logo'}
      className={cn('h-full w-full object-contain bg-surface-2', className)}
      onError={() => setSrc(null)}
    />
  );
}
