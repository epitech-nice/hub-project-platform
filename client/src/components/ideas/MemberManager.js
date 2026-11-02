import { useEffect, useRef, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { GROUP_MAX, GROUP_MIN, errorText, formatDate, withCreatorFlag } from '../../lib/ideation';
import FormField from '../ui/FormField';
import Input from '../ui/Input';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Modal from '../ui/Modal';

const SEARCH_MIN = 3;

// Liste des membres ; chaque entrée porte `isCreator` calculé par l'appelant
export function MemberRows({ members = [], renderAction }) {
  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {members.map((m, i) => {
        const isCreator = Boolean(m.isCreator);
        return (
          <li key={m.userId || `${m.name}-${i}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
                aria-hidden="true"
              >
                {(String(m.name || '?').trim()[0] || '?').toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-text">{m.name}</p>
                {m.status === 'pending' && m.invitedAt && (
                  <p className="text-xs text-text-dim">Invité le {formatDate(m.invitedAt)}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isCreator && <Badge variant="new" size="sm">Créateur</Badge>}
              {m.status === 'pending' && <Badge variant="pending" size="sm">En attente</Badge>}
              {renderAction && renderAction(m, isCreator)}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * MemberManager — gestion du groupe par le créateur : recherche d'étudiants (nom ou login,
 * 3 caractères minimum), invitation, retrait. Le serveur reste l'autorité (plafond de 6, doublons).
 *
 * Props: idea (forme toDetail vue par le créateur : userId présents), disabled, onUpdated(idea).
 */
export default function MemberManager({ idea, disabled = false, onUpdated }) {
  const { get, post, delete: deleteRequest } = useApi();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [inviting, setInviting] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [toRemove, setToRemove] = useState(null);
  const [removing, setRemoving] = useState(false);
  const requestRef = useRef(0);

  const members = withCreatorFlag(idea);
  const listedIds = new Set(members.map((m) => String(m.userId)));
  const accepted = members.filter((m) => m.status === 'accepted').length;
  const full = members.length >= GROUP_MAX;
  const term = query.trim();

  // Recherche avec anti-rebond ; réponses périmées ignorées
  useEffect(() => {
    if (term.length < SEARCH_MIN || disabled) {
      setResults([]);
      setSearched(false);
      setSearchError(null);
      return undefined;
    }
    const requestId = ++requestRef.current;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await get('/api/users/search', { q: term });
        if (requestId !== requestRef.current) return;
        setResults(Array.isArray(res.data) ? res.data : []);
        setSearchError(null);
      } catch (err) {
        if (requestId !== requestRef.current) return;
        setResults([]);
        setSearchError(errorText(err));
      } finally {
        if (requestId === requestRef.current) {
          setSearching(false);
          setSearched(true);
        }
      }
    }, 300);
    return () => clearTimeout(timer);
    // get n'est pas mémorisé : volontairement absent des dépendances
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, disabled]);

  const invite = async (user) => {
    setInviting(user._id);
    setActionError(null);
    try {
      const res = await post(`/api/ideas/${idea._id}/members`, { userId: user._id });
      onUpdated?.(res.data);
      setQuery('');
    } catch (err) {
      setActionError(errorText(err));
    } finally {
      setInviting(null);
    }
  };

  const confirmRemove = async () => {
    if (!toRemove) return;
    setRemoving(true);
    setActionError(null);
    try {
      const res = await deleteRequest(`/api/ideas/${idea._id}/members/${toRemove.userId}`);
      setToRemove(null);
      onUpdated?.(res.data);
    } catch (err) {
      setToRemove(null);
      setActionError(errorText(err));
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-text-muted">
        {accepted} membre{accepted > 1 ? 's' : ''} accepté{accepted > 1 ? 's' : ''} · {members.length}/{GROUP_MAX} places
        occupées (invitations en attente comprises). Le groupe est complet à partir de {GROUP_MIN} membres acceptés.
      </p>

      <MemberRows
        members={members}
        renderAction={(m, isCreator) =>
          !isCreator && m.userId ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={disabled}
              onClick={() => setToRemove(m)}
              aria-label={m.status === 'pending' ? `Annuler l'invitation de ${m.name}` : `Retirer ${m.name} du groupe`}
            >
              {m.status === 'pending' ? 'Annuler' : 'Retirer'}
            </Button>
          ) : null
        }
      />

      <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-4">
        <FormField
          label="Inviter un étudiant"
          hint={full ? `Le groupe a atteint ${GROUP_MAX} places.` : 'Nom ou login, 3 caractères minimum.'}
        >
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ex. dupont ou jean.dupont"
            disabled={disabled || full}
            autoComplete="off"
          />
        </FormField>

        <div aria-live="polite">
          {searching && <p className="text-sm text-text-muted">Recherche…</p>}
          {!searching && searchError && <p role="alert" className="text-sm text-danger">{searchError}</p>}
          {!searching && !searchError && searched && results.length === 0 && (
            <p className="text-sm text-text-muted">
              Introuvable : l&apos;étudiant doit d&apos;abord se connecter au hub.
            </p>
          )}
        </div>

        {!searching && results.length > 0 && (
          <ul className="divide-y divide-border rounded-md border border-border">
            {results.map((u) => {
              const already = listedIds.has(String(u._id));
              return (
                <li key={u._id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text">{u.name}</p>
                    <p className="truncate font-mono text-xs text-text-dim">{u.login}</p>
                  </div>
                  {already ? (
                    <span className="text-xs text-text-dim">Déjà dans le groupe</span>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      loading={inviting === u._id}
                      disabled={disabled || full || (inviting !== null && inviting !== u._id)}
                      onClick={() => invite(u)}
                      aria-label={`Inviter ${u.name}`}
                    >
                      Inviter
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {actionError && <p role="alert" className="text-sm text-danger">{actionError}</p>}
      </div>

      <Modal
        open={Boolean(toRemove)}
        onClose={() => !removing && setToRemove(null)}
        title={toRemove && toRemove.status === 'pending' ? "Annuler l'invitation ?" : 'Retirer ce membre ?'}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="subtle" onClick={() => setToRemove(null)} disabled={removing}>Annuler</Button>
            <Button variant="danger" onClick={confirmRemove} loading={removing}>Confirmer</Button>
          </div>
        }
      >
        <p className="text-sm text-text-muted">
          {toRemove && toRemove.name}{' '}
          {toRemove && toRemove.status === 'pending'
            ? "ne pourra plus accepter l'invitation."
            : "ne fera plus partie du groupe et perdra l'accès à la modification de l'idée."}
        </p>
      </Modal>
    </div>
  );
}
