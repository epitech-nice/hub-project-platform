import { cn } from '../../lib/cn';

/**
 * FormActions — sticky bottom row for form submit/cancel buttons.
 *
 * Props:
 *   align:  'left' | 'right' | 'between'  (default: 'right')
 *   sticky: boolean — stick to viewport bottom on scroll  (default: false)
 */
const ALIGN = {
  left:    'justify-start',
  right:   'justify-end',
  between: 'justify-between',
};

export default function FormActions({ align = 'right', sticky = false, className = '', children }) {
  return (
    <div className={cn(
      'flex flex-wrap items-center gap-3 pt-5',
      sticky && [
        'sticky bottom-0 z-10',
        'bg-surface/90 backdrop-blur-sm',
        'border-t border-border py-4 -mx-5.5 px-5.5',
      ],
      ALIGN[align] ?? ALIGN.right,
      className
    )}>
      {children}
    </div>
  );
}
