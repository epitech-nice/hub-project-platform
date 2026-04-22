import { cn } from '../../lib/cn';

/**
 * EmptyState — centered placeholder for empty lists and zero-data views.
 *
 * Props:
 *   icon:    ReactNode — illustration or emoji (optional)
 *   title:   string
 *   sub:     string (optional)
 *   action:  ReactNode — primary CTA button (optional)
 *   size:    'sm' | 'md' | 'lg'  (default: 'md')
 */
const SIZES = {
  sm: { wrap: 'py-10', icon: 'text-4xl', title: 'text-base', sub: 'text-sm' },
  md: { wrap: 'py-16', icon: 'text-5xl', title: 'text-lg',   sub: 'text-sm' },
  lg: { wrap: 'py-24', icon: 'text-6xl', title: 'text-xl',   sub: 'text-base' },
};

export default function EmptyState({ icon, title, sub, action, size = 'md', className = '' }) {
  const s = SIZES[size] ?? SIZES.md;
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', s.wrap, className)}>
      {icon && (
        <div className={cn('mb-4 select-none text-text-dim', s.icon)} aria-hidden="true">
          {icon}
        </div>
      )}
      <p className={cn('font-semibold text-text', s.title)}>{title}</p>
      {sub && <p className={cn('mt-1 text-text-muted max-w-sm', s.sub)}>{sub}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
