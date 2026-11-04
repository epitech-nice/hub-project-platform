import Link from 'next/link';
import BentoCard from '../ui/BentoCard';
import Badge from '../ui/Badge';
import AuthImage from './AuthImage';
import { cn } from '../../lib/cn';

const CLAMP_3 = { display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' };

export function HashtagList({ tags = [], max, className = '' }) {
  const shown = max ? tags.slice(0, max) : tags;
  const rest = tags.length - shown.length;
  return (
    <ul className={cn('flex flex-wrap gap-1.5', className)} aria-label="Hashtags">
      {shown.map((tag) => (
        <li
          key={tag}
          className="rounded-md border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs text-text-muted"
        >
          #{tag}
        </li>
      ))}
      {rest > 0 && <li className="px-1 py-0.5 text-xs text-text-dim">+{rest}</li>}
    </ul>
  );
}

/**
 * IdeaCard — carte du catalogue et de « Mes idées ».
 * Props: idea (forme toCard du serveur), badges (ReactNode optionnel, en tête de carte).
 */
export default function IdeaCard({ idea, badges }) {
  const count = idea.memberCount ?? 0;
  return (
    <Link href={`/idees/${idea._id}`} passHref>
      <BentoCard
        as="a"
        padding="none"
        className={cn(
          'group flex flex-col overflow-hidden',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg'
        )}
      >
        <div className="aspect-video w-full overflow-hidden border-b border-border">
          <AuthImage ideaId={idea._id} hasLogo={idea.hasLogo} title={idea.title} />
        </div>

        <div className="flex flex-1 flex-col gap-3 p-5">
          {(badges || idea.incomplete) && (
            <div className="flex flex-wrap items-center gap-1.5">
              {badges}
              {idea.incomplete && <Badge variant="changes" size="sm">Groupe incomplet</Badge>}
            </div>
          )}

          <h2 className="text-lg font-bold leading-snug tracking-tight text-text break-words group-hover:text-primary transition-colors duration-150">
            {idea.title}
          </h2>

          <p className="flex-1 text-sm leading-relaxed text-text-muted break-words" style={CLAMP_3}>
            {idea.description}
          </p>

          <HashtagList tags={idea.hashtags || []} max={5} />

          <p className="border-t border-border pt-3 text-xs text-text-dim">
            {count} membre{count > 1 ? 's' : ''}
            {idea.createdAt && (
              <> · déposée le {new Date(idea.createdAt).toLocaleDateString('fr-FR')}</>
            )}
          </p>
        </div>
      </BentoCard>
    </Link>
  );
}
