// components/ideas/admin/SansProjetTab.js
// Onglet « Sans projet » : étudiants de la promotion importée qui n'ont aucun groupe accepté.
// Compteurs par statut, tableau, recherche, import CSV et vidage de la liste.
import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import DataTable from '../../ui/DataTable';
import TableToolbar from '../../ui/TableToolbar';
import KpiCard from '../../ui/KpiCard';
import Badge from '../../ui/Badge';
import Button from '../../ui/Button';
import Modal from '../../ui/Modal';
import EmptyState from '../../ui/EmptyState';
import RosterImportDialog from './RosterImportDialog';
import { useApi } from '../../../hooks/useApi';
import { errorText } from '../../../lib/ideation';

const STATUS = {
  never_connected: { label: 'Jamais connecté', variant: 'neutral' },
  no_project: { label: 'Connecté, sans projet', variant: 'changes' },
  invited_only: { label: 'Invitation en attente', variant: 'pending' },
};

const NEVER_CONNECTED_HINT =
  'Jamais connecté : ne peut pas être invité avant sa première connexion au hub';

export default function SansProjetTab({ refreshKey = 0 }) {
  const { get, delete: del } = useApi();

  const [searchInput, setSearchInput] = useState('');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const requestRef = useRef(0);

  const [importOpen, setImportOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState(null);

  // Anti-rebond de la recherche
  useEffect(() => {
    const timer = setTimeout(() => setQ(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const fetchRows = async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (q) params.q = q;
      const res = await get('/api/ideas/admin/roster/without-project', params);
      if (requestId !== requestRef.current) return;
      setRows(Array.isArray(res.data) ? res.data : []);
      setCounts(res.counts || null);
    } catch (err) {
      if (requestId !== requestRef.current) return;
      setRows([]);
      setCounts(null);
      setError(errorText(err, 'Impossible de charger la liste'));
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    fetchRows();
    // get n'est pas mémorisé : fetchRows l'utilise sans être une dépendance
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, refreshKey]);

  const closeClear = () => {
    if (!clearing) setClearOpen(false);
  };

  const clearRoster = async () => {
    if (clearing) return;
    setClearing(true);
    setClearError(null);
    try {
      const res = await del('/api/ideas/admin/roster');
      const removed = Number(res && res.data && res.data.removed) || 0;
      setClearOpen(false);
      toast.success(`Liste vidée (${removed} ${removed > 1 ? 'entrées supprimées' : 'entrée supprimée'})`);
      fetchRows();
    } catch (err) {
      setClearError(errorText(err, 'La liste n\'a pas pu être vidée'));
    } finally {
      setClearing(false);
    }
  };

  const columns = [
    {
      key: 'lastName',
      label: 'Nom',
      className: 'min-w-[12rem]',
      render: (_, row) => {
        const name = [row.lastName, row.firstName].filter(Boolean).join(' ');
        return name ? <span className="break-words font-medium text-text">{name}</span> : <span className="text-text-dim">—</span>;
      },
    },
    {
      key: 'email',
      label: 'Email',
      className: 'min-w-[14rem]',
      render: (email) => <span className="break-all text-text-muted">{email}</span>,
    },
    {
      key: 'status',
      label: 'Statut',
      className: 'min-w-[14rem]',
      render: (status) => {
        const s = STATUS[status] || { label: status, variant: 'neutral' };
        return (
          <div className="flex flex-col items-start gap-1">
            <Badge variant={s.variant} size="sm" dot>{s.label}</Badge>
            {status === 'never_connected' && (
              <p className="max-w-xs text-xs text-text-dim">{NEVER_CONNECTED_HINT}</p>
            )}
          </div>
        );
      },
    },
  ];

  const total = counts ? counts.total : null;
  const val = (key) => (counts ? counts[key] : '—');
  const filtersActive = Boolean(searchInput.trim());

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard label="Jamais connectés" value={val('never_connected')} sub="pas de compte hub" />
        <KpiCard
          label="Connectés sans projet"
          value={val('no_project')}
          variant={counts && counts.no_project > 0 ? 'warning' : 'default'}
        />
        <KpiCard label="Invitation en attente" value={val('invited_only')} sub="seulement" />
      </div>

      <TableToolbar
        search={searchInput}
        onSearch={setSearchInput}
        searchPlaceholder="Nom ou email"
        className="rounded-xl border border-border bg-surface p-4"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>Importer la promotion</Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-danger hover:bg-danger/10"
              onClick={() => { setClearError(null); setClearOpen(true); }}
            >
              Vider la liste
            </Button>
          </>
        }
      />

      <p className="text-sm text-text-muted" aria-live="polite">
        {loading ? 'Chargement…' : `${total === null ? 0 : total} étudiant${total > 1 ? 's' : ''} sans projet`}
      </p>

      {error ? (
        <EmptyState
          title="La liste n'a pas pu être chargée"
          sub={error}
          action={<Button variant="outline" onClick={fetchRows}>Réessayer</Button>}
        />
      ) : !loading && rows.length === 0 ? (
        filtersActive ? (
          <EmptyState
            title="Aucun étudiant ne correspond"
            sub="Aucune entrée de la liste ne correspond à cette recherche."
            action={<Button variant="outline" onClick={() => setSearchInput('')}>Effacer la recherche</Button>}
          />
        ) : (
          <EmptyState
            title="Aucun étudiant sans projet"
            sub="Soit la promotion n'a pas encore été importée (importez le CSV de la promotion pour suivre qui n'a pas de projet), soit tous les étudiants de la liste ont déjà un projet."
            action={<Button onClick={() => setImportOpen(true)}>Importer la promotion</Button>}
          />
        )
      ) : (
        <DataTable columns={columns} rows={rows} rowKey="email" loading={loading} />
      )}

      <RosterImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={fetchRows}
      />

      <Modal
        open={clearOpen}
        onClose={closeClear}
        title="Vider la liste de la promotion"
        size="sm"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="subtle" onClick={closeClear} disabled={clearing}>Annuler</Button>
            <Button variant="danger" onClick={clearRoster} loading={clearing}>Vider la liste</Button>
          </div>
        }
      >
        <div className="space-y-3 text-sm text-text-muted">
          <p>
            Toutes les entrées importées seront supprimées. Les idées, les groupes et les comptes ne sont pas touchés.
            Vous pourrez réimporter un CSV à tout moment.
          </p>
          {clearError && <p role="alert" className="text-danger">{clearError}</p>}
        </div>
      </Modal>
    </div>
  );
}
