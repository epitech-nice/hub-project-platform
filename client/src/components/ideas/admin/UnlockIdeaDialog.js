// components/ideas/admin/UnlockIdeaDialog.js
// Déblocage d'une idée après la date limite (PATCH /api/ideas/admin/:id/unlock, { until: ISO | null })
import { useEffect, useState } from 'react';
import Dialog from '../../ui/Dialog';
import Button from '../../ui/Button';
import Input from '../../ui/Input';
import FormField from '../../ui/FormField';
import Skeleton from '../../ui/Skeleton';
import { useApi } from '../../../hooks/useApi';
import useIdeaDetail from './useIdeaDetail';
import { deadlineCutoff, errorText, formatDate, formatDeadline, isIdeaUnlocked } from '../../../lib/ideation';

// Date du jour à Paris, au format YYYY-MM-DD (valeur minimale du sélecteur)
const parisToday = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date()).reduce((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
};

// Fin du jour choisi (23:59:59, heure de Paris), en ISO
const endOfParisDay = (day) => {
  const cutoff = deadlineCutoff(day);
  return cutoff ? new Date(cutoff.getTime() - 1000).toISOString() : null;
};

export default function UnlockIdeaDialog({ row, onClose, onChanged }) {
  const { patch } = useApi();
  const open = Boolean(row);
  const { idea, setIdea, loading, error: loadError } = useIdeaDetail(row && row._id, open);
  const [day, setDay] = useState('');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    setDay('');
    setBusy(null);
    setError(null);
    setNotice(null);
  }, [row]);

  const close = () => {
    if (!busy) onClose();
  };

  const send = async (until, kind) => {
    setBusy(kind);
    setError(null);
    setNotice(null);
    try {
      const res = await patch(`/api/ideas/admin/${encodeURIComponent(row._id)}/unlock`, { until });
      if (res && res.data) setIdea(res.data);
      setNotice(until ? 'Idée rouverte.' : 'Idée reverrouillée : la date limite globale s’applique de nouveau.');
      setDay('');
      onChanged();
    } catch (err) {
      setError(errorText(err, 'Action impossible'));
    } finally {
      setBusy(null);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    const until = endOfParisDay(day);
    if (!until) {
      setError('Choisissez une date.');
      return;
    }
    send(until, 'unlock');
  };

  const unlocked = isIdeaUnlocked(idea);

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Débloquer l'idée"
      footer={
        <div className="flex justify-end">
          <Button variant="subtle" onClick={close} disabled={Boolean(busy)}>Fermer</Button>
        </div>
      }
    >
      {row && (
        <div className="space-y-4 text-sm">
          <p className="text-text-muted">
            Rouvre <span className="font-semibold text-text break-words">« {row.title} »</span> à son groupe
            après la date limite, jusqu&apos;à la fin du jour choisi (23 h 59, heure de Paris). Les autres idées
            restent fermées.
          </p>

          <div className="rounded-lg border border-border bg-surface-2 px-4 py-3" aria-live="polite">
            <p className="text-xs font-semibold uppercase tracking-wider text-text-dim">État actuel</p>
            {loading ? (
              <Skeleton variant="text" width="60%" className="mt-2" />
            ) : loadError ? (
              <p role="alert" className="mt-1 text-danger">{loadError}</p>
            ) : unlocked ? (
              <p className="mt-1 text-text">Rouverte jusqu&apos;au {formatDate(idea.unlockedUntil, true)}</p>
            ) : (
              <p className="mt-1 text-text">Pas de déblocage en cours : la date limite globale s&apos;applique.</p>
            )}
          </div>

          <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <FormField
              label="Rouvrir jusqu'au"
              hint={day ? `Jusqu'au ${formatDeadline(day)}, 23 h 59` : undefined}
              className="flex-1"
            >
              <Input
                type="date"
                value={day}
                min={parisToday()}
                onChange={(e) => setDay(e.target.value)}
                disabled={Boolean(busy)}
                required
              />
            </FormField>
            <Button type="submit" disabled={!day || Boolean(busy)} loading={busy === 'unlock'} className="sm:mb-px">
              {unlocked ? 'Prolonger' : 'Débloquer'}
            </Button>
          </form>

          {/* Aussi proposé si l'état n'a pas pu être lu : reverrouiller est sans risque */}
          {(unlocked || loadError) && (
            <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-text-muted">Refermer l&apos;idée dès maintenant.</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => send(null, 'lock')}
                disabled={Boolean(busy)}
                loading={busy === 'lock'}
              >
                Reverrouiller
              </Button>
            </div>
          )}

          {error && <p role="alert" className="text-danger">{error}</p>}
          {notice && <p role="status" className="text-text">{notice}</p>}
        </div>
      )}
    </Dialog>
  );
}
