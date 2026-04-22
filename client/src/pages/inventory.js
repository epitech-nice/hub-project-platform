// pages/inventory.js
import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import AppHeader from '../components/layout/AppHeader';
import Footer from '../components/layout/Footer';
import PageHead from '../components/ui/PageHead';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import FilterChips from '../components/ui/FilterChips';
import DataTable from '../components/ui/DataTable';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import Skeleton from '../components/ui/Skeleton';
import Modal from '../components/ui/Modal';
import { useAuth } from '../context/AuthContext';
import { useApi } from '../hooks/useApi';

const getAvailability = (tool) => {
  if (tool.status === 'maintenance') {
    return { label: 'Maintenance', variant: 'rejected' };
  }
  const available = tool.quantity - (tool.borrowedCount || 0);
  if (available <= 0) {
    return { label: 'Épuisé', variant: 'changes' };
  }
  if ((tool.borrowedCount || 0) > 0) {
    return { label: `${available}/${tool.quantity} dispo`, variant: 'pending' };
  }
  return { label: `Disponible (${tool.quantity})`, variant: 'approved' };
};

const LOAN_COLUMNS = [
  {
    key: 'user',
    label: 'Utilisateur',
    render: (v) => v?.name || 'Inconnu',
  },
  {
    key: 'tool',
    label: 'Outil',
    render: (v, row) => (
      <span className="text-text">
        {v?.name || 'Outil supprimé'}{' '}
        <span className="text-text-dim text-xs">x{row.quantity}</span>
      </span>
    ),
  },
  {
    key: 'borrowedAt',
    label: "Date d'emprunt",
    render: (v) => new Date(v).toLocaleDateString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
  },
  {
    key: 'returnedAt',
    label: 'Date de retour',
    render: (v) => v
      ? new Date(v).toLocaleDateString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      : '—',
  },
  {
    key: 'status',
    label: 'Statut',
    render: (v) =>
      v === 'borrowed'
        ? <Badge variant="pending">En cours</Badge>
        : <Badge variant="approved">Rendu</Badge>,
  },
];

