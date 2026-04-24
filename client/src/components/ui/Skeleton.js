import { cn } from '../../lib/cn';

export default function Skeleton({ variant = 'rect', width, height, className = '' }) {
  const base = cn(
    'bg-gradient-to-r from-surface-2 via-border to-surface-2',
    'bg-[length:200%_100%] animate-shimmer',
    variant === 'circle' && 'rounded-full',
    variant === 'text' && 'rounded h-4',
    variant === 'rect' && 'rounded-md',
    className
  );

  return (
    <span
      className={base}
      style={{ width, height, display: 'block' }}
      aria-hidden="true"
    />
  );
}
