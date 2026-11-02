// components/ideas/admin/DeleteIdeaDialog.js
// Suppression définitive d'une idée (DELETE /api/ideas/admin/:id), après case à cocher explicite
import { useEffect, useState } from 'react';
import Dialog from '../../ui/Dialog';
import Button from '../../ui/Button';
import Checkbox from '../../ui/Checkbox';
import { useApi } from '../../../hooks/useApi';
import { errorText } from '../../../lib/ideation';

export default function DeleteIdeaDialog({ row, onClose, onDeleted }) {
  const { delete: del } = useApi();
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const open = Boolean(row);

  // Réinitialise la confirmation à chaque ouverture
  useEffect(() => {
    setAcknowledged(false);
    setError(null);
    setBusy(false);
  }, [row]);

  const close = () => {
    if (!busy) onClose();
  };

  const confirm = async () => {
    if (!row || !acknowledged) return;
    setBusy(true);
    setError(null);
    try {
      await del(`/api/ideas/admin/${encodeURIComponent(row._id)}`);
      setBusy(false);
      onDeleted(row);
    } catch (err) {
      setError(errorText(err, 'Suppression impossible'));
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Supprimer l'idée"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="subtle" onClick={close} disabled={busy}>Annuler</Button>
          <Button variant="danger" onClick={confirm} disabled={!acknowledged} loading={busy}>
            Supprimer définitivement
          </Button>
        </div>
      }
    >
      {row && (
        <div className="space-y-4 text-sm text-text-muted">
          <p>
            Vous allez supprimer <span className="font-semibold text-text break-words">« {row.title} »</span>.
          </p>
          <p>
            La suppression est <span className="font-semibold text-text">définitive</span> : la fiche, le groupe
            et ses invitations, les liens, tous les fichiers (deck et logo, toutes versions) et leur historique
            sont effacés. Rien ne pourra être restauré.
          </p>
          <Checkbox
            label="Je comprends que cette suppression est définitive"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            disabled={busy}
          />
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        </div>
      )}
    </Dialog>
  );
}
