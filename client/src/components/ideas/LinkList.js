import { useState } from 'react';
import { useApi } from '../../hooks/useApi';
import {
  LINKS_MAX,
  LINK_LABEL_MAX,
  charLength,
  errorText,
  formatDate,
  knownService,
  linkDomain,
  safeHttpsHref,
  validateLinkUrl,
} from '../../lib/ideation';
import FormField from '../ui/FormField';
import Input from '../ui/Input';
import Button from '../ui/Button';
import Modal from '../ui/Modal';

export const PRIVATE_LINK_HELP =
  'Vérifiez que le lien est lisible par toute personne connectée. Un lien privé ne pourra pas être ouvert par les autres étudiants ni par le staff.';
export const NOT_FROZEN_NOTE =
  "Le contenu derrière un lien n'est pas figé par le hub : son propriétaire peut encore le modifier après la date limite.";

const ExternalIcon = () => (
  <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    <path d="M11 3h6v6M17 3l-8 8M15 11v5a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1h5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * LinkList — liens du jour 2. Lecture pour tous ; ajout et retrait si `editable`.
 * Seuls les href en https:// sont rendus (défensif, le serveur les valide déjà).
 *
 * Props: ideaId, links, editable, disabled, onUpdated(idea) appelé avec la réponse du serveur.
 */
export default function LinkList({ ideaId, links = [], editable = false, disabled = false, onUpdated }) {
  const { post, delete: deleteRequest } = useApi();
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [adding, setAdding] = useState(false);
  const [toRemove, setToRemove] = useState(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState(null);

  const full = links.length >= LINKS_MAX;

  const handleAdd = async (e) => {
    e.preventDefault();
    const errors = {};
    const cleanLabel = label.trim();
    if (!cleanLabel) errors.label = 'Le libellé est requis';
    else if (charLength(cleanLabel) > LINK_LABEL_MAX) errors.label = `${LINK_LABEL_MAX} caractères maximum`;
    const checked = validateLinkUrl(url);
    if (!checked.ok) errors.url = checked.error;
    setFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length > 0) return;

    setAdding(true);
    try {
      const res = await post(`/api/ideas/${ideaId}/links`, { label: cleanLabel, url: checked.url });
      setLabel('');
      setUrl('');
      onUpdated?.(res.data);
    } catch (err) {
      setFormError(errorText(err));
    } finally {
      setAdding(false);
    }
  };

  const confirmRemove = async () => {
    if (!toRemove) return;
    setRemoving(true);
    setRemoveError(null);
    try {
      const res = await deleteRequest(`/api/ideas/${ideaId}/links/${toRemove._id}`);
      setToRemove(null);
      onUpdated?.(res.data);
    } catch (err) {
      setRemoveError(errorText(err));
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {links.length === 0 ? (
        <p className="text-sm text-text-muted">Aucun document du jour 2 pour l&apos;instant.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {links.map((link) => {
            const href = safeHttpsHref(link.url);
            const domain = linkDomain(link.url);
            const service = knownService(domain);
            return (
              <li
                key={link._id || link.url}
                className="flex flex-col gap-2 rounded-lg border border-border bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="inline-flex max-w-full items-center gap-1.5 rounded text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                    >
                      <span className="truncate">{link.label}</span>
                      <ExternalIcon />
                      <span className="sr-only">(ouvre un nouvel onglet)</span>
                    </a>
                  ) : (
                    <span className="text-sm font-semibold text-text">{link.label}</span>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-dim">
                    {service && (
                      <span className="rounded-full border border-border bg-surface-2 px-2 py-0.5 font-medium text-text-muted">
                        {service}
                      </span>
                    )}
                    <span className="font-mono break-all">{domain || 'lien non affichable'}</span>
                    {link.author && link.author.name && (
                      <span>· ajouté par {link.author.name}, {formatDate(link.createdAt)}</span>
                    )}
                  </div>
                </div>
                {editable && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={disabled}
                    onClick={() => { setRemoveError(null); setToRemove(link); }}
                    aria-label={`Retirer le lien ${link.label}`}
                    className="self-start sm:self-auto"
                  >
                    Retirer
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs text-text-dim">{NOT_FROZEN_NOTE}</p>

      {editable && (
        <form onSubmit={handleAdd} noValidate className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-4">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-text">Ajouter un lien</p>
            <span className="text-xs tabular-nums text-text-dim">{links.length} / {LINKS_MAX}</span>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_2fr]">
            <FormField label="Libellé" required error={fieldErrors.label}>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={LINK_LABEL_MAX * 2}
                placeholder="Ex. Business model canvas"
                disabled={disabled || full}
                error={Boolean(fieldErrors.label)}
              />
            </FormField>
            <FormField label="Lien (https://)" required error={fieldErrors.url} hint={PRIVATE_LINK_HELP}>
              <Input
                type="url"
                inputMode="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://"
                disabled={disabled || full}
                error={Boolean(fieldErrors.url)}
              />
            </FormField>
          </div>
          {fieldErrors.url && <p className="text-xs text-text-dim">{PRIVATE_LINK_HELP}</p>}
          {full && <p className="text-sm text-text-muted">Maximum de {LINKS_MAX} liens atteint.</p>}
          {formError && <p role="alert" className="text-sm text-danger">{formError}</p>}
          <div>
            <Button type="submit" size="sm" loading={adding} disabled={disabled || full}>
              Ajouter le lien
            </Button>
          </div>
        </form>
      )}

      <Modal
        open={Boolean(toRemove)}
        onClose={() => !removing && setToRemove(null)}
        title="Retirer ce lien ?"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="subtle" onClick={() => setToRemove(null)} disabled={removing}>Annuler</Button>
            <Button variant="danger" onClick={confirmRemove} loading={removing}>Retirer</Button>
          </div>
        }
      >
        <p className="text-sm text-text-muted">
          Le lien « {toRemove && toRemove.label} » sera retiré de l&apos;idée. Il n&apos;y a pas d&apos;historique des liens.
        </p>
        {removeError && <p role="alert" className="mt-3 text-sm text-danger">{removeError}</p>}
      </Modal>
    </div>
  );
}
