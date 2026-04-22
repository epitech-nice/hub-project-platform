import { useId } from 'react';
import { cn } from '../../lib/cn';

/**
 * FormField — label + input wrapper with error/hint messaging.
 *
 * Clones a single React child and injects id, aria-describedby, and
 * aria-invalid so any input primitive (Input, Textarea, Select, etc.)
 * gets the correct ARIA wiring automatically.
 *
 * Props:
 *   label:    string (required)
 *   required: boolean
 *   hint:     string — helper text below the field
 *   error:    string — error message (also sets aria-invalid on child)
 *   children: single React element (the input/select/textarea)
 */
import { cloneElement, Children } from 'react';

export default function FormField({ label, required, hint, error, children, className = '' }) {
  const id = useId();
  const inputId = `${id}-input`;
  const hintId  = hint  ? `${id}-hint`  : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  const child = Children.only(children);
  const wiredChild = cloneElement(child, {
    id: child.props.id ?? inputId,
    'aria-describedby': describedBy,
    'aria-invalid': error ? true : undefined,
    'aria-required': required || undefined,
  });

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label
        htmlFor={child.props.id ?? inputId}
        className="text-sm font-medium text-text"
      >
        {label}
        {required && (
          <span className="ml-1 text-danger" aria-hidden="true">*</span>
        )}
      </label>

      {wiredChild}

      {hint && !error && (
        <p id={hintId} className="text-xs text-text-dim">{hint}</p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs text-danger">{error}</p>
      )}
    </div>
  );
}