export default function InventoryPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const { get, loading: apiLoading } = useApi();

  const [tools, setTools]           = useState([]);
  const [allTags, setAllTags]       = useState([]);
  const [search, setSearch]         = useState('');
  const [activeTag, setActiveTag]   = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedTool, setSelectedTool] = useState(null);
  const [activeTab, setActiveTab]       = useState('inventory'); // 'inventory' | 'history'
  const [loans, setLoans]               = useState([]);
  const [loansLoading, setLoansLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push('/');
  }, [isAuthenticated, authLoading, router]);

  useEffect(() => {
    if (isAuthenticated) {
      get('/api/tools/tags')
        .then((r) => setAllTags(r.data))
        .catch(console.error);
    }
  }, [isAuthenticated]);

  // Refetch outils sur changement de filtre (debounce sur la recherche texte)
  useEffect(() => {
    if (!isAuthenticated) return;
    const timer = setTimeout(() => {
      const params = {};
      if (search) params.search = search;
      if (activeTag) params.tags = activeTag;
      if (statusFilter !== 'all') params.status = statusFilter;
      get('/api/tools', params)
        .then((r) => setTools(r.data))
        .catch(console.error);
    }, 300);
    return () => clearTimeout(timer);
  }, [isAuthenticated, search, activeTag, statusFilter, activeTab]);

  useEffect(() => {
    if (isAuthenticated && activeTab === 'history') {
      setLoansLoading(true);
      get('/api/tools/loans/history')
        .then((r) => setLoans(r.data))
        .catch(console.error)
        .finally(() => setLoansLoading(false));
    }
  }, [isAuthenticated, activeTab]);

  if (authLoading) {
    return <div className="text-center py-10 text-text-muted">Chargement...</div>;
  }
  if (!isAuthenticated) return null;

  const modalAvailability = selectedTool ? getAvailability(selectedTool) : null;
  const modalAvailable = selectedTool
    ? selectedTool.quantity - (selectedTool.borrowedCount || 0)
    : 0;

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <Head>
        <title>Inventaire du Hub</title>
      </Head>
      <AppHeader />

      <main className="flex-1 container mx-auto px-4 py-8 max-w-7xl">
        {/* En-tête + onglets */}
        <div className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <PageHead title="Inventaire du Hub" sub="Matériel disponible dans la salle" />

          {/* Tab toggle */}
          <div role="tablist" className="flex border-b border-border gap-1">
            {[
              { id: 'inventory', label: 'Matériel' },
              { id: 'history', label: 'Historique des emprunts' },
            ].map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors duration-150 ${
                  activeTab === tab.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-text-muted hover:text-text hover:border-border-strong'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === 'inventory' ? (
          <>
            {/* Barre de recherche */}
            <Input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un outil..."
              className="w-full md:w-96 mb-4"
            />

            {/* Filtres statut */}
            <FilterChips
              className="mb-3"
              options={[
                { value: 'all',         label: 'Tous' },
                { value: 'available',   label: 'Disponible' },
                { value: 'borrowed',    label: 'Emprunté' },
                { value: 'maintenance', label: 'Maintenance' },
              ]}
              value={statusFilter}
              onChange={setStatusFilter}
            />

            {/* Filtres tags */}
            {allTags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-6">
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      activeTag === tag
                        ? 'bg-primary text-white border-primary'
                        : 'border-border text-text-muted hover:border-primary hover:text-primary'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}

            {/* Contenu */}
            {apiLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => <Skeleton key={i} variant="rect" height={160} />)}
              </div>
            ) : tools.length === 0 ? (
              <EmptyState
                title="Aucun outil trouvé"
                sub={search || activeTag || statusFilter !== 'all'
                  ? 'Essayez de modifier vos filtres.'
                  : "L'inventaire est vide pour le moment."}
              />
            ) : (
              <>
                <p className="text-sm text-text-muted mb-4">
                  {tools.length} outil{tools.length > 1 ? 's' : ''} trouvé{tools.length > 1 ? 's' : ''}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {tools.map((tool) => {
                    const { label, variant } = getAvailability(tool);
                    return (
                      <Card
                        key={tool._id}
                        interactive
                        className="flex flex-col"
                        onClick={() => setSelectedTool(tool)}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <h3 className="font-semibold text-text leading-tight pr-2">{tool.name}</h3>
                          <Badge variant={variant} size="sm" className="shrink-0">{label}</Badge>
                        </div>
                        {tool.description && (
                          <p
                            className="text-sm text-text-muted mb-3 overflow-hidden"
                            style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
                          >
                            {tool.description}
                          </p>
                        )}
                        {tool.tags && tool.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-3">
                            {tool.tags.map((tag) => (
                              <Badge key={tag} variant="neutral" size="sm">{tag}</Badge>
                            ))}
                          </div>
                        )}
                        <div className="mt-auto flex items-center justify-between pt-3 border-t border-border">
                          <span className="text-sm text-text-muted">
                            Stock : <span className="font-semibold text-text">{tool.quantity}</span>
                          </span>
                          <span className="text-xs text-primary">Voir détails →</span>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </>
            )}
          </>
        ) : (
          /* ── Onglet Historique ────────────────────────────────────────────────── */
          <DataTable
            columns={LOAN_COLUMNS}
            rows={loans}
            rowKey="_id"
            loading={loansLoading}
            emptyLabel="Aucun emprunt enregistré."
          />
        )}
      </main>

      <Footer />

      {/* ── Modal : Détail outil ─────────────────────────────────────────────── */}
      <Modal
        open={!!selectedTool}
        onClose={() => setSelectedTool(null)}
        title={selectedTool?.name ?? ''}
      >
        {selectedTool && (
            <div className="space-y-4">
              <Badge variant={modalAvailability.variant}>{modalAvailability.label}</Badge>

              {selectedTool.description && (
                <p className="text-sm text-text-muted leading-relaxed">{selectedTool.description}</p>
              )}

              {selectedTool.tags && selectedTool.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedTool.tags.map((tag) => (
                    <Badge key={tag} variant="neutral" size="sm">{tag}</Badge>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border">
                <div className="bg-surface-2 rounded-lg p-3">
                  <p className="text-xs text-text-muted mb-1">Stock total</p>
                  <p className="text-xl font-bold text-text">{selectedTool.quantity}</p>
                </div>
                <div className="bg-surface-2 rounded-lg p-3">
                  <p className="text-xs text-text-muted mb-1">Disponibles</p>
                  <p
                    className="text-xl font-bold"
                    style={{ color: modalAvailable > 0 ? 'rgb(var(--status-approved-text))' : 'rgb(var(--danger))' }}
                  >
                    {modalAvailable}
                  </p>
                </div>
                {(selectedTool.borrowedCount || 0) > 0 && (
                  <div className="bg-surface-2 rounded-lg p-3">
                    <p className="text-xs text-text-muted mb-1">Empruntés</p>
                    <p className="text-xl font-bold" style={{ color: 'rgb(var(--status-pending-text))' }}>
                      {selectedTool.borrowedCount}
                    </p>
                  </div>
                )}
                {selectedTool.rfid && (
                  <div className="bg-surface-2 rounded-lg p-3">
                    <p className="text-xs text-text-muted mb-1">RFID</p>
                    <p className="font-mono text-sm font-semibold text-text">{selectedTool.rfid}</p>
                  </div>
                )}
                {selectedTool.currentUserBorrowCount > 0 && (
                  <div className="col-span-2 bg-primary-ghost border border-primary-border rounded-lg p-3">
                    <p className="text-xs text-primary font-semibold mb-1">Votre emprunt actuel</p>
                    <p className="text-xl font-bold text-primary">
                      {selectedTool.currentUserBorrowCount}{' '}
                      {selectedTool.currentUserBorrowCount > 1 ? 'exemplaires' : 'exemplaire'}
                    </p>
                    {selectedTool.maxBorrowPerUser && (
                      <p className="text-xs text-primary/70 mt-1">
                        Capacité restante : {selectedTool.maxBorrowPerUser - selectedTool.currentUserBorrowCount}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="pt-4 mt-2 border-t border-border">
                <Button
                  variant="primary"
                  className="w-full justify-center"
                  onClick={() => router.push(`/inventory/scan/${selectedTool._id}`)}
                >
                  Emprunter ou Rendre
                </Button>
              </div>
            </div>
        )}
      </Modal>
    </div>
  );
}
