// components/ideas/admin/SuiviTab.js
// Onglet « Suivi » du tableau de bord staff : toutes les idées (masquées comprises),
// recherche, filtres deck et liens, actions masquer, modérer, débloquer, supprimer.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'react-toastify';
import DataTable from '../../ui/DataTable';
import TableToolbar from '../../ui/TableToolbar';
import FilterChips from '../../ui/FilterChips';
import Pagination from '../../ui/Pagination';
import KpiCard from '../../ui/KpiCard';
import Badge from '../../ui/Badge';
import Button from '../../ui/Button';
import Switch from '../../ui/Switch';
import EmptyState from '../../ui/EmptyState';
import DeleteIdeaDialog from './DeleteIdeaDialog';
import ModerateIdeaDialog from './ModerateIdeaDialog';
import UnlockIdeaDialog from './UnlockIdeaDialog';
import { useApi } from '../../../hooks/useApi';
import { errorText, formatDate } from '../../../lib/ideation';

const PAGE_SIZE = 25;

const PRESENCE_OPTIONS = [
  { value: 'all', label: 'Tous' },
  { value: 'true', label: 'Présent' },
  { value: 'false', label: 'Absent' },
];

const LINK_OPTIONS = [
  { value: 'all', label: 'Tous' },
  { value: 'true', label: 'Avec liens' },
  { value: 'false', label: 'Sans lien' },
];

function FilterGroup({ label, children }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wider text-text-dim">{label}</span>
      {children}
    </div>
  );
}

