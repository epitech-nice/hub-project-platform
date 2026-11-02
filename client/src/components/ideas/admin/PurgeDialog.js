// components/ideas/admin/PurgeDialog.js
// Purge de fin de saison (DELETE /api/ideas/admin/purge, { confirm: 'PURGER' }) : irréversible
import { useEffect, useState } from 'react';
import Modal from '../../ui/Modal';
import Button from '../../ui/Button';
import Input from '../../ui/Input';
import FormField from '../../ui/FormField';
import { useApi } from '../../../hooks/useApi';
import { errorText } from '../../../lib/ideation';

const CONFIRM_WORD = 'PURGER';

export default function PurgeDialog({ open, onClose, onPurged }) {
  const { delete: del } = useApi();
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!open) return;
    setWord('');
    setBusy(false);
    setError(null);
    setResult(null);
  }, [open]);

  const close = () => {
    if (!busy) onClose();
  };

  const confirm = async (e) => {
    e.preventDefault();
    if (word !== CONFIRM_WORD || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await del('/api/ideas/admin/purge', { confirm: CONFIRM_WORD });
      const data = (res && res.data) || {};
      setResult({ ideas: Number(data.ideas) || 0, files: Number(data.files) || 0 });
      onPurged();
    } catch (err) {
      setError(errorText(err, 'Purge impossible'));
      // Une purge partielle a déjà vidé la base : le tableau doit le refléter
      onPurged();
    } finally {
      setBusy(false);
    }
  };

  const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;

  return (
    <Modal
      open={open}
      onClose={close}
      title="Purger la saison"
      footer={
        result ? (
          <div className="flex justify-end">
            <Button onClick={close}>Fermer</Button>
          </div>
        ) : (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="subtle" onClick={close} disabled={busy}>Annuler</Button>
            <Button
              type="submit"
              form="purge-form"
              variant="danger"
              disabled={word !== CONFIRM_WORD}
              loading={busy}
            >
              Purger définitivement
            </Button>
          </div>
        )
      }
    >
      {result ? (
        <div role="status" className="space-y-2 text-sm">
          <p className="text-base font-semibold text-text">Purge terminée</p>
          <p className="text-text-muted">
            {plural(result.ideas, 'idée supprimée', 'idées supprimées')} et{' '}
            {plural(result.files, 'fichier effacé', 'fichiers effacés')} du stockage. La date limite a été retirée.
          </p>
        </div>
      ) : (
        <form id="purge-form" onSubmit={confirm} className="space-y-4 text-sm text-text-muted">
          <p>Cette action efface toute la saison d&apos;idéation, sans retour possible :</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>toutes les idées, y compris les idées masquées ;</li>
            <li>tous les groupes, invitations et liens du jour 2 ;</li>
            <li>tous les fichiers déposés (decks et logos, toutes versions) et leur historique ;</li>
            <li>la date limite de dépôt.</li>
          </ul>
          <p
            className="rounded-lg border px-4 py-3"
            style={{
              backgroundColor: 'rgb(var(--status-changes-bg))',
              borderColor: 'rgb(var(--status-changes-text) / 0.35)',
              color: 'rgb(var(--status-changes-text))',
            }}
          >
            Avant de purger, prévenez les étudiants et laissez-leur 1 à 2 semaines pour télécharger leurs fichiers.
            Pensez aussi à exporter les decks si vous devez les conserver.
          </p>
          <FormField
            label={`Pour confirmer, saisissez ${CONFIRM_WORD}`}
            hint="En majuscules, exactement."
            error={word && word !== CONFIRM_WORD && word.length >= CONFIRM_WORD.length ? 'Le mot ne correspond pas' : null}
          >
            <Input
              value={word}
              onChange={(e) => setWord(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              disabled={busy}
              className="font-mono tracking-widest"
            />
          </FormField>
          {error && <p role="alert" className="text-danger">{error}</p>}
        </form>
      )}
    </Modal>
  );
}
