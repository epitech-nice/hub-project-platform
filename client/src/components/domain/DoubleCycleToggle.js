import Switch from '../ui/Switch';
import { cn } from '../../lib/cn';

/**
 * DoubleCycleToggle — admin-only toggle for double cycle mode.
 *
 * Props:
 *   checked:   boolean
 *   onChange:  (checked: boolean) => void
 *   disabled:  boolean
 *   loading:   boolean
 */
export default function DoubleCycleToggle({ checked, onChange, disabled = false, loading = false, className = '' }) {
  return (
    <div className={cn(
      'flex items-start gap-4 rounded-xl border border-border bg-surface p-4',
      (disabled || loading) && 'opacity-60',
      className
    )}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text">Double cycle</p>
        <p className="mt-0.5 text-xs text-text-muted">
          Active un cycle étendu (vacances, etc.) avec crédits jusqu'à 4 par pas de 0,5.
        </p>
      </div>
      <Switch
        checked={checked}
        onChange={onChange}
        disabled={disabled || loading}
        aria-label="Activer le double cycle"
      />
    </div>
  );
}
