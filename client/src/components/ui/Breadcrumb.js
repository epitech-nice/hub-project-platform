import Link from 'next/link';
import { cn } from '../../lib/cn';

export default function Breadcrumb({ items = [], className = '' }) {
  return (
    <nav aria-label="Fil d'Ariane" className={cn('flex items-center flex-wrap gap-1', className)}>
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={i} className="flex items-center gap-1">
            {isLast ? (
              <span className="text-sm font-medium text-text" aria-current="page">
                {item.label}
              </span>
            ) : (
              <Link
                href={item.href ?? '#'}
                className={cn(
                  'text-sm text-text-muted hover:text-text transition-colors duration-150 ease-smooth',
                  'focus-visible:outline-none focus-visible:underline'
                )}
              >
                {item.label}
              </Link>
            )}
            {!isLast && (
              <span className="text-text-dim select-none" aria-hidden="true">·</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
