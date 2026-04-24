import { cn } from '../../lib/cn';

const VARIANTS = ['pending', 'approved', 'changes', 'rejected', 'neutral', 'new'];

const SIZES = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-0.5 text-xs',
};

export default function Badge({ variant = 'neutral', size = 'md', dot = false, children, className = '' }) {
  const isValidVariant = VARIANTS.includes(variant);
  const v = isValidVariant ? variant : 'neutral';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-medium',
        SIZES[size] ?? SIZES.md,
        className
      )}
      style={{
        backgroundColor: `rgb(var(--status-${v}-bg))`,
        color: `rgb(var(--status-${v}-text))`,
      }}
    >
      {dot && (
        <span
          className={cn(
            'h-2 w-2 rounded-full flex-shrink-0',
            variant === 'new' && 'animate-pulse'
          )}
          style={{ backgroundColor: `rgb(var(--status-${v}-text))` }}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}
