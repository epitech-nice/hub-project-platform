import { cn } from '../../lib/cn';

/**
 * FormSection — titled group of form fields with optional description.
 *
 * Props:
 *   title:       string
 *   description: string (optional)
 *   columns:     1 | 2 | 3  — grid columns for children (default: 1)
 */
const COLS = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
};

export default function FormSection({ title, description, columns = 1, className = '', children }) {
  return (
    <section className={cn('space-y-4', className)}>
      {(title || description) && (
        <div className="pb-2 border-b border-border">
          {title && <h2 className="text-base font-semibold text-text">{title}</h2>}
          {description && <p className="mt-1 text-sm text-text-muted">{description}</p>}
        </div>
      )}
      <div className={cn('grid gap-4', COLS[columns] ?? COLS[1])}>
        {children}
      </div>
    </section>
  );
}
