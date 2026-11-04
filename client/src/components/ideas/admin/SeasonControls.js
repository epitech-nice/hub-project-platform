// components/ideas/admin/SeasonControls.js
// Réglages de saison : date limite, export ZIP des decks, purge de fin de saison
import { useEffect, useRef, useState } from 'react';
import Button from '../../ui/Button';
import Input from '../../ui/Input';
import Checkbox from '../../ui/Checkbox';
import Skeleton from '../../ui/Skeleton';
import PurgeDialog from './PurgeDialog';
import { useAuth } from '../../../context/AuthContext';
import { useApi } from '../../../hooks/useApi';
import { fetchBlob, saveBlob } from '../../../lib/download';
import { errorText, formatDeadline, isDeadlinePassed } from '../../../lib/ideation';

function Panel({ eyebrow, title, children, tone = 'default', labelId }) {
  return (
    <section
      aria-labelledby={labelId}
      className={
        tone === 'danger'
          ? 'flex flex-col rounded-xl border border-danger/40 bg-danger/5 p-5'
          : 'flex flex-col rounded-xl border border-border bg-surface p-5'
      }
    >
      <p className={tone === 'danger' ? 'text-xs font-semibold uppercase tracking-wider text-danger' : 'text-xs font-semibold uppercase tracking-wider text-text-dim'}>
        {eyebrow}
      </p>
      <h2 id={labelId} className="mt-0.5 text-base font-semibold text-text">{title}</h2>
      <div className="mt-4 flex flex-1 flex-col gap-3 text-sm">{children}</div>
    </section>
  );
}

export default function SeasonControls({ onPurged }) {
  const { token } = useAuth();
  const { get, put } = useApi();

  // Date limite
  const [deadline, setDeadline] = useState(null);
  const [draft, setDraft] = useState('');
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [deadlineBusy, setDeadlineBusy] = useState(null);
  const [deadlineError, setDeadlineError] = useState(null);
  const [deadlineNotice, setDeadlineNotice] = useState(null);
  const settingsRef = useRef(0);

  // Export
  const [includeHidden, setIncludeHidden] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(null);

  // Purge
  const [purgeOpen, setPurgeOpen] = useState(false);

  const loadSettings = async () => {
    const requestId = ++settingsRef.current;
    setSettingsLoading(true);
    setDeadlineError(null);
    try {
      const res = await get('/api/ideas/settings');
      if (requestId !== settingsRef.current) return;
      const value = (res && res.data && res.data.deadlineDate) || null;
      setDeadline(value);
      setDraft(value || '');
    } catch (err) {
      if (requestId !== settingsRef.current) return;
      setDeadlineError(errorText(err, 'Impossible de lire la date limite'));
    } finally {
      if (requestId === settingsRef.current) setSettingsLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
    // get n'est pas mémorisé : loadSettings l'utilise sans être une dépendance
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveDeadline = async (value, kind) => {
    setDeadlineBusy(kind);
    setDeadlineError(null);
    setDeadlineNotice(null);
    // Une lecture encore en vol ne doit pas écraser la valeur enregistrée
    settingsRef.current += 1;
    try {
      const res = await put('/api/ideas/admin/deadline', { deadlineDate: value });
      const saved = (res && res.data && res.data.deadlineDate) || null;
      setDeadline(saved);
      setDraft(saved || '');
      setSettingsLoading(false);
      setDeadlineNotice(saved ? 'Date limite enregistrée.' : 'Date limite retirée : les dépôts restent ouverts.');
    } catch (err) {
      setDeadlineError(errorText(err, "La date limite n'a pas pu être enregistrée"));
    } finally {
      setDeadlineBusy(null);
    }
  };

  const submitDeadline = (e) => {
    e.preventDefault();
    if (!draft || draft === deadline) return;
    saveDeadline(draft, 'save');
  };

  const exportDecks = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const blob = await fetchBlob(`/api/ideas/admin/export?includeHidden=${includeHidden ? 'true' : 'false'}`, token);
      saveBlob(blob, 'decks-idees.zip');
    } catch (err) {
      setExportError(err.message || 'Export impossible');
    } finally {
      setExporting(false);
    }
  };

  const handlePurged = () => {
    loadSettings();
    onPurged();
  };

  const passed = isDeadlinePassed(deadline);
  const deadlineLabel = formatDeadline(deadline);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Panel eyebrow="Calendrier" title="Date limite de dépôt" labelId="season-deadline">
        {settingsLoading ? (
          <Skeleton variant="text" width="70%" />
        ) : (
          <p className="text-text-muted" aria-live="polite">
            {deadlineLabel ? (
              <>
                <span className="font-medium text-text">{deadlineLabel}</span>, 23 h 59 (Paris)
                {passed ? ' : dépassée, les dépôts sont fermés.' : '.'}
              </>
            ) : (
              'Aucune date limite : les dépôts sont ouverts.'
            )}
          </p>
        )}
        <form onSubmit={submitDeadline} className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label htmlFor="season-deadline-input" className="sr-only">Nouvelle date limite</label>
          <Input
            id="season-deadline-input"
            type="date"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={settingsLoading || Boolean(deadlineBusy)}
            className="sm:flex-1"
          />
          <Button
            type="submit"
            size="sm"
            disabled={settingsLoading || !draft || draft === deadline || Boolean(deadlineBusy)}
            loading={deadlineBusy === 'save'}
          >
            Enregistrer
          </Button>
        </form>
        {deadline && (
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => saveDeadline(null, 'clear')}
              disabled={Boolean(deadlineBusy)}
              loading={deadlineBusy === 'clear'}
            >
              Retirer la date limite
            </Button>
          </div>
        )}
        {deadlineError && <p role="alert" className="text-danger">{deadlineError}</p>}
        {deadlineNotice && <p role="status" className="text-text">{deadlineNotice}</p>}
      </Panel>

      <Panel eyebrow="Export" title="Decks de la saison" labelId="season-export">
        <p className="text-text-muted">
          Archive ZIP du deck courant de chaque idée, nommé d&apos;après son titre.
        </p>
        <Checkbox
          label="Inclure les idées masquées"
          checked={includeHidden}
          onChange={(e) => setIncludeHidden(e.target.checked)}
          disabled={exporting}
        />
        <div className="mt-auto">
          <Button variant="outline" size="sm" onClick={exportDecks} loading={exporting}>
            Exporter les decks (ZIP)
          </Button>
        </div>
        {exportError && <p role="alert" className="text-danger">{exportError}</p>}
      </Panel>

      <Panel eyebrow="Zone sensible" title="Fin de saison" tone="danger" labelId="season-purge">
        <p className="text-text-muted">
          Efface toutes les idées, groupes, fichiers et historiques, ainsi que la date limite. Irréversible.
        </p>
        <div className="mt-auto">
          <Button variant="danger" size="sm" onClick={() => setPurgeOpen(true)}>
            Purger la saison
          </Button>
        </div>
      </Panel>

      <PurgeDialog open={purgeOpen} onClose={() => setPurgeOpen(false)} onPurged={handlePurged} />
    </div>
  );
}
