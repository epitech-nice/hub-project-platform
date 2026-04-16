// pages/inventory.js
import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Header from '../components/layout/Header';
import { useAuth } from '../context/AuthContext';
import { useApi } from '../hooks/useApi';

const getAvailability = (tool) => {
  if (tool.status === 'maintenance') {
    return { label: 'Maintenance', cls: 'bg-red-100 text-red-800 dark:bg-red-800/20 dark:text-red-300' };
  }
  const available = tool.quantity - (tool.borrowedCount || 0);
  if (available <= 0) {
    return { label: 'Épuisé', cls: 'bg-orange-100 text-orange-800 dark:bg-orange-800/20 dark:text-orange-300' };
  }
  if ((tool.borrowedCount || 0) > 0) {
    return { label: `${available}/${tool.quantity} dispo`, cls: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-800/20 dark:text-yellow-300' };
  }
  return { label: `Disponible (${tool.quantity})`, cls: 'bg-green-100 text-green-800 dark:bg-green-800/20 dark:text-green-300' };
};

const TAG_PALETTE = [
  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
  'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300',
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

  // Chargement initial des tags
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

  // Chargement de l'historique quand on change d'onglet
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
    return <div className="text-center py-10 dark:text-white">Chargement...</div>;
  }
  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen dark:bg-gray-900">
      <Head>
        <title>Inventaire du Hub</title>
      </Head>
      <Header />

      <main className="container mx-auto px-4 py-8">
        {/* En-tête */}
        <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold dark:text-white mb-1">Inventaire du Hub</h1>
            <p className="text-gray-500 dark:text-gray-400">
              Matériel disponible dans la salle
            </p>
          </div>
          <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('inventory')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'inventory'
                  ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              Matériel
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'history'
                  ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              Historique des emprunts
            </button>
          </div>
        </div>

        {activeTab === 'inventory' ? (
          <>
            {/* Barre de recherche */}
            <div className="mb-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un outil..."
            className="w-full md:w-96 px-4 py-2.5 border rounded-lg dark:bg-gray-800 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Filtres statut */}
        <div className="flex flex-wrap gap-2 mb-3">
          {[
            { key: 'all',         label: 'Tous',        cls: 'bg-gray-700 text-white dark:bg-gray-600' },
            { key: 'available',   label: 'Disponible',  cls: 'bg-green-600 text-white' },
            { key: 'borrowed',    label: 'Emprunté',    cls: 'bg-yellow-500 text-white' },
            { key: 'maintenance', label: 'Maintenance', cls: 'bg-red-600 text-white' },
          ].map(({ key, label, cls }) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                statusFilter === key
                  ? cls
                  : 'bg-gray-200 dark:bg-gray-700 dark:text-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Filtres tags */}
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  activeTag === tag
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-blue-400 dark:hover:border-blue-500'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        )}

        {/* Contenu */}
        {apiLoading ? (
          <div className="text-center py-16 dark:text-white">
            Chargement de l'inventaire...
          </div>
        ) : tools.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-12 text-center">
            <div className="text-4xl mb-4">📦</div>
            <h3 className="text-xl font-bold dark:text-white mb-2">Aucun outil trouvé</h3>
            <p className="text-gray-600 dark:text-gray-300">
              {search || activeTag || statusFilter !== 'all'
                ? 'Essayez de modifier vos filtres.'
                : "L'inventaire est vide pour le moment."}
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {tools.length} outil{tools.length > 1 ? 's' : ''} trouvé{tools.length > 1 ? 's' : ''}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {tools.map((tool) => {
                const { label, cls } = getAvailability(tool);
                return (
                  <div
                    key={tool._id}
                    onClick={() => setSelectedTool(tool)}
                    className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-100 dark:border-gray-700 p-5 hover:shadow-lg transition-shadow flex flex-col cursor-pointer"
                  >
                    {/* Header de la carte */}
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold text-gray-900 dark:text-white leading-tight pr-2">
                        {tool.name}
                      </h3>
                      <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
                        {label}
                      </span>
                    </div>

                    {tool.description && (
                      <p
                        className="text-sm text-gray-500 dark:text-gray-400 mb-3 overflow-hidden"
                        style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
                      >
                        {tool.description}
                      </p>
                    )}

                    {/* Tags */}
                    {tool.tags && tool.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {tool.tags.map((tag, i) => (
                          <span
                            key={tag}
                            className={`px-2 py-0.5 rounded-full text-xs font-medium ${TAG_PALETTE[i % TAG_PALETTE.length]}`}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Footer de la carte */}
                    <div className="mt-auto flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-700">
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        Stock :{' '}
                        <span className="font-semibold text-gray-700 dark:text-gray-200">
                          {tool.quantity}
                        </span>
                      </span>
                      <span className="text-xs text-blue-500 dark:text-blue-400">Voir détails →</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          /* ── Onglet Historique ────────────────────────────────────────────────── */
          <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden">
            {loansLoading ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">Chargement...</div>
            ) : loans.length === 0 ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">Aucun emprunt enregistré.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-100 dark:bg-gray-700 border-b dark:border-gray-600">
                      <th className="px-4 py-3 text-sm font-semibold dark:text-gray-200">Utilisateur</th>
                      <th className="px-4 py-3 text-sm font-semibold dark:text-gray-200">Outil</th>
                      <th className="px-4 py-3 text-sm font-semibold dark:text-gray-200">Date d'emprunt</th>
                      <th className="px-4 py-3 text-sm font-semibold dark:text-gray-200">Date de retour</th>
                      <th className="px-4 py-3 text-sm font-semibold dark:text-gray-200">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loans.map(loan => (
                      <tr key={loan._id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="px-4 py-3 text-sm text-gray-800 dark:text-gray-200">
                          {loan.user?.name || 'Inconnu'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-800 dark:text-gray-200">
                          {loan.tool?.name || 'Outil supprimé'} <span className="text-gray-500 text-xs">x{loan.quantity}</span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                          {new Date(loan.borrowedAt).toLocaleDateString('fr-FR', {
                            hour: '2-digit', minute: '2-digit'
                          })}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                          {loan.returnedAt ? new Date(loan.returnedAt).toLocaleDateString('fr-FR', {
                            hour: '2-digit', minute: '2-digit'
                          }) : '-'}
                        </td>
                        <td className="px-4 py-3">
                          {loan.status === 'borrowed' ? (
                            <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">En cours</span>
                          ) : (
                            <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">Rendu</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── Modal : Détail outil ─────────────────────────────────────────────── */}
      {selectedTool && (() => {
        const { label, cls } = getAvailability(selectedTool);
        const available = selectedTool.quantity - (selectedTool.borrowedCount || 0);
        return (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
            onClick={() => setSelectedTool(null)}
          >
            <div
              className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-lg shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-start justify-between px-6 py-4 border-b dark:border-gray-700">
                <h2 className="text-xl font-bold dark:text-white pr-4">{selectedTool.name}</h2>
                <button
                  onClick={() => setSelectedTool(null)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl leading-none shrink-0"
                >
                  &times;
                </button>
              </div>

              {/* Corps */}
              <div className="px-6 py-5 space-y-4">
                {/* Badge statut */}
                <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${cls}`}>
                  {label}
                </span>

                {/* Description complète */}
                {selectedTool.description && (
                  <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                    {selectedTool.description}
                  </p>
                )}

                {/* Tags */}
                {selectedTool.tags && selectedTool.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedTool.tags.map((tag, i) => (
                      <span
                        key={tag}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium ${TAG_PALETTE[i % TAG_PALETTE.length]}`}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Détails stock */}
                <div className="grid grid-cols-2 gap-3 pt-2 border-t dark:border-gray-700">
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Stock total</p>
                    <p className="text-xl font-bold dark:text-white">{selectedTool.quantity}</p>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Disponibles</p>
                    <p className={`text-xl font-bold ${available > 0 ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400'}`}>
                      {available}
                    </p>
                  </div>
                  {(selectedTool.borrowedCount || 0) > 0 && (
                    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Empruntés</p>
                      <p className="text-xl font-bold text-yellow-600 dark:text-yellow-400">
                        {selectedTool.borrowedCount}
                      </p>
                    </div>
                  )}
                  {selectedTool.rfid && (
                    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">RFID</p>
                      <p className="font-mono text-sm font-semibold dark:text-white">{selectedTool.rfid}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
