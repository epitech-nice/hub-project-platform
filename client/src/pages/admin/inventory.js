// pages/admin/inventory.js
import { useEffect, useState, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import AppHeader from '../../components/layout/AppHeader';
import Footer from '../../components/layout/Footer';
import { useAuth } from '../../context/AuthContext';
import { useApi } from '../../hooks/useApi';
import PageHead from '../../components/ui/PageHead';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import FormField from '../../components/ui/FormField';
import Textarea from '../../components/ui/Textarea';
import Select from '../../components/ui/Select';
import FilterChips from '../../components/ui/FilterChips';
import TableToolbar from '../../components/ui/TableToolbar';
import DataTable from '../../components/ui/DataTable';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';

// ── Constantes ───────────────────────────────────────────────────────────────
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
    // flush any tag typed without pressing Enter before the form submits
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
  // Le modal d'import reste ouvert en arrière-plan, le formulaire s'empile dessus
  // (portals appended to body in DOM order — tool modal appended after import modal)
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
    return <div className="text-center py-10 text-text-muted">Chargement...</div>;
  }
  if (!isAuthenticated || !isAdmin) return null;

  const rfidCount = parseRfidText(importRaw).length;

  // ── Colonnes DataTable ────────────────────────────────────────────────────
  const COLUMNS = [
    {
      key: 'name',
      label: 'Outil',
      render: (v, row) => (
        <div>
          <p className="font-medium text-text">{v}</p>
          {row.description && (
            <p className="text-xs text-text-muted truncate max-w-xs">{row.description}</p>
          )}
        </div>
      ),
    },
    {
      key: 'tags',
      label: 'Tags',
      render: (v) => (
        <div className="flex flex-wrap gap-1">
          {(v || []).map((tag) => (
            <Badge key={tag} variant="neutral" size="sm">{tag}</Badge>
          ))}
        </div>
      ),
    },
    {
      key: 'rfid',
      label: 'RFID',
      render: (v) =>
        v ? (
          <span className="font-mono text-xs bg-surface-2 px-2 py-0.5 rounded text-text-muted">{v}</span>
        ) : (
          <span className="text-text-dim text-xs">—</span>
        ),
    },
    {
      key: 'quantity',
      label: 'Qté',
      align: 'center',
      render: (v) => <span className="font-medium text-text">{v}</span>,
    },
    {
      key: 'status',
      label: 'Statut',
      render: (_, row) => {
        const { label, variant } = getAvailability(row);
        return <Badge variant={variant}>{label}</Badge>;
      },
    },
    {
      key: '_id',
      label: 'Actions',
      align: 'center',
      render: (v, row) => (
        <div className="flex justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const url = `${window.location.origin}/inventory/scan/${row._id}`;
              const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(url)}`;
              window.open(qrUrl, '_blank');
            }}
          >
            QR Code
          </Button>
          <Button variant="outline" size="sm" onClick={() => openEditModal(row)}>Modifier</Button>
          <Button variant="danger" size="sm" onClick={() => setDeleteId(row._id)}>Supprimer</Button>
        </div>
      ),
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <Head>
        <title>Hub Inventaire - Administration</title>
      </Head>
      <AppHeader />

      <main className="flex-1 container mx-auto px-4 py-8 max-w-7xl">

        <PageHead
          title="Inventaire du Hub"
          actions={
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleExportCSV} loading={isExporting}>
                Exporter CSV
              </Button>
              <Button
                variant="ghost"
                onClick={() => { setImportRaw(''); setImportResults(null); setShowImport(true); }}
              >
                Import RFID
              </Button>
              <Button variant="primary" onClick={() => openAddModal()}>
                Ajouter un outil
              </Button>
            </div>
          }
        />

        {/* ── Filtres ──────────────────────────────────────────────────────── */}
        <div className="flex flex-col md:flex-row md:items-center gap-4 mb-6">
          <FilterChips
            options={[
              { value: 'all',         label: 'Tous' },
              { value: 'available',   label: 'Disponible' },
              { value: 'borrowed',    label: 'Emprunté' },
              { value: 'maintenance', label: 'Maintenance' },
            ]}
            value={statusFilter}
            onChange={setStatusFilter}
          />
          <TableToolbar
            search={search}
            onSearch={setSearch}
            searchPlaceholder="Rechercher..."
            className="flex-1 md:max-w-xs"
          />
        </div>

        {/* ── Table ────────────────────────────────────────────────────────── */}
        <DataTable
          columns={COLUMNS}
          rows={tools}
          rowKey="_id"
          emptyLabel={
            search || statusFilter !== 'all'
              ? 'Aucun outil ne correspond à votre recherche.'
              : 'Commencez par ajouter un outil avec le bouton ci-dessus.'
          }
        />

      </main>

      <Footer />

      {/* ── Modal : Import RFID ───────────────────────────────────────────────── */}
      <Modal
        open={showImport}
        onClose={() => setShowImport(false)}
        title="Import RFID"
        size="lg"
        footer={
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setShowImport(false)}>Fermer</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-text-muted">
            Collez les codes RFID exportés depuis votre lecteur portable (un par ligne), ou déposez un fichier{' '}
            <code className="bg-surface-2 px-1 rounded text-text">.txt</code> /{' '}
            <code className="bg-surface-2 px-1 rounded text-text">.csv</code>.
          </p>

          {/* Drag & drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleFileDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
              dragOver
                ? 'border-primary bg-primary-ghost'
                : 'border-border hover:border-primary hover:bg-primary-ghost'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mx-auto mb-1 text-text-dim" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v8" />
            </svg>
            <p className="text-sm text-text-muted">
              Glissez un fichier ici, ou <span className="text-primary underline">parcourir</span>
            </p>
            <input ref={fileInputRef} type="file" accept=".txt,.csv" className="hidden" onChange={handleFileInput} />
          </div>

          <Textarea
            value={importRaw}
            onChange={(e) => setImportRaw(e.target.value)}
            placeholder={"A3B4C5D6\n9F8E7D6C\n1A2B3C4D\n..."}
            rows={6}
            className="font-mono"
          />

          <div className="flex items-center justify-between">
            <span className="text-xs text-text-dim">
              {rfidCount} code{rfidCount > 1 ? 's' : ''} détecté{rfidCount > 1 ? 's' : ''}
            </span>
            <Button
              variant="outline"
              onClick={handleImportAnalyze}
              disabled={importLoading || rfidCount === 0}
              loading={importLoading}
            >
              Analyser
            </Button>
          </div>

          {importResults && (
            <div className="space-y-4 pt-4 border-t border-border">
              {/* Summary badges */}
              <div className="flex gap-3 flex-wrap">
                <Badge variant="neutral">{importResults.scannedCount} analysé{importResults.scannedCount > 1 ? 's' : ''}</Badge>
                <Badge variant="approved">{importResults.known.length} identifié{importResults.known.length > 1 ? 's' : ''}</Badge>
                <Badge variant={importResults.unknownRfids.length > 0 ? 'changes' : 'neutral'}>
                  {importResults.unknownRfids.length} inconnu{importResults.unknownRfids.length > 1 ? 's' : ''}
                </Badge>
              </div>

              {importResults.known.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-text mb-2">Outils identifiés</p>
                  <div className="space-y-1.5">
                    {importResults.known.map((tool) => {
                      const { label, variant } = getAvailability(tool);
                      return (
                        <div
                          key={tool._id}
                          className="flex items-center justify-between px-3 py-2 bg-surface-2 border border-border rounded-md"
                        >
                          <div>
                            <span className="text-sm font-medium text-text">{tool.name}</span>
                            <span className="ml-2 font-mono text-xs text-text-dim">{tool.rfid}</span>
                          </div>
                          <Badge variant={variant} size="sm">{label}</Badge>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {importResults.unknownRfids.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-text mb-2">Codes inconnus — non enregistrés en base</p>
                  <div className="space-y-1.5">
                    {importResults.unknownRfids.map((rfid) => (
                      <div
                        key={rfid}
                        className="flex items-center justify-between px-3 py-2 border border-border rounded-md"
                      >
                        <span className="font-mono text-sm text-text">{rfid}</span>
                        <Button variant="primary" size="sm" onClick={() => openAddFromImport(rfid)}>
                          Créer l&apos;outil →
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* ── Modal : Ajout / Modification ─────────────────────────────────────── */}
      {/* DOM order: appended after import modal portal → naturally on top at same z-index */}
      <Modal
        open={showModal}
        onClose={closeModal}
        title={modalMode === 'add' ? "Ajouter un outil" : "Modifier l'outil"}
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={closeModal} disabled={formLoading}>Annuler</Button>
            <Button type="submit" form="tool-form" variant="primary" loading={formLoading}>
              {modalMode === 'add' ? 'Ajouter' : 'Enregistrer'}
            </Button>
          </div>
        }
      >
        <form id="tool-form" onSubmit={handleFormSubmit} className="space-y-4">
          {formError && (
            <div className="rounded-md border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
              {formError}
            </div>
          )}

          <FormField label="Nom" required>
            <Input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ex : Arduino Mega"
            />
          </FormField>

          <FormField label="Description">
            <Textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Description courte de l'outil..."
              rows={2}
            />
          </FormField>

          {/* Tags: custom chip input */}
          <div>
            <p className="text-sm font-medium text-text mb-1">Tags</p>
            <div
              className="w-full border border-border rounded-md px-2 py-1.5 flex flex-wrap gap-1 cursor-text min-h-[42px] focus-within:ring-2 focus-within:ring-primary/30 bg-surface"
              onClick={() => tagInputRef.current?.focus()}
            >
              {form.tags.map((tag) => (
                <span
                  key={tag}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, tags: f.tags.filter((t) => t !== tag) }))}
                    className="hover:text-danger font-bold leading-none"
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
                className="flex-1 min-w-[120px] bg-transparent outline-none text-sm text-text placeholder:text-text-dim"
              />
            </div>
            {allTags.filter((t) => !form.tags.includes(t)).length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {allTags
                  .filter((t) => !form.tags.includes(t))
                  .map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, tags: [...f.tags, tag] }))}
                      className="px-2 py-0.5 rounded-full text-xs border border-dashed border-border text-text-muted hover:border-primary hover:text-primary transition-colors"
                    >
                      + {tag}
                    </button>
                  ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Code RFID">
              <Input
                type="text"
                value={form.rfid}
                onChange={(e) => setForm((f) => ({ ...f, rfid: e.target.value }))}
                placeholder="Optionnel"
                className="font-mono"
              />
            </FormField>
            <FormField label="Stock total">
              <Input
                type="number"
                min="0"
                value={form.quantity}
                onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
              />
            </FormField>
            <FormField label="Max / Étudiant">
              <Input
                type="number"
                min="1"
                value={form.maxBorrowPerUser}
                onChange={(e) => setForm((f) => ({ ...f, maxBorrowPerUser: e.target.value }))}
                placeholder="Illimité"
              />
            </FormField>
            <FormField label="Qté empruntée">
              <Input
                type="number"
                min="0"
                value={form.borrowedCount}
                onChange={(e) => setForm((f) => ({ ...f, borrowedCount: e.target.value }))}
              />
            </FormField>
          </div>

          <FormField label="Statut">
            <Select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
              <option value="available">Disponible</option>
              <option value="borrowed">Emprunté</option>
              <option value="maintenance">Maintenance</option>
            </Select>
          </FormField>
        </form>
      </Modal>

      {/* ── Modal : Confirmation suppression ─────────────────────────────────── */}
      <Modal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Confirmer la suppression"
        size="sm"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setDeleteId(null)} disabled={deleteLoading}>Annuler</Button>
            <Button variant="danger" onClick={handleDelete} loading={deleteLoading}>Supprimer</Button>
          </div>
        }
      >
        <p className="text-sm text-text-muted">Cette action est irréversible.</p>
      </Modal>
    </div>
  );
}
