// components/ideas/admin/ModerateIdeaDialog.js
// Modération staff : titre et description (PUT /admin/:id), retrait du logo ou du deck
// (DELETE /admin/:id/logo|deck), libellé ou retrait d'un lien (PUT|DELETE /admin/:id/links/:linkId)
import { useEffect, useState } from 'react';
import Modal from '../../ui/Modal';
import Button from '../../ui/Button';
import Input from '../../ui/Input';
import Textarea from '../../ui/Textarea';
import FormField from '../../ui/FormField';
import Skeleton from '../../ui/Skeleton';
import { useApi } from '../../../hooks/useApi';
import useIdeaDetail from './useIdeaDetail';
import {
  DESCRIPTION_MAX_WORDS,
  LINK_LABEL_MAX,
  TITLE_MAX,
  charLength,
  countWords,
  errorText,
  linkDomain,
  safeHttpsHref,
} from '../../../lib/ideation';

const FILE_LABELS = {
  deck: { name: 'Deck', remove: 'Retirer le deck', warn: "Sans deck, l'idée disparaît du catalogue étudiant." },
  logo: { name: 'Logo', remove: 'Retirer le logo', warn: 'Le visuel par défaut sera affiché.' },
};

function SectionTitle({ eyebrow, children }) {
  return (
    <div className="mb-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-text-dim">{eyebrow}</p>
      <h3 className="text-base font-semibold text-text">{children}</h3>
    </div>
  );
}

