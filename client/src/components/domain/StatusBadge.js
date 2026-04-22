import Badge from '../ui/Badge';

const STATUS_MAP = {
  pending:         { variant: 'pending',  label: 'En attente' },
  pending_changes: { variant: 'changes',  label: 'Modifications requises' },
  approved:        { variant: 'approved', label: 'Approuvé' },
  rejected:        { variant: 'rejected', label: 'Rejeté' },
};

/**
 * StatusBadge — maps a workflow status string to a Badge with a French label.
 *
 * Props:
 *   status: 'pending' | 'pending_changes' | 'approved' | 'rejected'
 *   dot:    boolean (default: false)
 *   size:   'sm' | 'md'
 */
export default function StatusBadge({ status, dot = false, size = 'md', className = '' }) {
  const { variant, label } = STATUS_MAP[status] ?? { variant: 'neutral', label: status ?? '—' };
  return (
    <Badge variant={variant} dot={dot} size={size} className={className}>
      {label}
    </Badge>
  );
}