export default function SuiviTab({ refreshKey = 0 }) {
  const { get, patch } = useApi();

  const [searchInput, setSearchInput] = useState('');
  const [q, setQ] = useState('');
  const [deckFilter, setDeckFilter] = useState('all');
  const [linksFilter, setLinksFilter] = useState('all');
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const requestRef = useRef(0);

  const [kpis, setKpis] = useState(null);
  const kpiRef = useRef(0);

  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [dialog, setDialog] = useState(null); // { kind: 'delete' | 'moderate' | 'unlock', row }

  // Anti-rebond de la recherche
  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const fetchRows = async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const params = { page, limit: PAGE_SIZE };
      if (q) params.q = q;
      if (deckFilter !== 'all') params.hasDeck = deckFilter;
      if (linksFilter !== 'all') params.hasLinks = linksFilter;
      const res = await get('/api/ideas/admin', params);
      if (requestId !== requestRef.current) return;
      setRows(Array.isArray(res.data) ? res.data : []);
      setTotal(typeof res.total === 'number' ? res.total : 0);
    } catch (err) {
      if (requestId !== requestRef.current) return;
      setRows([]);
      setTotal(0);
      setError(errorText(err, 'Impossible de charger les idées'));
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  };

  // Compteurs globaux (sans filtre) : limit=1, seul `total` sert
  const fetchKpis = async () => {
    const requestId = ++kpiRef.current;
    try {
      const [all, noDeck, noLinks] = await Promise.all([
        get('/api/ideas/admin', { limit: 1 }),
        get('/api/ideas/admin', { limit: 1, hasDeck: 'false' }),
        get('/api/ideas/admin', { limit: 1, hasLinks: 'false' }),
      ]);
      if (requestId !== kpiRef.current) return;
      setKpis({ all: all.total || 0, noDeck: noDeck.total || 0, noLinks: noLinks.total || 0 });
    } catch (err) {
      if (requestId !== kpiRef.current) return;
      setKpis(null);
    }
  };

  useEffect(() => {
    fetchRows();
    // get n'est pas mémorisé : fetchRows l'utilise sans être une dépendance
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, deckFilter, linksFilter, page, refreshKey]);

  useEffect(() => {
    fetchKpis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Après une suppression, la page courante peut ne plus exister
  useEffect(() => {
    if (!loading && page > totalPages) setPage(totalPages);
  }, [loading, page, totalPages]);

  const refresh = () => {
    fetchRows();
    fetchKpis();
  };

  const toggleHidden = async (row) => {
    setBusyId(row._id);
    setActionError(null);
    try {
      await patch(`/api/ideas/admin/${encodeURIComponent(row._id)}/hide`, { hidden: !row.hidden });
      toast.success(row.hidden ? 'Idée de nouveau visible' : 'Idée masquée du catalogue');
      refresh();
    } catch (err) {
      setActionError(errorText(err, "La visibilité n'a pas pu être modifiée"));
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleted = (row) => {
    setDialog(null);
    toast.success(`« ${row.title} » supprimée`);
    refresh();
  };

  const filtersActive = Boolean(searchInput.trim()) || deckFilter !== 'all' || linksFilter !== 'all';

  const resetFilters = () => {
    setSearchInput('');
    setQ('');
    setDeckFilter('all');
    setLinksFilter('all');
    setPage(1);
  };

  const columns = [
    {
      key: 'title',
      label: 'Idée',
      className: 'min-w-[14rem]',
      render: (value, row) => (
        <div className="flex flex-col items-start gap-1">
          <Link href={`/idees/${encodeURIComponent(row._id)}`}>
            <a className="font-medium text-text break-words hover:text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded">
              {value}
            </a>
          </Link>
          {row.hidden && <Badge variant="neutral" size="sm">Masquée</Badge>}
        </div>
      ),
    },
    {
      key: 'creator',
      label: 'Créateur',
      className: 'min-w-[12rem]',
      render: (creator) => (
        <div className="min-w-0">
          <p className="text-text">{creator && creator.name}</p>
          {creator && creator.email && <p className="break-all text-xs text-text-muted">{creator.email}</p>}
        </div>
      ),
    },
    {
      key: 'memberCount',
      label: 'Membres',
      className: 'whitespace-nowrap',
      render: (count, row) => (
        <div className="flex flex-col items-start gap-1">
          <span className="font-mono tabular-nums">{count}</span>
          {row.incomplete && <Badge variant="changes" size="sm" dot>Incomplet</Badge>}
        </div>
      ),
    },
    {
      key: 'hasDeck',
      label: 'Deck',
      className: 'whitespace-nowrap',
      render: (hasDeck) =>
        hasDeck
          ? <Badge variant="approved" size="sm">Présent</Badge>
          : <Badge variant="rejected" size="sm" dot>Absent</Badge>,
    },
    {
      key: 'linkCount',
      label: 'Liens',
      className: 'min-w-[9rem]',
      render: (count, row) => (
        <div className="flex flex-col gap-1">
          <span className="font-mono tabular-nums">{count}</span>
          {Array.isArray(row.linkDomains) && row.linkDomains.length > 0 && (
            <ul className="flex flex-wrap gap-1" aria-label="Domaines">
              {row.linkDomains.map((d) => (
                <li key={d} className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-text-muted break-all">{d}</li>
              ))}
            </ul>
          )}
        </div>
      ),
    },
    {
      key: 'lastActivityAt',
      label: 'Dernière modif.',
      className: 'whitespace-nowrap text-text-muted',
      render: (value) => formatDate(value, true) || '—',
    },
    {
      key: 'hidden',
      label: 'Masquée',
      render: (hidden, row) => (
        <Switch
          checked={Boolean(hidden)}
          onChange={() => toggleHidden(row)}
          disabled={busyId === row._id}
          aria-label={hidden ? `Afficher « ${row.title} » dans le catalogue` : `Masquer « ${row.title} » du catalogue`}
        />
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'right',
      render: (_, row) => (
        <div className="flex flex-wrap justify-end gap-1.5 min-w-[15rem]">
          <Button variant="subtle" size="sm" onClick={() => setDialog({ kind: 'moderate', row })} aria-label={`Modérer « ${row.title} »`}>
            Modérer
          </Button>
          <Button variant="subtle" size="sm" onClick={() => setDialog({ kind: 'unlock', row })} aria-label={`Débloquer « ${row.title} »`}>
            Débloquer
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-danger hover:bg-danger/10"
            onClick={() => setDialog({ kind: 'delete', row })}
            aria-label={`Supprimer « ${row.title} »`}
          >
            Supprimer
          </Button>
        </div>
      ),
    },
  ];

  const closeDialog = () => setDialog(null);
  const dialogRow = (kind) => (dialog && dialog.kind === kind ? dialog.row : null);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard label="Idées" value={kpis ? kpis.all : '—'} sub="masquées comprises" />
        <KpiCard label="Sans deck" value={kpis ? kpis.noDeck : '—'} sub="invisibles au catalogue" variant={kpis && kpis.noDeck > 0 ? 'warning' : 'default'} />
        <KpiCard label="Sans lien du jour 2" value={kpis ? kpis.noLinks : '—'} />
      </div>

      <TableToolbar
        search={searchInput}
        onSearch={setSearchInput}
        searchPlaceholder="Idée, étudiant ou email"
        className="rounded-xl border border-border bg-surface p-4"
      >
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <FilterGroup label="Deck">
            <FilterChips options={PRESENCE_OPTIONS} value={deckFilter} onChange={(v) => { setDeckFilter(v); setPage(1); }} />
          </FilterGroup>
          <FilterGroup label="Liens du jour 2">
            <FilterChips options={LINK_OPTIONS} value={linksFilter} onChange={(v) => { setLinksFilter(v); setPage(1); }} />
          </FilterGroup>
        </div>
      </TableToolbar>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-text-muted" aria-live="polite">
          {loading ? 'Chargement…' : `${total} idée${total > 1 ? 's' : ''}`}
        </p>
        {filtersActive && <Button variant="ghost" size="sm" onClick={resetFilters}>Réinitialiser les filtres</Button>}
      </div>

      {actionError && <p role="alert" className="text-sm text-danger">{actionError}</p>}

      {error ? (
        <EmptyState
          title="Le suivi n'a pas pu être chargé"
          sub={error}
          action={<Button variant="outline" onClick={refresh}>Réessayer</Button>}
        />
      ) : !loading && rows.length === 0 ? (
        filtersActive ? (
          <EmptyState
            title="Aucune idée ne correspond"
            sub="Modifiez la recherche ou retirez un filtre."
            action={<Button variant="outline" onClick={resetFilters}>Réinitialiser les filtres</Button>}
          />
        ) : (
          <EmptyState title="Aucune idée cette saison" sub="Les idées apparaissent ici dès leur création, avant même le dépôt du deck." />
        )
      ) : (
        <DataTable columns={columns} rows={rows} rowKey="_id" loading={loading} />
      )}

      {totalPages > 1 && !error && (
        <div className="flex justify-center">
          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </div>
      )}

      <DeleteIdeaDialog row={dialogRow('delete')} onClose={closeDialog} onDeleted={handleDeleted} />
      <ModerateIdeaDialog row={dialogRow('moderate')} onClose={closeDialog} onChanged={refresh} />
      <UnlockIdeaDialog row={dialogRow('unlock')} onClose={closeDialog} onChanged={refresh} />
    </div>
  );
}
