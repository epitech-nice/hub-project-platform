import { forwardRef } from 'react';
import { cn } from '../../lib/cn';

/**
 * BentoGrid — responsive auto-fill grid container.
 *
 * cols prop maps to a named Tailwind grid-cols class. The grid uses
 * a configurable gap and fills available width automatically.
 *
 * Props:
 *   cols: 1 | 2 | 3 | 4 | 'auto' (default: 'auto')
 *   gap:  'sm' | 'md' | 'lg'      (default: 'md')
 *   as:   tag name                (default: 'div')
 */
const COLS = {
  1:    'grid-cols-1',
  2:    'grid-cols-1 sm:grid-cols-2',
  3:    'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4:    'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  auto: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
};

const GAPS = {
  sm: 'gap-3',
  md: 'gap-5',
  lg: 'gap-6',
};

const BentoGrid = forwardRef(function BentoGrid(
  { cols = 'auto', gap = 'md', as: Tag = 'div', className = '', children, ...props },
  ref
) {
  return (
    <Tag
      ref={ref}
      className={cn('grid w-full', COLS[cols] ?? COLS.auto, GAPS[gap] ?? GAPS.md, className)}
      {...props}
    >
      {children}
    </Tag>
  );
});

export default BentoGrid;