// Bouton de suppression en deux temps (pas de modale imbriquée)
function ConfirmRemove({ armed, onArm, onCancel, onConfirm, busy, disabled, label }) {
  if (!armed) {
    return (
      <Button variant="ghost" size="sm" onClick={onArm} disabled={disabled} className="text-danger hover:bg-danger/10">
        {label}
      </Button>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-danger">Confirmer ?</span>
      <Button variant="danger" size="sm" onClick={onConfirm} loading={busy} disabled={disabled}>Oui, retirer</Button>
      <Button variant="subtle" size="sm" onClick={onCancel} disabled={busy}>Non</Button>
    </span>
  );
}

export default function ModerateIdeaDialog({ row, onClose, onChanged }) {
  const { put, delete: del } = useApi();
  const open = Boolean(row);
  const { idea, setIdea, loading, error: loadError } = useIdeaDetail(row && row._id, open);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [labels, setLabels] = useState({});
  const [armed, setArmed] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    setLabels({});
    setArmed(null);
    setBusy(null);
    setError(null);
    setNotice(null);
  }, [row]);

  // Formulaire initialisé au chargement de l'idée
  const loadedId = idea ? String(idea._id) : null;
  useEffect(() => {
    if (!idea) return;
    setTitle(idea.title || '');
    setDescription(idea.description || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedId]);

  const close = () => {
    if (!busy) onClose();
  };

  const base = row ? `/api/ideas/admin/${encodeURIComponent(row._id)}` : '';

  // Exécute une modification, met à jour le détail et rafraîchit le tableau
  const run = async (key, request, message) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const res = await request();
      if (res && res.data) setIdea(res.data);
      setArmed(null);
      setNotice(message);
      onChanged();
      return res;
    } catch (err) {
      setError(errorText(err, 'Action impossible'));
      return null;
    } finally {
      setBusy(null);
    }
  };

  const trimmedTitle = title.trim();
  const titleLen = charLength(trimmedTitle);
  const words = countWords(description);
  const titleChanged = idea && trimmedTitle !== (idea.title || '');
  const descriptionChanged = idea && description.trim() !== (idea.description || '').trim();
  const titleError = !trimmedTitle ? 'Le titre est requis' : titleLen > TITLE_MAX ? `${TITLE_MAX} caractères maximum` : null;
  const descriptionError = !description.trim()
    ? 'La description est requise'
    : words > DESCRIPTION_MAX_WORDS ? `${DESCRIPTION_MAX_WORDS} mots maximum` : null;
  const canSave = Boolean(idea) && (titleChanged || descriptionChanged) && !titleError && !descriptionError;

  const saveInfo = async (e) => {
    e.preventDefault();
    if (!canSave) return;
    const body = {};
    if (titleChanged) body.title = trimmedTitle;
    if (descriptionChanged) body.description = description.trim();
    const res = await run('info', () => put(base, body), 'Titre et description enregistrés.');
    if (res && res.data) {
      setTitle(res.data.title || '');
      setDescription(res.data.description || '');
    }
  };

  const removeFile = (kind) =>
    run(kind, () => del(`${base}/${kind}`), `${FILE_LABELS[kind].name} retiré.`);

  const renameLink = async (link) => {
    const value = (labels[link._id] ?? link.label).trim();
    const res = await run(`rename:${link._id}`, () => put(`${base}/links/${encodeURIComponent(link._id)}`, { label: value }), 'Libellé modifié.');
    if (res) {
      setLabels((prev) => {
        const next = { ...prev };
        delete next[link._id];
        return next;
      });
    }
  };

  const removeLink = (link) =>
    run(`link:${link._id}`, () => del(`${base}/links/${encodeURIComponent(link._id)}`), 'Lien retiré.');

  const links = (idea && idea.day2Links) || [];

  return (
    <Modal
      open={open}
      onClose={close}
      title="Modérer l'idée"
      footer={
        <div className="flex justify-end">
          <Button variant="subtle" onClick={close} disabled={Boolean(busy)}>Fermer</Button>
        </div>
      }
    >
      {loading && !idea ? (
        <div className="space-y-3" aria-hidden="true">
          <Skeleton variant="text" width="50%" height={20} />
          <Skeleton variant="rect" height={44} />
          <Skeleton variant="rect" height={96} />
        </div>
      ) : loadError ? (
        <p role="alert" className="text-sm text-danger">{loadError}</p>
      ) : idea ? (
        <div className="space-y-8 text-sm">
          <section aria-labelledby="moderate-info">
            <SectionTitle eyebrow="Fiche"><span id="moderate-info">Titre et description</span></SectionTitle>
            <form onSubmit={saveInfo} className="space-y-4">
              <FormField
                label="Titre"
                required
                error={titleChanged ? titleError : null}
                hint={`${titleLen} / ${TITLE_MAX} caractères`}
              >
                <Input value={title} onChange={(e) => setTitle(e.target.value)} disabled={Boolean(busy)} />
              </FormField>
              <FormField
                label="Description"
                required
                error={descriptionChanged ? descriptionError : null}
                hint={`${words} / ${DESCRIPTION_MAX_WORDS} mots`}
              >
                <Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} disabled={Boolean(busy)} />
              </FormField>
              <div className="flex justify-end">
                <Button type="submit" size="sm" disabled={!canSave || Boolean(busy)} loading={busy === 'info'}>
                  Enregistrer
                </Button>
              </div>
            </form>
          </section>

          <section aria-labelledby="moderate-files">
            <SectionTitle eyebrow="Fichiers"><span id="moderate-files">Deck et logo</span></SectionTitle>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {['deck', 'logo'].map((kind) => {
                const current = idea[kind] && idea[kind].current;
                const count = (idea[kind] && idea[kind].versions && idea[kind].versions.length) || 0;
                return (
                  <li key={kind} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-medium text-text">{FILE_LABELS[kind].name}</p>
                      {current ? (
                        <p className="break-all text-text-muted">
                          <span className="font-mono text-xs">v{current.number}</span> · {current.originalName}
                          {count > 1 ? ` (${count} versions)` : ''}
                        </p>
                      ) : (
                        <p className="text-text-dim">Aucun fichier</p>
                      )}
                      {current && armed === kind && (
                        <p className="mt-1 text-xs text-danger">
                          Toutes les versions seront effacées. {FILE_LABELS[kind].warn}
                        </p>
                      )}
                    </div>
                    {current && (
                      <ConfirmRemove
                        armed={armed === kind}
                        onArm={() => setArmed(kind)}
                        onCancel={() => setArmed(null)}
                        onConfirm={() => removeFile(kind)}
                        busy={busy === kind}
                        disabled={Boolean(busy)}
                        label={FILE_LABELS[kind].remove}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          <section aria-labelledby="moderate-links">
            <SectionTitle eyebrow="Jour 2"><span id="moderate-links">Liens ({links.length})</span></SectionTitle>
            {links.length === 0 ? (
              <p className="text-text-dim">Aucun lien.</p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {links.map((link) => {
                  const href = safeHttpsHref(link.url);
                  const domain = linkDomain(link.url);
                  const value = labels[link._id] ?? link.label;
                  const trimmed = value.trim();
                  const labelError = !trimmed
                    ? 'Le libellé est requis'
                    : charLength(trimmed) > LINK_LABEL_MAX ? `${LINK_LABEL_MAX} caractères maximum` : null;
                  const changed = trimmed !== link.label;
                  return (
                    <li key={link._id} className="space-y-2 px-4 py-3">
                      <p className="min-w-0 break-all text-xs text-text-muted">
                        {href ? (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            className="text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded"
                          >
                            {domain || link.url}
                            <span className="sr-only"> (ouvre un nouvel onglet)</span>
                          </a>
                        ) : (
                          <span>{link.url}</span>
                        )}
                        {link.author && link.author.name ? ` · ajouté par ${link.author.name}` : ''}
                      </p>
                      <form
                        onSubmit={(e) => { e.preventDefault(); if (changed && !labelError) renameLink(link); }}
                        className="flex flex-col gap-2 sm:flex-row sm:items-start"
                      >
                        <FormField label="Libellé" error={changed ? labelError : null} className="flex-1">
                          <Input
                            value={value}
                            onChange={(e) => setLabels((prev) => ({ ...prev, [link._id]: e.target.value }))}
                            disabled={Boolean(busy)}
                          />
                        </FormField>
                        <div className="flex flex-wrap items-center gap-2 sm:pt-7">
                          <Button
                            type="submit"
                            variant="outline"
                            size="sm"
                            disabled={!changed || Boolean(labelError) || Boolean(busy)}
                            loading={busy === `rename:${link._id}`}
                          >
                            Renommer
                          </Button>
                          <ConfirmRemove
                            armed={armed === `link:${link._id}`}
                            onArm={() => setArmed(`link:${link._id}`)}
                            onCancel={() => setArmed(null)}
                            onConfirm={() => removeLink(link)}
                            busy={busy === `link:${link._id}`}
                            disabled={Boolean(busy)}
                            label="Retirer"
                          />
                        </div>
                      </form>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <div aria-live="polite">
            {error && <p role="alert" className="text-danger">{error}</p>}
            {notice && <p role="status" className="text-text">{notice}</p>}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
