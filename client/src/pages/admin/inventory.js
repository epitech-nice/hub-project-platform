// pages/admin/inventory.js
import React, { useEffect, useState, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Header from '../../components/layout/Header';
import { useAuth } from '../../context/AuthContext';
import { useApi } from '../../hooks/useApi';

// ── Constantes ───────────────────────────────────────────────────────────────
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
const EMPTY_FORM = {
  name:         '',
  description:  '',
  tags:         [],
  rfid:         '',
  quantity:     1,
  borrowedCount: 0,
  maxBorrowPerUser: '',
  status:       'available',
};

// Extrait les codes RFID depuis un texte brut (newlines, virgules, points-virgules, espaces)
const parseRfidText = (text) =>
  [
    ...new Set(
      text
        .split(/[\n,;\s]+/)
        .map((r) => r.trim().toUpperCase())
        .filter(Boolean)
    ),
  ];

// ── Composant principal ───────────────────────────────────────────────────────
export default function AdminInventoryPage() {
  const { isAuthenticated, isAdmin, loading: authLoading, token } = useAuth();
  const router = useRouter();

  const { get, post, put, delete: deleteRequest } = useApi();

  // ── State données ─────────────────────────────────────────────────────────
  const [tools, setTools]         = useState([]);
  const [allTags, setAllTags]     = useState([]);
  const [pageLoading, setPageLoading] = useState(true);

  // ── State filtres ─────────────────────────────────────────────────────────
  const [search, setSearch]           = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // ── State modal outil (add / edit) ────────────────────────────────────────
  const [showModal, setShowModal]   = useState(false);
  const [modalMode, setModalMode]   = useState('add'); // 'add' | 'edit'
  const [editingId, setEditingId]   = useState(null);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [tagInput, setTagInput]     = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError]   = useState('');
  const tagInputRef = useRef(null);

  // ── State confirmation suppression ────────────────────────────────────────
  const [deleteId, setDeleteId]           = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // ── State export CSV ──────────────────────────────────────────────────────
  const [isExporting, setIsExporting] = useState(false);

  // ── State import RFID ─────────────────────────────────────────────────────
  const [showImport, setShowImport]         = useState(false);
  const [importRaw, setImportRaw]           = useState('');
  const [importLoading, setImportLoading]   = useState(false);
  const [importResults, setImportResults]   = useState(null);
  const [dragOver, setDragOver]             = useState(false);
  const fileInputRef = useRef(null);
  const [fromImport, setFromImport]         = useState(false);

  // ── Auth guard ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authLoading && (!isAuthenticated || !isAdmin)) router.push('/');
  }, [isAuthenticated, isAdmin, authLoading, router]);

  // ── Chargement initial ────────────────────────────────────────────────────
  useEffect(() => {
    if (isAuthenticated && isAdmin) {
      Promise.all([fetchTools(), fetchTags()]).finally(() => setPageLoading(false));
    }
  }, [isAuthenticated, isAdmin]);

  // ── Refetch sur changement de filtres (debounce recherche) ────────────────
  useEffect(() => {
    if (!isAuthenticated || !isAdmin) return;
    const timer = setTimeout(fetchTools, 300);
    return () => clearTimeout(timer);
  }, [search, statusFilter]);

  const fetchTools = async () => {
    try {
      const params = {};
      if (search) params.search = search;
      if (statusFilter !== 'all') params.status = statusFilter;
      const res = await get('/api/tools', params);
      setTools(res.data);
    } catch (err) {
      console.error('Erreur chargement outils:', err);
    }
  };

  const fetchTags = async () => {
    try {
      const res = await get('/api/tools/tags');
      setAllTags(res.data);
    } catch (err) {
      console.error('Erreur chargement tags:', err);
    }
  };

  // ── Gestion du formulaire outil ───────────────────────────────────────────
  const openAddModal = (prefill = {}) => {
    setForm({ ...EMPTY_FORM, ...prefill });
    setTagInput('');
    setFormError('');
    setModalMode('add');
    setEditingId(null);
    setShowModal(true);
  };

  const openEditModal = (tool) => {
    setForm({
      name:         tool.name,
      description:  tool.description || '',
      tags:         [...(tool.tags || [])],
      rfid:         tool.rfid || '',
      quantity:     tool.quantity,
      borrowedCount: tool.borrowedCount || 0,
      maxBorrowPerUser: tool.maxBorrowPerUser !== null ? tool.maxBorrowPerUser : '',
      status:       tool.status,
    });
    setTagInput('');
    setFormError('');
    setModalMode('edit');
    setEditingId(tool._id);
    setShowModal(true);
  };

  const addTag = (value) => {
    const tag = value.trim();
    if (tag && !form.tags.includes(tag)) {
      setForm((f) => ({ ...f, tags: [...f.tags, tag] }));
    }
    setTagInput('');
  };

  const handleTagKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(tagInput);
    } else if (e.key === 'Backspace' && tagInput === '' && form.tags.length > 0) {
      setForm((f) => ({ ...f, tags: f.tags.slice(0, -1) }));
    }
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setFormError("Le nom de l'outil est requis");
      return;
    }
    // Valider le tag en cours de saisie s'il n'a pas été confirmé
    if (tagInput.trim()) addTag(tagInput);

    setFormLoading(true);
    setFormError('');
    try {
      const payload = {
        ...form,
        name:         form.name.trim(),
        quantity:     parseInt(form.quantity, 10) || 1,
        borrowedCount: parseInt(form.borrowedCount, 10) || 0,
        maxBorrowPerUser: form.maxBorrowPerUser === '' ? null : parseInt(form.maxBorrowPerUser, 10),
      };
      if (modalMode === 'add') {
        await post('/api/tools', payload);
      } else {
        await put(`/api/tools/${editingId}`, payload);
      }
      setShowModal(false);
      setFromImport(false);
      if (fromImport && importRaw) {
        // Relancer l'analyse pour que les résultats reflètent l'outil nouvellement créé
        const rfids = parseRfidText(importRaw);
        const [res] = await Promise.all([
          post('/api/tools/bulk-import', { rfids }),
          fetchTools(),
          fetchTags(),
        ]);
        setImportResults(res.data);
      } else {
        await Promise.all([fetchTools(), fetchTags()]);
      }
    } catch (err) {
      setFormError(err.message || 'Une erreur est survenue');
    } finally {
      setFormLoading(false);
    }
  };

  // ── Suppression ────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleteLoading(true);
    try {
      await deleteRequest(`/api/tools/${deleteId}`);
      setDeleteId(null);
      await fetchTools();
    } catch (err) {
      console.error('Erreur suppression:', err);
    } finally {
      setDeleteLoading(false);
    }
  };

  // ── Import RFID ────────────────────────────────────────────────────────────
  const readFile = (file) => {
    const reader = new FileReader();
    reader.onload = (ev) => setImportRaw(ev.target.result);
    reader.readAsText(file);
  };

  const handleFileDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) readFile(file);
  };

  const handleFileInput = (e) => {
    const file = e.target.files[0];
    if (file) readFile(file);
  };

  const handleImportAnalyze = async () => {
    const rfids = parseRfidText(importRaw);
    if (rfids.length === 0) return;
    setImportLoading(true);
    setImportResults(null);
    try {
      const res = await post('/api/tools/bulk-import', { rfids });
      setImportResults(res.data);
    } catch (err) {
      console.error('Erreur import:', err);
    } finally {
      setImportLoading(false);
    }
  };

  // ── Export CSV ────────────────────────────────────────────────────────────
  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.append('status', statusFilter);

      const url = `${process.env.NEXT_PUBLIC_API_URL}/api/tools/export/csv${
        params.toString() ? '?' + params.toString() : ''
      }`;

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Erreur lors de l'export");
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      const date = new Date().toISOString().split('T')[0];
      link.href = downloadUrl;
      link.download = `inventaire_hub_${date}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error("Erreur export CSV:", err);
      alert(err.message || "Erreur lors de l'export");
    } finally {
      setIsExporting(false);
    }
  };

  // Depuis l'import : ouvrir le formulaire d'ajout avec le RFID pré-rempli
  // Le modal d'import reste ouvert en arrière-plan (z-50), le formulaire s'empile dessus (z-60)
  const openAddFromImport = (rfid) => {
    setFromImport(true);
    openAddModal({ rfid });
  };

  // Fermeture du formulaire : reset fromImport si on venait de l'import
  const closeModal = () => {
    setShowModal(false);
    setFromImport(false);
  };

  // ── Rendu ─────────────────────────────────────────────────────────────────
  if (authLoading || pageLoading) {
    return <div className="text-center py-10 dark:text-white">Chargement...</div>;
  }
  if (!isAuthenticated || !isAdmin) return null;

  const rfidCount = parseRfidText(importRaw).length;

  return (
    <div className="min-h-screen dark:bg-gray-900">
      <Head>
        <title>Hub Inventaire - Administration</title>
      </Head>
      <Header />

      <main className="container mx-auto px-4 py-8">

        {/* ── En-tête ──────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <h1 className="text-3xl font-bold dark:text-white">Inventaire du Hub</h1>
          <div className="flex gap-2">
            <button
              onClick={handleExportCSV}
              disabled={isExporting}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 dark:bg-purple-700 dark:hover:bg-purple-800 text-white rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
              {isExporting ? 'Export...' : 'Exporter CSV'}
            </button>
            <button
              onClick={() => { setImportRaw(''); setImportResults(null); setShowImport(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-800 dark:bg-gray-600 dark:hover:bg-gray-500 text-white rounded-md text-sm font-medium"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
              </svg>
              Import RFID
            </button>
            <button
              onClick={() => openAddModal()}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-white rounded-md text-sm font-medium"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Ajouter un outil
            </button>
          </div>
        </div>

        {/* ── Filtres ──────────────────────────────────────────────────────── */}
        <div className="mb-6 flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex flex-wrap gap-2">
            {[
              { key: 'all',         label: 'Tous',        cls: 'bg-gray-700 text-white dark:bg-gray-600' },
              { key: 'available',   label: 'Disponible',  cls: 'bg-green-600 text-white' },
              { key: 'borrowed',    label: 'Emprunté',    cls: 'bg-yellow-500 text-white' },
              { key: 'maintenance', label: 'Maintenance', cls: 'bg-red-600 text-white' },
            ].map(({ key, label, cls }) => (
              <button
                key={key}
                onClick={() => setStatusFilter(key)}
                className={`px-4 py-2 rounded-md text-sm font-medium ${
                  statusFilter === key ? cls : 'bg-gray-200 dark:bg-gray-700 dark:text-gray-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher..."
            className="w-full md:w-64 px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
        </div>

        {/* ── Table ────────────────────────────────────────────────────────── */}
        {tools.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-8 text-center">
            <h3 className="text-xl font-bold mb-3 dark:text-white">Aucun outil à afficher</h3>
            <p className="text-gray-600 dark:text-gray-300">
              {search || statusFilter !== 'all'
                ? 'Aucun outil ne correspond à votre recherche.'
                : 'Commencez par ajouter un outil avec le bouton ci-dessus.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full bg-white dark:bg-gray-800 shadow-md rounded-lg">
              <thead className="bg-gray-100 dark:bg-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left dark:text-gray-200">Outil</th>
                  <th className="px-4 py-3 text-left dark:text-gray-200">Tags</th>
                  <th className="px-4 py-3 text-left dark:text-gray-200">RFID</th>
                  <th className="px-4 py-3 text-center dark:text-gray-200">Qté</th>
                  <th className="px-4 py-3 text-left dark:text-gray-200">Statut</th>
                  <th className="px-4 py-3 text-center dark:text-gray-200">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tools.map((tool) => {
                  const { label: availLabel, cls: availCls } = getAvailability(tool);
                  return (
                  <tr key={tool._id} className="border-t dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-4 py-3">
                      <p className="font-medium dark:text-white">{tool.name}</p>
                      {tool.description && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-xs">
                          {tool.description}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {tool.tags &&
                          tool.tags.map((tag) => (
                            <span
                              key={tag}
                              className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                            >
                              {tag}
                            </span>
                          ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {tool.rfid ? (
                        <span className="font-mono text-xs text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">
                          {tool.rfid}
                        </span>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-600 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center font-medium dark:text-white">
                      {tool.quantity}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${availCls}`}>
                        {availLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex justify-center gap-2">
                        <button
                          onClick={() => {
                            const url = `${window.location.origin}/inventory/scan/${tool._id}`;
                            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(url)}`;
                            window.open(qrUrl, '_blank');
                          }}
                          className="bg-purple-600 dark:bg-purple-700 text-white px-3 py-1 rounded hover:bg-purple-700 dark:hover:bg-purple-800 text-sm"
                        >
                          QR Code
                        </button>
                        <button
                          onClick={() => openEditModal(tool)}
                          className="bg-blue-600 dark:bg-blue-700 text-white px-3 py-1 rounded hover:bg-blue-700 dark:hover:bg-blue-800 text-sm"
                        >
                          Modifier
                        </button>
                        <button
                          onClick={() => setDeleteId(tool._id)}
                          className="bg-red-600 dark:bg-red-700 text-white px-3 py-1 rounded hover:bg-red-700 dark:hover:bg-red-800 text-sm"
                        >
                          Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* ── Modal : Ajout / Modification ─────────────────────────────────────── */}
      {/* z-60 : s'empile au-dessus du modal import (z-50) quand openAddFromImport est appelé */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4" style={{ zIndex: 60 }}>
          <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-lg shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b dark:border-gray-700">
              <h2 className="text-xl font-bold dark:text-white">
                {modalMode === 'add' ? "Ajouter un outil" : "Modifier l'outil"}
              </h2>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl leading-none"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="px-6 py-5 space-y-4">
              {formError && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md text-red-700 dark:text-red-300 text-sm">
                  {formError}
                </div>
              )}

              {/* Nom */}
              <div>
                <label className="block text-sm font-medium mb-1 dark:text-gray-200">
                  Nom <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Ex : Arduino Mega"
                  className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium mb-1 dark:text-gray-200">
                  Description
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Description courte de l'outil..."
                  rows={2}
                  className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              {/* Tags */}
              <div>
                <label className="block text-sm font-medium mb-1 dark:text-gray-200">Tags</label>
                {/* Zone chips + input */}
                <div
                  className="w-full border rounded-md dark:border-gray-600 px-2 py-1.5 flex flex-wrap gap-1 cursor-text min-h-[42px] focus-within:ring-2 focus-within:ring-blue-500 dark:bg-gray-700"
                  onClick={() => tagInputRef.current?.focus()}
                >
                  {form.tags.map((tag) => (
                    <span
                      key={tag}
                      className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, tags: f.tags.filter((t) => t !== tag) }))}
                        className="hover:text-red-500 font-bold leading-none"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <input
                    ref={tagInputRef}
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleTagKeyDown}
                    onBlur={() => addTag(tagInput)}
                    placeholder={form.tags.length === 0 ? 'Ajouter des tags (Entrée pour valider)...' : ''}
                    className="flex-1 min-w-[120px] bg-transparent outline-none text-sm dark:text-white placeholder-gray-400"
                  />
                </div>
                {/* Tags existants en suggestion rapide */}
                {allTags.filter((t) => !form.tags.includes(t)).length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {allTags
                      .filter((t) => !form.tags.includes(t))
                      .map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, tags: [...f.tags, tag] }))}
                          className="px-2 py-0.5 rounded-full text-xs border border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        >
                          + {tag}
                        </button>
                      ))}
                  </div>
                )}
              </div>

              {/* RFID + Quantité + Empruntés */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1 dark:text-gray-200">
                    Code RFID
                  </label>
                  <input
                    type="text"
                    value={form.rfid}
                    onChange={(e) => setForm((f) => ({ ...f, rfid: e.target.value }))}
                    placeholder="Optionnel"
                    className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 dark:text-gray-200">
                    Stock total
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.quantity}
                    onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 dark:text-gray-200">
                    Max / Étudiant
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={form.maxBorrowPerUser}
                    onChange={(e) => setForm((f) => ({ ...f, maxBorrowPerUser: e.target.value }))}
                    placeholder="Illimité"
                    className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 dark:text-gray-200">
                    Qté empruntée
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.borrowedCount}
                    onChange={(e) => setForm((f) => ({ ...f, borrowedCount: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Statut */}
              <div>
                <label className="block text-sm font-medium mb-1 dark:text-gray-200">Statut</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="available">Disponible</option>
                  <option value="borrowed">Emprunté</option>
                  <option value="maintenance">Maintenance</option>
                </select>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={formLoading}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-white disabled:opacity-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {formLoading
                    ? 'Enregistrement...'
                    : modalMode === 'add'
                    ? 'Ajouter'
                    : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal : Confirmation suppression ─────────────────────────────────── */}
      {deleteId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-sm w-full shadow-xl">
            <h2 className="text-xl font-bold mb-2 dark:text-white">Confirmer la suppression</h2>
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              Cette action est irréversible.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteId(null)}
                disabled={deleteLoading}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-white disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteLoading}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleteLoading ? 'Suppression...' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal : Import RFID ───────────────────────────────────────────────── */}
      {showImport && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-2xl shadow-xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b dark:border-gray-700 shrink-0">
              <h2 className="text-xl font-bold dark:text-white">Import RFID</h2>
              <button
                onClick={() => setShowImport(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl leading-none"
              >
                &times;
              </button>
            </div>

            {/* Corps scrollable */}
            <div className="px-6 py-5 overflow-y-auto flex-1 space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Collez les codes RFID exportés depuis votre lecteur portable (un par ligne),
                ou déposez un fichier{' '}
                <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">.txt</code> /{' '}
                <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">.csv</code>.
              </p>

              {/* Zone drag & drop */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                  dragOver
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mx-auto mb-1 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v8" />
                </svg>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Glissez un fichier ici, ou{' '}
                  <span className="text-blue-600 dark:text-blue-400 underline">parcourir</span>
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.csv"
                  className="hidden"
                  onChange={handleFileInput}
                />
              </div>

              {/* Textarea codes RFID */}
              <textarea
                value={importRaw}
                onChange={(e) => setImportRaw(e.target.value)}
                placeholder={"A3B4C5D6\n9F8E7D6C\n1A2B3C4D\n..."}
                rows={6}
                className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />

              {/* Compteur + bouton analyser */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {rfidCount} code{rfidCount > 1 ? 's' : ''} détecté{rfidCount > 1 ? 's' : ''}
                </span>
                <button
                  onClick={handleImportAnalyze}
                  disabled={importLoading || rfidCount === 0}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-800 dark:bg-gray-600 dark:hover:bg-gray-500 text-white rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {importLoading ? 'Analyse en cours...' : 'Analyser'}
                </button>
              </div>

              {/* ── Résultats ──────────────────────────────────────────────── */}
              {importResults && (
                <div className="space-y-4 pt-4 border-t dark:border-gray-700">
                  {/* Badges résumé */}
                  <div className="flex gap-3 flex-wrap">
                    <span className="px-3 py-1 rounded-full text-sm font-medium bg-gray-100 dark:bg-gray-700 dark:text-gray-300">
                      {importResults.scannedCount} code{importResults.scannedCount > 1 ? 's' : ''} analysé{importResults.scannedCount > 1 ? 's' : ''}
                    </span>
                    <span className="px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800 dark:bg-green-800/20 dark:text-green-300">
                      {importResults.known.length} identifié{importResults.known.length > 1 ? 's' : ''}
                    </span>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                      importResults.unknownRfids.length > 0
                        ? 'bg-orange-100 text-orange-800 dark:bg-orange-800/20 dark:text-orange-300'
                        : 'bg-gray-100 dark:bg-gray-700 dark:text-gray-400'
                    }`}>
                      {importResults.unknownRfids.length} inconnu{importResults.unknownRfids.length > 1 ? 's' : ''}
                    </span>
                  </div>

                  {/* Outils identifiés */}
                  {importResults.known.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                        Outils identifiés
                      </h4>
                      <div className="space-y-1.5">
                        {importResults.known.map((tool) => (
                          <div
                            key={tool._id}
                            className="flex items-center justify-between px-3 py-2 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800/30 rounded-md"
                          >
                            <div>
                              <span className="text-sm font-medium dark:text-white">{tool.name}</span>
                              <span className="ml-2 font-mono text-xs text-gray-400 dark:text-gray-500">
                                {tool.rfid}
                              </span>
                            </div>
                            {(() => { const { label, cls } = getAvailability(tool); return (
                              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>{label}</span>
                            ); })()}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Codes inconnus */}
                  {importResults.unknownRfids.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                        Codes inconnus — non enregistrés en base
                      </h4>
                      <div className="space-y-1.5">
                        {importResults.unknownRfids.map((rfid) => (
                          <div
                            key={rfid}
                            className="flex items-center justify-between px-3 py-2 bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-800/30 rounded-md"
                          >
                            <span className="font-mono text-sm text-gray-700 dark:text-gray-300">
                              {rfid}
                            </span>
                            <button
                              onClick={() => openAddFromImport(rfid)}
                              className="text-xs px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded"
                            >
                              Créer l'outil →
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t dark:border-gray-700 flex justify-end shrink-0">
              <button
                onClick={() => setShowImport(false)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-white"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
