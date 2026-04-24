import { forwardRef } from 'react';
import { cn } from '../../lib/cn';

/**
 * BentoCard — styled card tile for use inside BentoGrid.
 *
 * Props:
 *   span:     'normal' | 'wide' | 'tall' | 'large'  (grid span, default: 'normal')
 *   variant:  'default' | 'highlight' | 'ghost'      (surface style, default: 'default')
 *   hover:    boolean — add lift animation on hover   (default: true)
 *   padding:  'default' | 'compact' | 'none'         (default: 'default')
 *   as:       tag name                               (default: 'div')
 */
const SPANS = {
  normal:  '',
  wide:    'sm:col-span-2',
  tall:    'sm:row-span-2',
  large:   'sm:col-span-2 sm:row-span-2',
};

const VARIANTS = {
  default:   'bg-surface border border-border',
  highlight: 'bg-primary/5 border border-primary/20',
  ghost:     'bg-transparent border border-dashed border-border',
};

const PADDING = {
  default: 'p-5.5',
  compact: 'p-4.5',
  none:    '',
};

const BentoCard = forwardRef(function BentoCard(
  {
    span = 'normal',
    variant = 'default',
    hover = true,
    padding = 'default',
    as: Tag = 'div',
    className = '',
    children,
    ...props
  },
  ref
) {
  return (
    <Tag
      ref={ref}
      className={cn(
        'rounded-xl',
        SPANS[span] ?? '',
        VARIANTS[variant] ?? VARIANTS.default,
        PADDING[padding] ?? PADDING.default,
        hover && [
          'transition-all duration-200 ease-smooth',
          'hover:-translate-y-1 hover:shadow-lg hover:border-primary/40',
        ],
        className
      )}
      {...props}
    >
      {children}
    </Tag>
  );
});

export default BentoCard;
