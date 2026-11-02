// components/ideas/admin/RosterImportDialog.js
// Import de la promotion (CSV) en deux temps, sans état serveur : « Analyser » envoie le fichier
// à /roster/preview (rien n'est enregistré), « Confirmer » renvoie le MÊME fichier à /roster
// qui remplace la liste. Le contenu du fichier n'est jamais affiché en HTML ni conservé.
import { useEffect, useRef, useState } from 'react';
import Modal from '../../ui/Modal';
import Button from '../../ui/Button';
import FileInput from '../../ui/FileInput';
import { useApi } from '../../../hooks/useApi';
import { errorText, formatBytes } from '../../../lib/ideation';

const MAX_SIZE = 1024 * 1024; // 1 Mo, comme le serveur

const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;

const uploadForm = (file) => {
  const form = new FormData();
  form.append('file', file);
  return form;
};

export default function RosterImportDialog({ open, onClose, onImported }) {
  const { post } = useApi();
  const [file, setFile] = useState(null);
  const [fileKey, setFileKey] = useState(0); // change pour vider le champ fichier
  const [fileError, setFileError] = useState(null);
  const [preview, setPreview] = useState(null);
  // Fichier pour lequel `preview` a été calculé : la confirmation exige que ce soit le fichier courant
  const [previewFile, setPreviewFile] = useState(null);
  const fileRef = useRef(null); // dernière valeur de `file`, lisible après un await
  const pickerRef = useRef(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null); // null | 'preview' | 'import'
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!open) return;
    fileRef.current = null;
    setFile(null);
    setFileKey((k) => k + 1);
    setFileError(null);
    setPreview(null);
    setPreviewFile(null);
    setError(null);
    setBusy(null);
    setResult(null);
  }, [open]);

  // Sélecteur de fichier inerte pendant une requête (bloque aussi le clavier là où `inert` existe)
  useEffect(() => {
    const el = pickerRef.current;
    if (!el) return;
    if (busy) el.setAttribute('inert', '');
    else el.removeAttribute('inert');
  }, [busy, open]);

  const close = () => {
    if (!busy) onClose();
  };

  // Un autre fichier invalide l'aperçu : il faut relancer l'analyse
  // Sans effet pendant une requête : le fichier ne change pas sous une analyse ou un import en cours
  const handleFile = (f) => {
    if (busy) return;
    setPreview(null);
    setPreviewFile(null);
    setError(null);
    setResult(null);
    if (f && f.size > MAX_SIZE) {
      fileRef.current = null;
      setFile(null);
      setFileKey((k) => k + 1);
      setFileError(`Fichier trop volumineux (${formatBytes(f.size)}) : 1 Mo maximum.`);
      return;
    }
    setFileError(null);
    fileRef.current = f || null;
    setFile(f || null);
  };

  const analyze = async () => {
    if (!file || busy) return;
    const analysed = file;
    setBusy('preview');
    setError(null);
    setPreview(null);
    setPreviewFile(null);
    try {
      const res = await post('/api/ideas/admin/roster/preview', uploadForm(analysed));
      // Le fichier courant a changé entre-temps : cette réponse ne le concerne pas
      if (fileRef.current !== analysed) return;
      setPreview((res && res.data) || null);
      setPreviewFile(analysed);
    } catch (err) {
      if (fileRef.current !== analysed) return;
      setError(errorText(err, "Le fichier n'a pas pu être analysé"));
    } finally {
      setBusy(null);
    }
  };

  const confirm = async () => {
    // L'aperçu doit avoir été calculé pour CE fichier (vérifié ici, pas seulement via `disabled`)
    if (!file || !preview || previewFile !== file || fileRef.current !== file || preview.valid <= 0 || busy) return;
    setBusy('import');
    setError(null);
    try {
      const res = await post('/api/ideas/admin/roster', uploadForm(file));
      const d = (res && res.data) || {};
      setResult({
        imported: Number(d.imported) || 0,
        removed: Number(d.removed) || 0,
        duplicates: Number(d.duplicates) || 0,
        invalidCount: Number(d.invalidCount) || 0,
      });
      onImported();
    } catch (err) {
      setError(errorText(err, "L'import a échoué : la liste actuelle n'a pas été modifiée"));
    } finally {
      setBusy(null);
    }
  };

  const invalidList = preview && Array.isArray(preview.invalid) ? preview.invalid : [];
  const sample = preview && Array.isArray(preview.sample) ? preview.sample : [];
  const hiddenInvalid = preview ? Math.max(0, (Number(preview.invalidCount) || 0) - invalidList.length) : 0;
  const canConfirm = Boolean(preview) && preview.valid > 0 && Boolean(file) && previewFile === file && !busy;

  const footer = result ? (
    <div className="flex justify-end">
      <Button onClick={close}>Fermer</Button>
    </div>
  ) : (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button variant="subtle" onClick={close} disabled={Boolean(busy)}>Annuler</Button>
      <Button variant="outline" onClick={analyze} disabled={!file || Boolean(busy)} loading={busy === 'preview'}>
        Analyser
      </Button>
      <Button onClick={confirm} disabled={!canConfirm} loading={busy === 'import'}>
        Confirmer l&apos;import
      </Button>
    </div>
  );

  return (
    <Modal open={open} onClose={close} title="Importer la promotion" footer={footer}>
      {result ? (
        <div role="status" className="space-y-3 text-sm">
          <p className="text-base font-semibold text-text">Import terminé</p>
          <ul className="space-y-1 text-text-muted">
            <li><span className="font-mono tabular-nums text-text">{result.imported}</span> {result.imported > 1 ? 'étudiants importés' : 'étudiant importé'}</li>
            <li><span className="font-mono tabular-nums text-text">{result.removed}</span> {result.removed > 1 ? 'entrées retirées' : 'entrée retirée'} de l&apos;ancienne liste</li>
            <li><span className="font-mono tabular-nums text-text">{result.duplicates}</span> {result.duplicates > 1 ? 'doublons ignorés' : 'doublon ignoré'}</li>
            <li><span className="font-mono tabular-nums text-text">{result.invalidCount}</span> {result.invalidCount > 1 ? 'lignes invalides ignorées' : 'ligne invalide ignorée'}</li>
          </ul>
        </div>
      ) : (
        <div className="space-y-4 text-sm text-text-muted">
          <p>
            Fichier CSV (UTF-8, séparateur virgule ou point-virgule) avec une colonne email obligatoire ;
            les colonnes nom et prénom sont facultatives. 2 000 lignes et 1 Mo maximum.
          </p>

          <div className="space-y-1.5">
            {/* Non interactif pendant une requête : inert (posé par effet), clics et touches bloqués en capture */}
            <div
              ref={pickerRef}
              aria-disabled={busy ? 'true' : undefined}
              onClickCapture={busy ? (e) => { e.preventDefault(); e.stopPropagation(); } : undefined}
              onKeyDownCapture={busy ? (e) => { e.preventDefault(); e.stopPropagation(); } : undefined}
              onDropCapture={busy ? (e) => { e.preventDefault(); e.stopPropagation(); } : undefined}
              className={busy ? 'pointer-events-none opacity-60' : undefined}
            >
              <FileInput key={fileKey} accept=".csv" onChange={handleFile} />
            </div>
            <p className="text-xs text-text-dim">CSV, 1 Mo maximum</p>
            {fileError && <p role="alert" className="text-xs text-danger">{fileError}</p>}
          </div>

          {error && <p role="alert" className="rounded-lg border border-danger/40 bg-danger/5 px-4 py-3 text-danger">{error}</p>}

          {preview && (
            <div className="space-y-3" aria-live="polite">
              <p className="font-semibold text-text">Aperçu de l&apos;analyse</p>
              <ul className="space-y-1">
                <li><span className="font-mono tabular-nums text-text">{preview.valid}</span> {preview.valid > 1 ? 'lignes valides' : 'ligne valide'}</li>
                <li><span className="font-mono tabular-nums text-text">{preview.duplicates}</span> {preview.duplicates > 1 ? 'doublons ignorés' : 'doublon ignoré'}</li>
                <li><span className="font-mono tabular-nums text-text">{preview.invalidCount}</span> {preview.invalidCount > 1 ? 'lignes invalides (ignorées)' : 'ligne invalide (ignorée)'}</li>
              </ul>

              {invalidList.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-text-dim">Lignes invalides</p>
                  <ul className="max-h-40 space-y-0.5 overflow-y-auto rounded-lg border border-border bg-surface-2 px-3 py-2">
                    {invalidList.map((row, i) => (
                      <li key={`${row.line}-${i}`} className="break-all text-xs">
                        <span className="font-mono text-text-dim">Ligne {row.line}</span>
                        {' : '}
                        <span className="font-mono text-text">{row.value === '' ? '(vide)' : row.value}</span>
                      </li>
                    ))}
                  </ul>
                  {hiddenInvalid > 0 && (
                    <p className="mt-1 text-xs text-text-dim">
                      et {plural(hiddenInvalid, 'autre ligne invalide', 'autres lignes invalides')} non listées.
                    </p>
                  )}
                </div>
              )}

              {sample.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-text-dim">Exemple de lignes lues</p>
                  <ul className="space-y-1 rounded-lg border border-border bg-surface-2 px-3 py-2">
                    {sample.map((s, i) => (
                      <li key={`${s.email}-${i}`} className="min-w-0 text-xs">
                        <span className="text-text">{[s.lastName, s.firstName].filter(Boolean).join(' ') || '(sans nom)'}</span>
                        {' · '}
                        <span className="break-all font-mono text-text-muted">{s.email}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {preview.valid > 0 && (
                <p
                  role="note"
                  className="rounded-lg border px-4 py-3"
                  style={{
                    backgroundColor: 'rgb(var(--status-changes-bg))',
                    borderColor: 'rgb(var(--status-changes-text) / 0.35)',
                    color: 'rgb(var(--status-changes-text))',
                  }}
                >
                  Attention : la confirmation remplace entièrement la liste actuelle de la promotion
                  (les entrées absentes de ce fichier seront supprimées). Elle ne se fusionne pas avec l&apos;ancienne.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
