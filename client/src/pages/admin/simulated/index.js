// pages/admin/simulated/index.js
import Head from "next/head";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import AppHeader from "../../../components/layout/AppHeader";
import Footer from "../../../components/layout/Footer";
import { useAuth } from "../../../context/AuthContext";
import { useApi } from "../../../hooks/useApi";

import PageHead from "../../../components/ui/PageHead";
import Tabs from "../../../components/ui/Tabs";
import Card from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";
import FormField from "../../../components/ui/FormField";
import Textarea from "../../../components/ui/Textarea";
import Select from "../../../components/ui/Select";
import Switch from "../../../components/ui/Switch";
import FileInput from "../../../components/ui/FileInput";
import FilterChips from "../../../components/ui/FilterChips";
import TableToolbar from "../../../components/ui/TableToolbar";
import DataTable from "../../../components/ui/DataTable";
import StatusBadge from "../../../components/domain/StatusBadge";
import Badge from "../../../components/ui/Badge";
import EmptyState from "../../../components/ui/EmptyState";
import Skeleton from "../../../components/ui/Skeleton";
import Modal from "../../../components/ui/Modal";

export default function AdminSimulated() {
  const { isAuthenticated, isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const { get, post, put, delete: del, loading: apiLoading } = useApi();

  // ── Catalogue ──
  const [catalogProjects, setCatalogProjects] = useState([]);
  const [catalogForm, setCatalogForm] = useState({ title: "", file: null });
  const [editingProject, setEditingProject] = useState(null);
  const [catalogError, setCatalogError] = useState("");
  const [isSubmittingCatalog, setIsSubmittingCatalog] = useState(false);

  // ── Modal / FileInput reset keys ──
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createFileKey, setCreateFileKey] = useState(0);
  const [editFileKey, setEditFileKey] = useState(0);

  // ── Enrollments ──
  const [enrollments, setEnrollments] = useState([]);
  const [enrollmentFilter, setEnrollmentFilter] = useState("all");
  const [enrollmentSearch, setEnrollmentSearch] = useState("");

  // ── Force inscription ──
  const [forceForm, setForceForm] = useState({ projectId: "", studentEmail: "" });
  const [forceError, setForceError] = useState("");
  const [forceSuccess, setForceSuccess] = useState("");
  const [isForceSubmitting, setIsForceSubmitting] = useState(false);

  // ── Export ──
  const [exportStartDate, setExportStartDate] = useState("");
  const [exportEndDate, setExportEndDate] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  // ── Cycles ──
  const [cycles, setCycles] = useState([]);
  const [cycleForm, setCycleForm] = useState({
    name: "",
    startDate: "",
    firstSubmissionDeadline: "",
    firstDefenseDate: "",
    secondSubmissionDeadline: "",
    secondDefenseDate: "",
    isDoubleCycle: false,
  });
  const [editingCycle, setEditingCycle] = useState(null);
  const [cycleError, setCycleError] = useState("");
  const [isSubmittingCycle, setIsSubmittingCycle] = useState(false);

  // ── Import JSON ──
  const [jsonInput, setJsonInput] = useState("");
  const [jsonPreview, setJsonPreview] = useState(null);
  const [jsonError, setJsonError] = useState("");
  const [isImporting, setIsImporting] = useState(false);

  // ── Génération automatique ──
  const [genForm, setGenForm] = useState({ firstStartDate: "", numberOfCycles: 8, namePrefix: "Cycle" });
  const [genPreview, setGenPreview] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState("");

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || !isAdmin)) {
      router.push("/");
    }
  }, [isAuthenticated, isAdmin, authLoading, router]);

  useEffect(() => {
    if (isAuthenticated && isAdmin) {
      fetchCatalog();
      fetchEnrollments();
      fetchCycles();
    }
  }, [isAuthenticated, isAdmin]);

  const fetchCatalog = async () => {
    try {
      const res = await get("/api/simulated/catalog");
      setCatalogProjects(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchEnrollments = async () => {
    try {
      const res = await get("/api/simulated/enrollments");
      setEnrollments(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleForceEnroll = async (e) => {
    e.preventDefault();
    setForceError("");
    setForceSuccess("");
    if (!forceForm.projectId || !forceForm.studentEmail.trim()) {
      setForceError("Veuillez sélectionner un projet et saisir un email.");
      return;
    }
    setIsForceSubmitting(true);
    try {
      const data = await post("/api/simulated/force-enroll", {
        projectId: forceForm.projectId,
        studentEmail: forceForm.studentEmail.trim()
      });
      setForceSuccess(`Étudiant inscrit avec succès sur "${data.data.simulatedProject.title}".`);
      setForceForm({ projectId: "", studentEmail: "" });
      await fetchEnrollments();
    } catch (err) {
      setForceError(err.message || "Une erreur est survenue.");
    } finally {
      setIsForceSubmitting(false);
    }
  };

  // ── Export CSV ──
  const handleExport = async () => {
    setIsExporting(true);
    try {
      const token = localStorage.getItem("token");
      const params = new URLSearchParams();
      if (exportStartDate) params.append("startDate", exportStartDate);
      if (exportEndDate) params.append("endDate", exportEndDate);
      const url = `${process.env.NEXT_PUBLIC_API_URL}/api/simulated/enrollments/export?${params}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const data = await res.json();
        alert(data.message || "Aucun cycle terminé trouvé pour cette période.");
        return;
      }
      const blob = await res.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `simulated_completed_${exportStartDate || "all"}_to_${exportEndDate || "all"}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (e) {
      console.error(e);
      alert("Erreur lors de l'export.");
    } finally {
      setIsExporting(false);
    }
  };

  const fetchCycles = async () => {
    try {
      const res = await get("/api/simulated/cycles");
      setCycles(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateCycle = async (e) => {
    e.preventDefault();
    setCycleError("");
    const { name, startDate, firstSubmissionDeadline, firstDefenseDate, secondSubmissionDeadline, secondDefenseDate } = cycleForm;
    if (!name.trim() || !startDate || !firstSubmissionDeadline || !firstDefenseDate || !secondSubmissionDeadline || !secondDefenseDate) {
      setCycleError("Tous les champs de dates sont requis.");
      return;
    }
    setIsSubmittingCycle(true);
    try {
      await post("/api/simulated/cycles", {
        name: name.trim(),
        startDate,
        firstSubmissionDeadline,
        firstDefenseDate,
        secondSubmissionDeadline,
        secondDefenseDate,
        isDoubleCycle: cycleForm.isDoubleCycle,
      });
      setCycleForm({ name: "", startDate: "", firstSubmissionDeadline: "", firstDefenseDate: "", secondSubmissionDeadline: "", secondDefenseDate: "", isDoubleCycle: false });
      await fetchCycles();
    } catch (err) {
      setCycleError(err.message || "Erreur lors de la création");
    } finally {
      setIsSubmittingCycle(false);
    }
  };

  const handleUpdateCycle = async (e) => {
    e.preventDefault();
    if (!editingCycle) return;
    setIsSubmittingCycle(true);
    try {
      await put(`/api/simulated/cycles/${editingCycle._id}`, {
        name: editingCycle.name,
        startDate: editingCycle.startDate,
        firstSubmissionDeadline: editingCycle.firstSubmissionDeadline,
        firstDefenseDate: editingCycle.firstDefenseDate,
        secondSubmissionDeadline: editingCycle.secondSubmissionDeadline,
        secondDefenseDate: editingCycle.secondDefenseDate,
        isDoubleCycle: editingCycle.isDoubleCycle,
      });
      setEditingCycle(null);
      await fetchCycles();
    } catch (err) {
      setCycleError(err.message || "Erreur lors de la mise à jour");
    } finally {
      setIsSubmittingCycle(false);
    }
  };

  const handleDeleteCycle = async (id) => {
    if (!window.confirm("Supprimer ce cycle ? Cette action est irréversible.")) return;
    try {
      await del(`/api/simulated/cycles/${id}`);
      await fetchCycles();
    } catch (err) {
      setCycleError(err.message || "Erreur lors de la suppression");
    }
  };

  // ── Import JSON : analyse ──
  const handleParseJson = () => {
    setJsonError("");
    setJsonPreview(null);
    try {
      const parsed = JSON.parse(jsonInput.trim());
      if (!Array.isArray(parsed) || parsed.length === 0) {
        setJsonError("Le JSON doit être un tableau non vide.");
        return;
      }
      for (let i = 0; i < parsed.length; i++) {
        const { name, startDate, firstSubmissionDeadline, firstDefenseDate, secondSubmissionDeadline, secondDefenseDate } = parsed[i];
        if (!name || !startDate || !firstSubmissionDeadline || !firstDefenseDate || !secondSubmissionDeadline || !secondDefenseDate) {
          setJsonError(`Cycle ${i + 1} : champs requis manquants (name, startDate, firstSubmissionDeadline, firstDefenseDate, secondSubmissionDeadline, secondDefenseDate).`);
          return;
        }
        const dates = [startDate, firstSubmissionDeadline, firstDefenseDate, secondSubmissionDeadline, secondDefenseDate];
        if (dates.some((d) => isNaN(new Date(d)))) {
          setJsonError(`Cycle ${i + 1} : une ou plusieurs dates sont invalides.`);
          return;
        }
      }
      setJsonPreview(parsed);
    } catch {
      setJsonError("JSON invalide. Vérifiez la syntaxe.");
    }
  };

  const handleImportJson = async () => {
    if (!jsonPreview) return;
    setIsImporting(true);
    setJsonError("");
    try {
      await post("/api/simulated/cycles/import", { cycles: jsonPreview });
      setJsonInput("");
      setJsonPreview(null);
      await fetchCycles();
    } catch (err) {
      setJsonError(err.message || "Erreur lors de l'import");
    } finally {
      setIsImporting(false);
    }
  };

  // ── Génération auto : prévisualisation (calcul local) ──
  const handlePreviewGeneration = () => {
    setGenError("");
    setGenPreview(null);
    const { firstStartDate, numberOfCycles, namePrefix } = genForm;
    if (!firstStartDate || !numberOfCycles) {
      setGenError("La date de départ et le nombre de cycles sont requis.");
      return;
    }
    const n = parseInt(numberOfCycles);
    if (isNaN(n) || n < 1 || n > 26) {
      setGenError("Nombre de cycles entre 1 et 26.");
      return;
    }
    const prefix = namePrefix.trim() || "Cycle";
    const preview = [];
    // addDays uses pure UTC arithmetic to avoid DST shift issues
    const addDays = (isoStr, d) => {
      const [y, m, day] = isoStr.split("-").map(Number);
      return new Date(Date.UTC(y, m - 1, day + d)).toISOString().slice(0, 10);
    };
    let currentStart = firstStartDate; // ISO string YYYY-MM-DD
    for (let i = 0; i < n; i++) {
      preview.push({
        name: `${prefix} ${i + 1}`,
        startDate: currentStart,
        firstSubmissionDeadline: addDays(currentStart, 5),
        firstDefenseDate: addDays(currentStart, 14),
        secondSubmissionDeadline: addDays(currentStart, 19),
        secondDefenseDate: addDays(currentStart, 28),
      });
      currentStart = addDays(currentStart, 28);
    }
    setGenPreview(preview);
  };

  const handleConfirmGeneration = async () => {
    if (!genPreview) return;
    setIsGenerating(true);
    setGenError("");
    try {
      await post("/api/simulated/cycles/generate", genForm);
      setGenPreview(null);
      setGenForm({ firstStartDate: "", numberOfCycles: 8, namePrefix: "Cycle" });
      await fetchCycles();
    } catch (err) {
      setGenError(err.message || "Erreur lors de la génération");
    } finally {
      setIsGenerating(false);
    }
  };

  // ── Catalogue : création ──
  const handleCreateProject = async (e) => {
    e.preventDefault();
    setCatalogError("");
    if (!catalogForm.title.trim()) {
      setCatalogError("Le titre est requis.");
      return;
    }
    setIsSubmittingCatalog(true);
    try {
      const formData = new FormData();
      formData.append("title", catalogForm.title.trim());
      if (catalogForm.file) formData.append("subjectFile", catalogForm.file);

      const token = localStorage.getItem("token");
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/simulated/catalog`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        }
      );
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      setCatalogForm({ title: "", file: null });
      setCreateFileKey((k) => k + 1);
      setShowCreateModal(false);
      await fetchCatalog();
    } catch (err) {
      setCatalogError(err.message || "Erreur lors de la création");
    } finally {
      setIsSubmittingCatalog(false);
    }
  };

  const handleToggleActive = async (project) => {
    try {
      const token = localStorage.getItem("token");
      const formData = new FormData();
      formData.append("isActive", String(!project.isActive));
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/simulated/catalog/${project._id}`,
        {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        }
      );
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      await fetchCatalog();
    } catch (err) {
      setCatalogError(err.message || "Erreur lors de la mise à jour du statut");
    }
  };

  const handleUpdateProject = async (e) => {
    e.preventDefault();
    if (!editingProject) return;
    setCatalogError("");
    setIsSubmittingCatalog(true);
    try {
      const token = localStorage.getItem("token");
      const formData = new FormData();
      formData.append("title", editingProject.title.trim());
      if (editingProject.newFile) formData.append("subjectFile", editingProject.newFile);
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/simulated/catalog/${editingProject._id}`,
        {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        }
      );
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      setEditingProject(null);
      setEditFileKey((k) => k + 1);
      await fetchCatalog();
    } catch (err) {
      setCatalogError(err.message || "Erreur lors de la mise à jour");
    } finally {
      setIsSubmittingCatalog(false);
    }
  };

  const handleDeleteProject = async (id) => {
    if (!window.confirm("Supprimer ce projet du catalogue ? Cette action est irréversible.")) return;
    setCatalogError("");
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/simulated/catalog/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      await fetchCatalog();
    } catch (err) {
      setCatalogError(err.message || "Erreur lors de la suppression du projet");
    }
  };

  // ── Enrollments : filtre ──
  const filteredEnrollments = enrollments.filter((e) => {
    const matchStatus = enrollmentFilter === "all" || e.status === enrollmentFilter;
    const matchSearch =
      !enrollmentSearch ||
      e.student.name.toLowerCase().includes(enrollmentSearch.toLowerCase()) ||
      e.student.email.toLowerCase().includes(enrollmentSearch.toLowerCase()) ||
      e.simulatedProject.title.toLowerCase().includes(enrollmentSearch.toLowerCase());
    return matchStatus && matchSearch;
  });

  if (authLoading) {
    return <div className="text-center py-10 text-text-muted">Chargement...</div>;
  }

  if (!isAuthenticated || !isAdmin) return null;

  const pendingCount = enrollments.filter((e) => e.status === "pending").length;

  // ── DataTable columns ──
  const enrollmentColumns = [
    {
      key: "student",
      label: "Étudiant",
      render: (v) => (
        <div>
          <p className="font-medium text-text">{v.name}</p>
          <p className="text-xs text-text-muted">{v.email}</p>
        </div>
      ),
    },
    {
      key: "simulatedProject",
      label: "Projet",
      render: (v, row) => (
        <div className="flex items-center gap-2">
          <span>{v.title}</span>
          {row.isDoubleCycle && (
            <Badge variant="neutral" size="sm">Double</Badge>
          )}
        </div>
      ),
    },
    {
      key: "cycleNumber",
      label: "Cycle",
      render: (v) => `#${v}`,
    },
    {
      key: "submittedAt",
      label: "Soumis le",
      render: (v) => new Date(v).toLocaleDateString("fr-FR"),
    },
    {
      key: "status",
      label: "Statut",
      render: (v, row) => (
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status={v} />
          {row.totalCredits > 0 && ["approved", "completed"].includes(v) && (
            <span className="text-xs text-success font-medium">{row.totalCredits} cr. total</span>
          )}
        </div>
      ),
    },
    {
      key: "_id",
      label: "",
      align: "right",
      render: (v) => (
        <Button variant="outline" size="sm" as="a" href={`/admin/simulated/enrollments/${v}`}>
          Détails
        </Button>
      ),
    },
  ];

  // ── Tab content ──

  const catalogueContent = (
    <div>
      {/* Error */}
      {catalogError && (
        <div className="mb-4 rounded border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {catalogError}
        </div>
      )}

      {/* Header row: add button */}
      <div className="flex justify-end mb-4">
        <Button variant="primary" onClick={() => setShowCreateModal(true)}>
          Ajouter un projet
        </Button>
      </div>

      {/* Create Modal */}
      <Modal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Ajouter un projet"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
              Annuler
            </Button>
            <Button
              type="submit"
              form="create-project-form"
              variant="primary"
              loading={isSubmittingCatalog}
            >
              Ajouter
            </Button>
          </div>
        }
      >
        <form id="create-project-form" onSubmit={handleCreateProject} className="space-y-4">
          <FormField label="Titre du projet" required>
            <Input
              type="text"
              value={catalogForm.title}
              onChange={(e) => setCatalogForm({ ...catalogForm, title: e.target.value })}
              placeholder="Ex: Epikodi"
              required
            />
          </FormField>
          <FormField label="Sujet PDF">
            <FileInput
              key={createFileKey}
              accept="application/pdf"
              onChange={(file) => setCatalogForm({ ...catalogForm, file })}
            />
          </FormField>
        </form>
      </Modal>

      {/* Edit Modal */}
      <Modal
        open={editingProject !== null}
        onClose={() => setEditingProject(null)}
        title="Modifier le projet"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setEditingProject(null)}>
              Annuler
            </Button>
            <Button
              type="submit"
              form="edit-project-form"
              variant="primary"
              loading={isSubmittingCatalog}
            >
              Sauvegarder
            </Button>
          </div>
        }
      >
        <form id="edit-project-form" onSubmit={handleUpdateProject} className="space-y-4">
          <FormField label="Titre" required>
            <Input
              type="text"
              value={editingProject?.title ?? ""}
              onChange={(e) =>
                setEditingProject({ ...editingProject, title: e.target.value })
              }
              required
            />
          </FormField>
          <FormField label="Remplacer le PDF">
            <FileInput
              key={editFileKey}
              accept="application/pdf"
              onChange={(file) =>
                setEditingProject({ ...editingProject, newFile: file })
              }
            />
          </FormField>
        </form>
      </Modal>

      {/* Project list */}
      {apiLoading ? (
        <div className="grid gap-4">
          <Skeleton variant="rect" height={80} />
          <Skeleton variant="rect" height={80} />
          <Skeleton variant="rect" height={80} />
        </div>
      ) : catalogProjects.length === 0 ? (
        <EmptyState
          title="Aucun projet dans le catalogue"
          sub="Ajoutez-en un via le bouton ci-dessus."
        />
      ) : (
        <div className="grid gap-4">
          {catalogProjects.map((project) => (
            <Card key={project._id} padding="compact">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  {project.subjectFile ? (
                    <a
                      href={`${process.env.NEXT_PUBLIC_API_URL}/uploads/${project.subjectFile}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 w-16 h-16 bg-danger/5 border border-danger/20 rounded flex items-center justify-center hover:opacity-80 transition-opacity"
                      title="Voir le PDF"
                    >
                      <svg className="w-8 h-8 text-danger" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                      </svg>
                    </a>
                  ) : (
                    <div className="shrink-0 w-16 h-16 bg-surface-2 border border-border rounded flex items-center justify-center">
                      <span className="text-xs text-text-dim">Pas de PDF</span>
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold text-text truncate">{project.title}</p>
                    <p className="text-xs text-text-muted mt-0.5">
                      Ajouté le {new Date(project.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="subtle"
                    size="sm"
                    onClick={() => handleToggleActive(project)}
                    title={project.isActive ? "Cliquer pour désactiver" : "Cliquer pour activer"}
                  >
                    {project.isActive ? "Actif" : "Inactif"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingProject({ ...project, newFile: null })}
                  >
                    Modifier
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleDeleteProject(project._id)}
                  >
                    Supprimer
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  const enrollmentsContent = (
    <div>
      {/* Filters + search */}
      <div className="mb-4">
        <FilterChips
          options={[
            { value: "all", label: "Tous" },
            { value: "pending", label: "En attente" },
            { value: "pending_changes", label: "Modifs requises" },
            { value: "approved", label: "Approuvés" },
            { value: "completed", label: "Terminés" },
            { value: "rejected", label: "Refusés" },
          ]}
          value={enrollmentFilter}
          onChange={setEnrollmentFilter}
        />
      </div>
      <TableToolbar
        search={enrollmentSearch}
        onSearch={setEnrollmentSearch}
        searchPlaceholder="Rechercher étudiant ou projet..."
        className="mb-6"
      />

      {/* Force inscription */}
      <Card className="mb-6">
        <h3 className="font-semibold text-text mb-3">Inscrire un étudiant manuellement</h3>
        {forceError && (
          <div className="mb-3 text-sm text-danger bg-danger/10 px-3 py-2 rounded">
            {forceError}
          </div>
        )}
        {forceSuccess && (
          <div className="mb-3 text-sm text-success bg-success/10 px-3 py-2 rounded">
            {forceSuccess}
          </div>
        )}
        <form onSubmit={handleForceEnroll} className="flex flex-col sm:flex-row gap-3 items-end">
          <div className="flex-1">
            <FormField label="Projet">
              <Select
                value={forceForm.projectId}
                onChange={(e) => setForceForm((prev) => ({ ...prev, projectId: e.target.value }))}
                required
              >
                <option value="">-- Sélectionner un projet --</option>
                {catalogProjects.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.title}{!p.isActive ? " (inactif)" : ""}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          <div className="flex-1">
            <FormField label="Email étudiant">
              <Input
                type="email"
                value={forceForm.studentEmail}
                onChange={(e) => setForceForm((prev) => ({ ...prev, studentEmail: e.target.value }))}
                placeholder="prenom.nom@ecole.fr"
                required
              />
            </FormField>
          </div>
          <Button
            type="submit"
            variant="primary"
            loading={isForceSubmitting}
          >
            Inscrire
          </Button>
        </form>
        <p className="text-xs text-text-dim mt-2">
          Inscrit l&apos;étudiant même si la fenêtre de dépôt est fermée. L&apos;étudiant devra soumettre son lien GitHub depuis son espace.
        </p>
      </Card>

      {/* Export CSV des cycles terminés */}
      <Card className="mb-6">
        <h3 className="font-semibold text-text mb-3">Exporter les cycles terminés (CSV)</h3>
        <div className="flex flex-col sm:flex-row gap-3 items-end">
          <div>
            <FormField label="Date de début">
              <Input
                type="date"
                value={exportStartDate}
                onChange={(e) => setExportStartDate(e.target.value)}
              />
            </FormField>
          </div>
          <div>
            <FormField label="Date de fin">
              <Input
                type="date"
                value={exportEndDate}
                onChange={(e) => setExportEndDate(e.target.value)}
              />
            </FormField>
          </div>
          <Button
            variant="primary"
            onClick={handleExport}
            loading={isExporting}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Télécharger CSV
          </Button>
        </div>
        <p className="text-xs text-text-dim mt-2">
          Sans dates : exporte tous les cycles terminés.
        </p>
      </Card>

      {/* Enrollments table */}
      <DataTable
        columns={enrollmentColumns}
        rows={filteredEnrollments}
        rowKey="_id"
        loading={apiLoading}
        emptyLabel="Aucun suivi à afficher."
      />
    </div>
  );

  const cyclesContent = (
    <div>
      {/* ── Génération automatique ── */}
      <Card className="mb-6">
        <h2 className="text-xl font-bold mb-1 text-text">Génération automatique</h2>
        <p className="text-sm text-text-muted mb-4">
          Génère N cycles consécutifs de 2 semaines (vendredi → vendredi). Chaque cycle : ouverture = vendredi de début, deadline dépôt = mercredi suivant (+5j), défense = vendredi 2 semaines après (+14j).
        </p>
        {genError && (
          <div className="mb-4 rounded border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            {genError}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <FormField label="Date de départ *" hint="1er vendredi du semestre">
            <Input
              type="date"
              value={genForm.firstStartDate}
              onChange={(e) => setGenForm({ ...genForm, firstStartDate: e.target.value })}
            />
          </FormField>
          <FormField label="Nombre de cycles *">
            <Input
              type="number"
              min="1"
              max="52"
              value={genForm.numberOfCycles}
              onChange={(e) => setGenForm({ ...genForm, numberOfCycles: e.target.value })}
            />
          </FormField>
          <FormField label="Préfixe de nom" hint='Ex: "Cycle" → "Cycle 1", "Cycle 2"...'>
            <Input
              type="text"
              value={genForm.namePrefix}
              onChange={(e) => setGenForm({ ...genForm, namePrefix: e.target.value })}
              placeholder="Cycle"
            />
          </FormField>
        </div>
        <Button variant="primary" onClick={handlePreviewGeneration}>
          Prévisualiser
        </Button>

        {genPreview && (
          <div className="mt-5">
            <p className="text-sm font-medium text-text mb-2">
              Aperçu — {genPreview.length} cycle{genPreview.length > 1 ? "s" : ""} à créer :
            </p>
            <div className="overflow-x-auto rounded-lg border border-border mb-4">
              <table className="min-w-full text-sm">
                <thead className="bg-surface-2">
                  <tr>
                    <th className="px-4 py-2 text-left text-text">Nom</th>
                    <th className="px-4 py-2 text-left text-text">Ouverture</th>
                    <th className="px-4 py-2 text-left text-text">Deadline P1</th>
                    <th className="px-4 py-2 text-left text-text">Défense P1</th>
                    <th className="px-4 py-2 text-left text-text">Deadline P2</th>
                    <th className="px-4 py-2 text-left text-text">Défense P2</th>
                  </tr>
                </thead>
                <tbody className="bg-surface divide-y divide-border">
                  {genPreview.map((c, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2 text-text font-medium">{c.name}</td>
                      <td className="px-4 py-2 text-text-muted">{new Date(c.startDate).toLocaleDateString("fr-FR")}</td>
                      <td className="px-4 py-2 text-text-muted">{new Date(c.firstSubmissionDeadline).toLocaleDateString("fr-FR")}</td>
                      <td className="px-4 py-2 text-text-muted">{new Date(c.firstDefenseDate).toLocaleDateString("fr-FR")}</td>
                      <td className="px-4 py-2 text-text-muted">{new Date(c.secondSubmissionDeadline).toLocaleDateString("fr-FR")}</td>
                      <td className="px-4 py-2 text-text-muted">{new Date(c.secondDefenseDate).toLocaleDateString("fr-FR")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-3">
              <Button
                variant="primary"
                onClick={handleConfirmGeneration}
                loading={isGenerating}
              >
                {isGenerating ? "Création en cours..." : `Créer ces ${genPreview.length} cycles`}
              </Button>
              <Button variant="outline" onClick={() => setGenPreview(null)}>
                Annuler
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* ── Import JSON ── */}
      <Card className="mb-6">
        <h2 className="text-xl font-bold mb-1 text-text">Import JSON</h2>
        <p className="text-sm text-text-muted mb-3">
          Collez un tableau JSON de cycles. Chaque objet doit avoir :{" "}
          <code className="bg-surface-2 px-1 rounded text-xs">name</code>,{" "}
          <code className="bg-surface-2 px-1 rounded text-xs">startDate</code>,{" "}
          <code className="bg-surface-2 px-1 rounded text-xs">firstSubmissionDeadline</code>,{" "}
          <code className="bg-surface-2 px-1 rounded text-xs">firstDefenseDate</code>,{" "}
          <code className="bg-surface-2 px-1 rounded text-xs">secondSubmissionDeadline</code>,{" "}
          <code className="bg-surface-2 px-1 rounded text-xs">secondDefenseDate</code>{" "}
          (format <code className="bg-surface-2 px-1 rounded text-xs">YYYY-MM-DD</code>).
        </p>
        <details className="mb-3">
          <summary className="text-xs text-primary cursor-pointer hover:underline">Voir un exemple JSON</summary>
          <pre className="mt-2 bg-surface-2 rounded p-3 text-xs text-text-muted overflow-x-auto">{`[
  {
    "name": "Cycle 1 — Printemps 2026",
    "startDate": "2026-02-28",
    "firstSubmissionDeadline": "2026-03-05",
    "firstDefenseDate": "2026-03-14",
    "secondSubmissionDeadline": "2026-03-19",
    "secondDefenseDate": "2026-03-28",
    "isDoubleCycle": false
  }
]`}</pre>
        </details>
        {jsonError && (
          <div className="mb-4 rounded border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            {jsonError}
          </div>
        )}
        <Textarea
          value={jsonInput}
          onChange={(e) => { setJsonInput(e.target.value); setJsonPreview(null); setJsonError(""); }}
          placeholder='[{ "name": "Cycle 1", "startDate": "2026-02-27", ... }]'
          rows={6}
          className="font-mono mb-3"
        />
        <Button
          variant="primary"
          onClick={handleParseJson}
          disabled={!jsonInput.trim()}
        >
          Analyser
        </Button>

        {jsonPreview && (
          <div className="mt-5">
            <p className="text-sm font-medium text-text mb-2">
              {jsonPreview.length} cycle{jsonPreview.length > 1 ? "s" : ""} détecté{jsonPreview.length > 1 ? "s" : ""} — aperçu :
            </p>
            <div className="overflow-x-auto rounded-lg border border-border mb-4">
              <table className="min-w-full text-sm">
                <thead className="bg-surface-2">
                  <tr>
                    <th className="px-4 py-2 text-left text-text">Nom</th>
                    <th className="px-4 py-2 text-left text-text">Ouverture</th>
                    <th className="px-4 py-2 text-left text-text">Deadline P1</th>
                    <th className="px-4 py-2 text-left text-text">Défense P1</th>
                    <th className="px-4 py-2 text-left text-text">Deadline P2</th>
                    <th className="px-4 py-2 text-left text-text">Défense P2</th>
                    <th className="px-4 py-2 text-left text-text">Double</th>
                  </tr>
                </thead>
                <tbody className="bg-surface divide-y divide-border">
                  {jsonPreview.map((c, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2 text-text font-medium">{c.name}</td>
                      <td className="px-4 py-2 text-text-muted">{new Date(c.startDate).toLocaleDateString("fr-FR")}</td>
                      <td className="px-4 py-2 text-text-muted">{new Date(c.firstSubmissionDeadline).toLocaleDateString("fr-FR")}</td>
                      <td className="px-4 py-2 text-text-muted">{new Date(c.firstDefenseDate).toLocaleDateString("fr-FR")}</td>
                      <td className="px-4 py-2 text-text-muted">{new Date(c.secondSubmissionDeadline).toLocaleDateString("fr-FR")}</td>
                      <td className="px-4 py-2 text-text-muted">{new Date(c.secondDefenseDate).toLocaleDateString("fr-FR")}</td>
                      <td className="px-4 py-2 text-text-muted">{c.isDoubleCycle ? "Oui" : "Non"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-3">
              <Button
                variant="primary"
                onClick={handleImportJson}
                loading={isImporting}
              >
                {isImporting ? "Import en cours..." : `Importer ces ${jsonPreview.length} cycles`}
              </Button>
              <Button
                variant="outline"
                onClick={() => { setJsonPreview(null); setJsonError(""); }}
              >
                Annuler
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* ── Formulaire de création manuelle ── */}
      <Card className="mb-8">
        <h2 className="text-xl font-bold mb-4 text-text">Ajouter un cycle manuellement</h2>
        {cycleError && (
          <div className="mb-4 rounded border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            {cycleError}
          </div>
        )}
        <form onSubmit={handleCreateCycle} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <FormField label="Nom du cycle" required>
              <Input
                type="text"
                value={cycleForm.name}
                onChange={(e) => setCycleForm({ ...cycleForm, name: e.target.value })}
                placeholder="Ex: Cycle 1 — Printemps 2026"
                required
              />
            </FormField>
          </div>
          <FormField label="Ouverture * (vendredi W0)" hint="Début de la fenêtre — vendredi W0">
            <Input
              type="date"
              value={cycleForm.startDate}
              onChange={(e) => setCycleForm({ ...cycleForm, startDate: e.target.value })}
              required
            />
          </FormField>
          <FormField label="Deadline dépôt P1 * (mercredi W1)" hint="Mercredi W1 (+5j)">
            <Input
              type="date"
              value={cycleForm.firstSubmissionDeadline}
              onChange={(e) => setCycleForm({ ...cycleForm, firstSubmissionDeadline: e.target.value })}
              required
            />
          </FormField>
          <FormField label="1ère défense * (vendredi W2)" hint="Vendredi W2 (+14j)">
            <Input
              type="date"
              value={cycleForm.firstDefenseDate}
              onChange={(e) => setCycleForm({ ...cycleForm, firstDefenseDate: e.target.value })}
              required
            />
          </FormField>
          <FormField label="Deadline dépôt P2 * (mercredi W3)" hint="Mercredi W3 (+19j)">
            <Input
              type="date"
              value={cycleForm.secondSubmissionDeadline}
              onChange={(e) => setCycleForm({ ...cycleForm, secondSubmissionDeadline: e.target.value })}
              required
            />
          </FormField>
          <FormField label="2ème défense * (vendredi W4)" hint="Vendredi W4 (+28j) — fin du cycle">
            <Input
              type="date"
              value={cycleForm.secondDefenseDate}
              onChange={(e) => setCycleForm({ ...cycleForm, secondDefenseDate: e.target.value })}
              required
            />
          </FormField>
          <div className="flex items-center pt-2">
            <Switch
              label="Double cycle (ex: vacances)"
              checked={cycleForm.isDoubleCycle}
              onChange={(e) => setCycleForm({ ...cycleForm, isDoubleCycle: e.target.checked })}
            />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" variant="primary" loading={isSubmittingCycle}>
              {isSubmittingCycle ? "Ajout..." : "Ajouter le cycle"}
            </Button>
          </div>
        </form>
      </Card>

      {/* ── Liste des cycles ── */}
      {cycles.length === 0 ? (
        <EmptyState
          title="Aucun cycle planifié"
          sub="Ajoutez-en un ci-dessus."
        />
      ) : (
        <div className="grid gap-4">
          {cycles.map((cycle) => {
            const now = new Date();
            const start = new Date(cycle.startDate);
            const phase1Open = now >= start && now <= new Date(cycle.firstSubmissionDeadline);
            const phase2Open = now >= new Date(cycle.firstDefenseDate) && now <= new Date(cycle.secondSubmissionDeadline);
            const isOpen = phase1Open || phase2Open;
            const isUpcoming = now < start;

            return (
              <Card key={cycle._id} padding="compact">
                {editingCycle && editingCycle._id === cycle._id ? (
                  // ── Mode édition ──
                  <form onSubmit={handleUpdateCycle} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <FormField label="Nom">
                        <Input
                          type="text"
                          value={editingCycle.name}
                          onChange={(e) => setEditingCycle({ ...editingCycle, name: e.target.value })}
                          required
                        />
                      </FormField>
                    </div>
                    <FormField label="Ouverture (W0 ven)">
                      <Input
                        type="date"
                        value={editingCycle.startDate?.slice(0, 10)}
                        onChange={(e) => setEditingCycle({ ...editingCycle, startDate: e.target.value })}
                        required
                      />
                    </FormField>
                    <FormField label="Deadline P1 (W1 mer)">
                      <Input
                        type="date"
                        value={editingCycle.firstSubmissionDeadline?.slice(0, 10)}
                        onChange={(e) => setEditingCycle({ ...editingCycle, firstSubmissionDeadline: e.target.value })}
                        required
                      />
                    </FormField>
                    <FormField label="Défense P1 (W2 ven)">
                      <Input
                        type="date"
                        value={editingCycle.firstDefenseDate?.slice(0, 10)}
                        onChange={(e) => setEditingCycle({ ...editingCycle, firstDefenseDate: e.target.value })}
                        required
                      />
                    </FormField>
                    <FormField label="Deadline P2 (W3 mer)">
                      <Input
                        type="date"
                        value={editingCycle.secondSubmissionDeadline?.slice(0, 10)}
                        onChange={(e) => setEditingCycle({ ...editingCycle, secondSubmissionDeadline: e.target.value })}
                        required
                      />
                    </FormField>
                    <FormField label="Défense P2 (W4 ven)">
                      <Input
                        type="date"
                        value={editingCycle.secondDefenseDate?.slice(0, 10)}
                        onChange={(e) => setEditingCycle({ ...editingCycle, secondDefenseDate: e.target.value })}
                        required
                      />
                    </FormField>
                    <div className="flex items-center">
                      <Switch
                        label="Double cycle"
                        checked={editingCycle.isDoubleCycle}
                        onChange={(e) => setEditingCycle({ ...editingCycle, isDoubleCycle: e.target.checked })}
                      />
                    </div>
                    <div className="sm:col-span-2 flex gap-2">
                      <Button type="submit" variant="primary" loading={isSubmittingCycle}>
                        Sauvegarder
                      </Button>
                      <Button variant="outline" onClick={() => setEditingCycle(null)}>
                        Annuler
                      </Button>
                    </div>
                  </form>
                ) : (
                  // ── Mode affichage ──
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className="font-semibold text-text">{cycle.name}</p>
                        {cycle.isDoubleCycle && (
                          <Badge variant="neutral" size="sm">Double cycle</Badge>
                        )}
                        {isOpen ? (
                          <Badge variant="approved" size="sm">Ouvert</Badge>
                        ) : isUpcoming ? (
                          <Badge variant="neutral" size="sm">À venir</Badge>
                        ) : (
                          <Badge variant="neutral" size="sm">Clôturé</Badge>
                        )}
                      </div>
                      <div className="text-sm text-text-muted space-y-0.5">
                        <p>
                          <span className="text-xs font-semibold uppercase tracking-wide text-primary">P1</span>{" "}
                          Ouverture : <span className="font-medium text-text">{new Date(cycle.startDate).toLocaleDateString("fr-FR")}</span>
                          {" "}→ Deadline : <span className="font-medium text-text">{new Date(cycle.firstSubmissionDeadline).toLocaleDateString("fr-FR")}</span>
                          {" "}· Défense : <span className="font-medium text-text">{new Date(cycle.firstDefenseDate).toLocaleDateString("fr-FR")}</span>
                        </p>
                        <p>
                          <span className="text-xs font-semibold uppercase tracking-wide text-primary">P2</span>{" "}
                          Deadline : <span className="font-medium text-text">{new Date(cycle.secondSubmissionDeadline).toLocaleDateString("fr-FR")}</span>
                          {" "}· Défense finale : <span className="font-medium text-text">{new Date(cycle.secondDefenseDate).toLocaleDateString("fr-FR")}</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingCycle({ ...cycle })}
                      >
                        Modifier
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleDeleteCycle(cycle._id)}
                      >
                        Supprimer
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );

  const tabItems = [
    {
      id: "catalogue",
      label: "Catalogue de projets",
      content: catalogueContent,
    },
    {
      id: "enrollments",
      label: (
        <span className="flex items-center gap-2">
          Suivis étudiants
          {pendingCount > 0 && (
            <Badge variant="pending" size="sm">{pendingCount}</Badge>
          )}
        </span>
      ),
      content: enrollmentsContent,
    },
    {
      id: "cycles",
      label: "Calendrier des cycles",
      content: cyclesContent,
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <Head>
        <title>Hub Projets - Admin Simulated</title>
      </Head>

      <AppHeader />

      <main className="flex-1 container mx-auto px-4 py-8 max-w-7xl">
        <PageHead
          title="Administration — Simulated Professional Work"
          sub="Gérez le catalogue de projets et les suivis étudiants"
        />
        <Tabs defaultValue="catalogue" className="mt-6" items={tabItems} />
      </main>

      <Footer />
    </div>
  );
}
