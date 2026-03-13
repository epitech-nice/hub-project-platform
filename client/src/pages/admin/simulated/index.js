// pages/admin/simulated/index.js
import React, { useEffect, useState, useRef } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import Header from "../../../components/layout/Header";
import { useAuth } from "../../../context/AuthContext";
import { useApi } from "../../../hooks/useApi";

const statusColors = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-800/20 dark:text-yellow-300",
  pending_changes: "bg-orange-100 text-orange-800 dark:bg-orange-800/20 dark:text-orange-300",
  approved: "bg-green-100 text-green-800 dark:bg-green-800/20 dark:text-green-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-800/20 dark:text-red-400",
  completed: "bg-purple-100 text-purple-800 dark:bg-purple-800/20 dark:text-purple-300",
};

const statusLabels = {
  pending: "En attente",
  pending_changes: "Modifications requises",
  approved: "Approuvé",
  rejected: "Refusé",
  completed: "Terminé",
};

export default function AdminSimulated() {
  const { isAuthenticated, isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const { get, post, put, delete: del, loading: apiLoading } = useApi();

  const [activeTab, setActiveTab] = useState("catalogue");

  // ── Catalogue ──
  const [catalogProjects, setCatalogProjects] = useState([]);
  const [catalogForm, setCatalogForm] = useState({ title: "", file: null });
  const [editingProject, setEditingProject] = useState(null);
  const [catalogError, setCatalogError] = useState("");
  const [isSubmittingCatalog, setIsSubmittingCatalog] = useState(false);
  const fileInputRef = useRef(null);
  const editFileInputRef = useRef(null);

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
  const [jsonPreview, setJsonPreview] = useState(null); // tableau parsé ou null
  const [jsonError, setJsonError] = useState("");
  const [isImporting, setIsImporting] = useState(false);

  // ── Génération automatique ──
  const [genForm, setGenForm] = useState({ firstStartDate: "", numberOfCycles: 8, namePrefix: "Cycle" });
  const [genPreview, setGenPreview] = useState(null); // tableau de cycles prévisualisés
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
      if (fileInputRef.current) fileInputRef.current.value = "";
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
      if (editFileInputRef.current) editFileInputRef.current.value = "";
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
    return <div className="text-center py-10 dark:text-white">Chargement...</div>;
  }

  if (!isAuthenticated || !isAdmin) return null;

  return (
    <div className="min-h-screen dark:bg-gray-900">
      <Head>
        <title>Hub Projets - Admin Simulated</title>
      </Head>

      <Header />

      <main className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-6 dark:text-white">
          Administration — Simulated Professional Work
        </h1>

        {/* Onglets */}
        <div className="flex space-x-2 mb-8 border-b dark:border-gray-700">
          <button
            onClick={() => setActiveTab("catalogue")}
            className={`px-6 py-3 font-medium rounded-t-lg transition-colors ${
              activeTab === "catalogue"
                ? "bg-white dark:bg-gray-800 border border-b-white dark:border-gray-700 dark:border-b-gray-800 text-blue-600 dark:text-blue-400 -mb-px"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            }`}
          >
            Catalogue de projets
          </button>
          <button
            onClick={() => setActiveTab("enrollments")}
            className={`px-6 py-3 font-medium rounded-t-lg transition-colors ${
              activeTab === "enrollments"
                ? "bg-white dark:bg-gray-800 border border-b-white dark:border-gray-700 dark:border-b-gray-800 text-blue-600 dark:text-blue-400 -mb-px"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            }`}
          >
            Suivis étudiants
            {enrollments.filter((e) => e.status === "pending").length > 0 && (
              <span className="ml-2 bg-yellow-500 text-white text-xs rounded-full px-2 py-0.5">
                {enrollments.filter((e) => e.status === "pending").length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("cycles")}
            className={`px-6 py-3 font-medium rounded-t-lg transition-colors ${
              activeTab === "cycles"
                ? "bg-white dark:bg-gray-800 border border-b-white dark:border-gray-700 dark:border-b-gray-800 text-blue-600 dark:text-blue-400 -mb-px"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            }`}
          >
            Calendrier des cycles
          </button>
        </div>

        {/* ── TAB : CATALOGUE ── */}
        {activeTab === "catalogue" && (
          <div>
            {/* Formulaire de création */}
            <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-6 mb-8">
              <h2 className="text-xl font-bold mb-4 dark:text-white">Ajouter un projet</h2>
              {catalogError && (
                <div className="bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded mb-4">
                  {catalogError}
                </div>
              )}
              <form onSubmit={handleCreateProject} className="flex flex-col sm:flex-row gap-4 items-end">
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1 dark:text-gray-200">
                    Titre du projet *
                  </label>
                  <input
                    type="text"
                    value={catalogForm.title}
                    onChange={(e) => setCatalogForm({ ...catalogForm, title: e.target.value })}
                    placeholder="Ex: Epikodi"
                    className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    required
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1 dark:text-gray-200">
                    Sujet PDF
                  </label>
                  <input
                    type="file"
                    accept="application/pdf"
                    ref={fileInputRef}
                    onChange={(e) =>
                      setCatalogForm({ ...catalogForm, file: e.target.files[0] || null })
                    }
                    className="w-full text-sm text-gray-500 dark:text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 dark:file:bg-blue-900/30 dark:file:text-blue-300"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSubmittingCatalog}
                  className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-white px-6 py-2 rounded-md disabled:opacity-50 whitespace-nowrap"
                >
                  {isSubmittingCatalog ? "Ajout..." : "Ajouter"}
                </button>
              </form>
            </div>

            {/* Liste des projets */}
            {apiLoading ? (
              <div className="text-center py-10 dark:text-white">Chargement...</div>
            ) : catalogProjects.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-8 text-center">
                <p className="text-gray-600 dark:text-gray-300">
                  Aucun projet dans le catalogue. Ajoutez-en un ci-dessus.
                </p>
              </div>
            ) : (
              <div className="grid gap-4">
                {catalogProjects.map((project) => (
                  <div
                    key={project._id}
                    className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-4"
                  >
                    {editingProject && editingProject._id === project._id ? (
                      // ── Mode édition ──
                      <form onSubmit={handleUpdateProject} className="flex flex-col sm:flex-row gap-4 items-end">
                        <div className="flex-1">
                          <label className="block text-sm font-medium mb-1 dark:text-gray-200">
                            Titre
                          </label>
                          <input
                            type="text"
                            value={editingProject.title}
                            onChange={(e) =>
                              setEditingProject({ ...editingProject, title: e.target.value })
                            }
                            className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                            required
                          />
                        </div>
                        <div className="flex-1">
                          <label className="block text-sm font-medium mb-1 dark:text-gray-200">
                            Remplacer le PDF
                          </label>
                          <input
                            type="file"
                            accept="application/pdf"
                            ref={editFileInputRef}
                            onChange={(e) =>
                              setEditingProject({
                                ...editingProject,
                                newFile: e.target.files[0] || null,
                              })
                            }
                            className="w-full text-sm text-gray-500 dark:text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 dark:file:bg-blue-900/30 dark:file:text-blue-300"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="submit"
                            disabled={isSubmittingCatalog}
                            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md disabled:opacity-50"
                          >
                            Sauvegarder
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingProject(null)}
                            className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white px-4 py-2 rounded-md"
                          >
                            Annuler
                          </button>
                        </div>
                      </form>
                    ) : (
                      // ── Mode affichage ──
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4 min-w-0">
                          {project.subjectFile ? (
                            <a
                              href={`${process.env.NEXT_PUBLIC_API_URL}/uploads/${project.subjectFile}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0 w-16 h-16 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded flex items-center justify-center hover:opacity-80 transition-opacity"
                              title="Voir le PDF"
                            >
                              <svg className="w-8 h-8 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                              </svg>
                            </a>
                          ) : (
                            <div className="shrink-0 w-16 h-16 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded flex items-center justify-center">
                              <span className="text-xs text-gray-400">Pas de PDF</span>
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-semibold dark:text-white truncate">{project.title}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                              Ajouté le {new Date(project.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {/* Toggle actif/inactif */}
                          <button
                            onClick={() => handleToggleActive(project)}
                            className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                              project.isActive
                                ? "bg-green-100 text-green-800 dark:bg-green-800/20 dark:text-green-300 hover:bg-green-200"
                                : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-200"
                            }`}
                            title={project.isActive ? "Cliquer pour désactiver" : "Cliquer pour activer"}
                          >
                            {project.isActive ? "Actif" : "Inactif"}
                          </button>
                          {/* Éditer */}
                          <button
                            onClick={() => setEditingProject({ ...project, newFile: null })}
                            className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-3 py-1 rounded hover:bg-blue-200 dark:hover:bg-blue-900/50 text-sm"
                          >
                            Modifier
                          </button>
                          {/* Supprimer */}
                          <button
                            onClick={() => handleDeleteProject(project._id)}
                            className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-3 py-1 rounded hover:bg-red-200 dark:hover:bg-red-900/50 text-sm"
                          >
                            Supprimer
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TAB : SUIVIS ÉTUDIANTS ── */}
        {activeTab === "enrollments" && (
          <div>
            {/* Filtres */}
            <div className="flex flex-col md:flex-row gap-4 mb-6">
              <div className="flex space-x-2 overflow-x-auto pb-1">
                {[
                  { key: "all", label: "Tous", activeClass: "bg-gray-700 text-white dark:bg-gray-600" },
                  { key: "pending", label: "En attente", activeClass: "bg-yellow-500 text-white" },
                  { key: "pending_changes", label: "Modifs requises", activeClass: "bg-orange-500 text-white" },
                  { key: "approved", label: "Approuvés", activeClass: "bg-green-600 text-white" },
                  { key: "completed", label: "Terminés", activeClass: "bg-purple-600 text-white" },
                  { key: "rejected", label: "Refusés", activeClass: "bg-red-600 text-white" },
                ].map(({ key, label, activeClass }) => (
                  <button
                    key={key}
                    onClick={() => setEnrollmentFilter(key)}
                    className={`px-4 py-2 rounded-md whitespace-nowrap text-sm ${
                      enrollmentFilter === key
                        ? activeClass
                        : "bg-gray-200 dark:bg-gray-700 dark:text-gray-300"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={enrollmentSearch}
                onChange={(e) => setEnrollmentSearch(e.target.value)}
                placeholder="Rechercher étudiant ou projet..."
                className="px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white md:w-72"
              />
            </div>

            {/* Force inscription */}
            <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-4 mb-6">
              <h3 className="font-semibold dark:text-white mb-3">Inscrire un étudiant manuellement</h3>
              {forceError && (
                <div className="mb-3 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded">
                  {forceError}
                </div>
              )}
              {forceSuccess && (
                <div className="mb-3 text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-3 py-2 rounded">
                  {forceSuccess}
                </div>
              )}
              <form onSubmit={handleForceEnroll} className="flex flex-col sm:flex-row gap-3 items-end">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Projet</label>
                  <select
                    value={forceForm.projectId}
                    onChange={(e) => setForceForm((prev) => ({ ...prev, projectId: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
                    required
                  >
                    <option value="">-- Sélectionner un projet --</option>
                    {catalogProjects.map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.title}{!p.isActive ? " (inactif)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Email étudiant</label>
                  <input
                    type="email"
                    value={forceForm.studentEmail}
                    onChange={(e) => setForceForm((prev) => ({ ...prev, studentEmail: e.target.value }))}
                    placeholder="prenom.nom@ecole.fr"
                    className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={isForceSubmitting}
                  className="bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-700 dark:hover:bg-indigo-800 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50 whitespace-nowrap"
                >
                  {isForceSubmitting ? "Inscription..." : "Inscrire"}
                </button>
              </form>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                Inscrit l&apos;étudiant même si la fenêtre de dépôt est fermée. L&apos;étudiant devra soumettre son lien GitHub depuis son espace.
              </p>
            </div>

            {/* Export CSV des cycles terminés */}
            <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-4 mb-6">
              <h3 className="font-semibold dark:text-white mb-3">Exporter les cycles terminés (CSV)</h3>
              <div className="flex flex-col sm:flex-row gap-3 items-end">
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Date de début</label>
                  <input
                    type="date"
                    value={exportStartDate}
                    onChange={(e) => setExportStartDate(e.target.value)}
                    className="px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Date de fin</label>
                  <input
                    type="date"
                    value={exportEndDate}
                    onChange={(e) => setExportEndDate(e.target.value)}
                    className="px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
                  />
                </div>
                <button
                  onClick={handleExport}
                  disabled={isExporting}
                  className="bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-800 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50 flex items-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  {isExporting ? "Export..." : "Télécharger CSV"}
                </button>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                Sans dates : exporte tous les cycles terminés.
              </p>
            </div>

            {apiLoading ? (
              <div className="text-center py-10 dark:text-white">Chargement...</div>
            ) : filteredEnrollments.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-8 text-center">
                <p className="text-gray-600 dark:text-gray-300">Aucun suivi à afficher.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full bg-white dark:bg-gray-800 shadow-md rounded-lg">
                  <thead className="bg-gray-100 dark:bg-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left dark:text-gray-200">Étudiant</th>
                      <th className="px-4 py-3 text-left dark:text-gray-200">Projet</th>
                      <th className="px-4 py-3 text-left dark:text-gray-200">Cycle</th>
                      <th className="px-4 py-3 text-left dark:text-gray-200">Soumis le</th>
                      <th className="px-4 py-3 text-left dark:text-gray-200">Statut</th>
                      <th className="px-4 py-3 text-center dark:text-gray-200">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEnrollments.map((enrollment) => (
                      <tr key={enrollment._id} className="border-t dark:border-gray-700">
                        <td className="px-4 py-3 dark:text-white">
                          <p className="font-medium">{enrollment.student.name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {enrollment.student.email}
                          </p>
                        </td>
                        <td className="px-4 py-3 dark:text-gray-300">
                          {enrollment.simulatedProject.title}
                          {enrollment.isDoubleCycle && (
                            <span className="ml-2 text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 px-1.5 py-0.5 rounded">
                              Double
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 dark:text-gray-300 text-center">
                          #{enrollment.cycleNumber}
                        </td>
                        <td className="px-4 py-3 dark:text-gray-300 text-sm">
                          {new Date(enrollment.submittedAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${statusColors[enrollment.status]}`}>
                            {statusLabels[enrollment.status]}
                          </span>
                          {enrollment.totalCredits > 0 && ["approved", "completed"].includes(enrollment.status) && (
                            <span className="ml-2 text-xs text-green-700 dark:text-green-400 font-medium">
                              {enrollment.totalCredits} cr. total
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Link href={`/admin/simulated/enrollments/${enrollment._id}`}>
                            <a className="bg-blue-600 dark:bg-blue-700 text-white px-3 py-1 rounded hover:bg-blue-700 dark:hover:bg-blue-800 text-sm">
                              Détails
                            </a>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        {/* ── TAB : CYCLES ── */}
        {activeTab === "cycles" && (
          <div>
            {/* ── Génération automatique ── */}
            <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-6 mb-6">
              <h2 className="text-xl font-bold mb-1 dark:text-white">Génération automatique</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Génère N cycles consécutifs de 2 semaines (vendredi → vendredi). Chaque cycle : ouverture = vendredi de début, deadline dépôt = mercredi suivant (+5j), défense = vendredi 2 semaines après (+14j).
              </p>
              {genError && (
                <div className="bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded mb-4">
                  {genError}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium mb-1 dark:text-gray-200">Date de départ *</label>
                  <input
                    type="date"
                    value={genForm.firstStartDate}
                    onChange={(e) => setGenForm({ ...genForm, firstStartDate: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                  <p className="text-xs text-gray-400 mt-0.5">1er vendredi du semestre</p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 dark:text-gray-200">Nombre de cycles *</label>
                  <input
                    type="number"
                    min="1"
                    max="52"
                    value={genForm.numberOfCycles}
                    onChange={(e) => setGenForm({ ...genForm, numberOfCycles: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 dark:text-gray-200">Préfixe de nom</label>
                  <input
                    type="text"
                    value={genForm.namePrefix}
                    onChange={(e) => setGenForm({ ...genForm, namePrefix: e.target.value })}
                    placeholder="Cycle"
                    className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                  <p className="text-xs text-gray-400 mt-0.5">Ex: "Cycle" → "Cycle 1", "Cycle 2"...</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handlePreviewGeneration}
                className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-white px-5 py-2 rounded-md text-sm"
              >
                Prévisualiser
              </button>

              {genPreview && (
                <div className="mt-5">
                  <p className="text-sm font-medium dark:text-gray-200 mb-2">
                    Aperçu — {genPreview.length} cycle{genPreview.length > 1 ? "s" : ""} à créer :
                  </p>
                  <div className="overflow-x-auto rounded-lg border dark:border-gray-700 mb-4">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-100 dark:bg-gray-700">
                        <tr>
                          <th className="px-4 py-2 text-left dark:text-gray-200">Nom</th>
                          <th className="px-4 py-2 text-left dark:text-gray-200">Ouverture</th>
                          <th className="px-4 py-2 text-left dark:text-gray-200">Deadline P1</th>
                          <th className="px-4 py-2 text-left dark:text-gray-200">Défense P1</th>
                          <th className="px-4 py-2 text-left dark:text-gray-200">Deadline P2</th>
                          <th className="px-4 py-2 text-left dark:text-gray-200">Défense P2</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-100 dark:divide-gray-700">
                        {genPreview.map((c, i) => (
                          <tr key={i}>
                            <td className="px-4 py-2 dark:text-white font-medium">{c.name}</td>
                            <td className="px-4 py-2 dark:text-gray-300">{new Date(c.startDate).toLocaleDateString("fr-FR")}</td>
                            <td className="px-4 py-2 dark:text-gray-300">{new Date(c.firstSubmissionDeadline).toLocaleDateString("fr-FR")}</td>
                            <td className="px-4 py-2 dark:text-gray-300">{new Date(c.firstDefenseDate).toLocaleDateString("fr-FR")}</td>
                            <td className="px-4 py-2 dark:text-gray-300">{new Date(c.secondSubmissionDeadline).toLocaleDateString("fr-FR")}</td>
                            <td className="px-4 py-2 dark:text-gray-300">{new Date(c.secondDefenseDate).toLocaleDateString("fr-FR")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={handleConfirmGeneration}
                      disabled={isGenerating}
                      className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-md text-sm font-medium disabled:opacity-50"
                    >
                      {isGenerating ? "Création en cours..." : `Créer ces ${genPreview.length} cycles`}
                    </button>
                    <button
                      type="button"
                      onClick={() => setGenPreview(null)}
                      className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white px-4 py-2 rounded-md text-sm"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* ── Import JSON ── */}
            <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-6 mb-6">
              <h2 className="text-xl font-bold mb-1 dark:text-white">Import JSON</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                Collez un tableau JSON de cycles. Chaque objet doit avoir : <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded text-xs">name</code>, <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded text-xs">startDate</code>, <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded text-xs">firstSubmissionDeadline</code>, <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded text-xs">firstDefenseDate</code>, <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded text-xs">secondSubmissionDeadline</code>, <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded text-xs">secondDefenseDate</code> (format <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded text-xs">YYYY-MM-DD</code>).
              </p>
              <details className="mb-3">
                <summary className="text-xs text-blue-600 dark:text-blue-400 cursor-pointer hover:underline">Voir un exemple JSON</summary>
                <pre className="mt-2 bg-gray-100 dark:bg-gray-700 rounded p-3 text-xs text-gray-700 dark:text-gray-300 overflow-x-auto">{`[
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
                <div className="bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded mb-4">
                  {jsonError}
                </div>
              )}
              <textarea
                value={jsonInput}
                onChange={(e) => { setJsonInput(e.target.value); setJsonPreview(null); setJsonError(""); }}
                placeholder='[{ "name": "Cycle 1", "startDate": "2026-02-27", ... }]'
                rows={6}
                className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white font-mono text-sm mb-3"
              />
              <button
                type="button"
                onClick={handleParseJson}
                disabled={!jsonInput.trim()}
                className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-white px-5 py-2 rounded-md text-sm disabled:opacity-50"
              >
                Analyser
              </button>

              {jsonPreview && (
                <div className="mt-5">
                  <p className="text-sm font-medium dark:text-gray-200 mb-2">
                    {jsonPreview.length} cycle{jsonPreview.length > 1 ? "s" : ""} détecté{jsonPreview.length > 1 ? "s" : ""} — aperçu :
                  </p>
                  <div className="overflow-x-auto rounded-lg border dark:border-gray-700 mb-4">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-100 dark:bg-gray-700">
                        <tr>
                          <th className="px-4 py-2 text-left dark:text-gray-200">Nom</th>
                          <th className="px-4 py-2 text-left dark:text-gray-200">Ouverture</th>
                          <th className="px-4 py-2 text-left dark:text-gray-200">Deadline P1</th>
                          <th className="px-4 py-2 text-left dark:text-gray-200">Défense P1</th>
                          <th className="px-4 py-2 text-left dark:text-gray-200">Deadline P2</th>
                          <th className="px-4 py-2 text-left dark:text-gray-200">Défense P2</th>
                          <th className="px-4 py-2 text-left dark:text-gray-200">Double</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-100 dark:divide-gray-700">
                        {jsonPreview.map((c, i) => (
                          <tr key={i}>
                            <td className="px-4 py-2 dark:text-white font-medium">{c.name}</td>
                            <td className="px-4 py-2 dark:text-gray-300">{new Date(c.startDate).toLocaleDateString("fr-FR")}</td>
                            <td className="px-4 py-2 dark:text-gray-300">{new Date(c.firstSubmissionDeadline).toLocaleDateString("fr-FR")}</td>
                            <td className="px-4 py-2 dark:text-gray-300">{new Date(c.firstDefenseDate).toLocaleDateString("fr-FR")}</td>
                            <td className="px-4 py-2 dark:text-gray-300">{new Date(c.secondSubmissionDeadline).toLocaleDateString("fr-FR")}</td>
                            <td className="px-4 py-2 dark:text-gray-300">{new Date(c.secondDefenseDate).toLocaleDateString("fr-FR")}</td>
                            <td className="px-4 py-2 dark:text-gray-300">{c.isDoubleCycle ? "Oui" : "Non"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={handleImportJson}
                      disabled={isImporting}
                      className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-md text-sm font-medium disabled:opacity-50"
                    >
                      {isImporting ? "Import en cours..." : `Importer ces ${jsonPreview.length} cycles`}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setJsonPreview(null); setJsonError(""); }}
                      className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white px-4 py-2 rounded-md text-sm"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Formulaire de création manuelle */}
            <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-6 mb-8">
              <h2 className="text-xl font-bold mb-4 dark:text-white">Ajouter un cycle manuellement</h2>
              {cycleError && (
                <div className="bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded mb-4">
                  {cycleError}
                </div>
              )}
              <form onSubmit={handleCreateCycle} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium mb-1 dark:text-gray-200">
                    Nom du cycle *
                  </label>
                  <input
                    type="text"
                    value={cycleForm.name}
                    onChange={(e) => setCycleForm({ ...cycleForm, name: e.target.value })}
                    placeholder="Ex: Cycle 1 — Printemps 2026"
                    className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 dark:text-gray-200">Ouverture * (vendredi W0)</label>
                  <input type="date" value={cycleForm.startDate}
                    onChange={(e) => setCycleForm({ ...cycleForm, startDate: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white" required />
                  <p className="text-xs text-gray-400 mt-0.5">Début de la fenêtre — vendredi W0</p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 dark:text-gray-200">Deadline dépôt P1 * (mercredi W1)</label>
                  <input type="date" value={cycleForm.firstSubmissionDeadline}
                    onChange={(e) => setCycleForm({ ...cycleForm, firstSubmissionDeadline: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white" required />
                  <p className="text-xs text-gray-400 mt-0.5">Mercredi W1 (+5j)</p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 dark:text-gray-200">1ère défense * (vendredi W2)</label>
                  <input type="date" value={cycleForm.firstDefenseDate}
                    onChange={(e) => setCycleForm({ ...cycleForm, firstDefenseDate: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white" required />
                  <p className="text-xs text-gray-400 mt-0.5">Vendredi W2 (+14j)</p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 dark:text-gray-200">Deadline dépôt P2 * (mercredi W3)</label>
                  <input type="date" value={cycleForm.secondSubmissionDeadline}
                    onChange={(e) => setCycleForm({ ...cycleForm, secondSubmissionDeadline: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white" required />
                  <p className="text-xs text-gray-400 mt-0.5">Mercredi W3 (+19j)</p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 dark:text-gray-200">2ème défense * (vendredi W4)</label>
                  <input type="date" value={cycleForm.secondDefenseDate}
                    onChange={(e) => setCycleForm({ ...cycleForm, secondDefenseDate: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white" required />
                  <p className="text-xs text-gray-400 mt-0.5">Vendredi W4 (+28j) — fin du cycle</p>
                </div>
                <div className="flex items-center gap-3 pt-5">
                  <input
                    type="checkbox"
                    id="isDoubleCycle"
                    checked={cycleForm.isDoubleCycle}
                    onChange={(e) => setCycleForm({ ...cycleForm, isDoubleCycle: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <label htmlFor="isDoubleCycle" className="text-sm font-medium dark:text-gray-200">
                    Double cycle (ex: vacances)
                  </label>
                </div>
                <div className="sm:col-span-2">
                  <button
                    type="submit"
                    disabled={isSubmittingCycle}
                    className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-white px-6 py-2 rounded-md disabled:opacity-50"
                  >
                    {isSubmittingCycle ? "Ajout..." : "Ajouter le cycle"}
                  </button>
                </div>
              </form>
            </div>

            {/* Liste des cycles */}
            {cycles.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-8 text-center">
                <p className="text-gray-600 dark:text-gray-300">
                  Aucun cycle planifié. Ajoutez-en un ci-dessus.
                </p>
              </div>
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
                    <div key={cycle._id} className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-4">
                      {editingCycle && editingCycle._id === cycle._id ? (
                        // ── Mode édition ──
                        <form onSubmit={handleUpdateCycle} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="sm:col-span-2">
                            <label className="block text-sm font-medium mb-1 dark:text-gray-200">Nom</label>
                            <input
                              type="text"
                              value={editingCycle.name}
                              onChange={(e) => setEditingCycle({ ...editingCycle, name: e.target.value })}
                              className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                              required
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-1 dark:text-gray-200">Ouverture (W0 ven)</label>
                            <input type="date" value={editingCycle.startDate?.slice(0, 10)}
                              onChange={(e) => setEditingCycle({ ...editingCycle, startDate: e.target.value })}
                              className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white" required />
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-1 dark:text-gray-200">Deadline P1 (W1 mer)</label>
                            <input type="date" value={editingCycle.firstSubmissionDeadline?.slice(0, 10)}
                              onChange={(e) => setEditingCycle({ ...editingCycle, firstSubmissionDeadline: e.target.value })}
                              className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white" required />
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-1 dark:text-gray-200">Défense P1 (W2 ven)</label>
                            <input type="date" value={editingCycle.firstDefenseDate?.slice(0, 10)}
                              onChange={(e) => setEditingCycle({ ...editingCycle, firstDefenseDate: e.target.value })}
                              className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white" required />
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-1 dark:text-gray-200">Deadline P2 (W3 mer)</label>
                            <input type="date" value={editingCycle.secondSubmissionDeadline?.slice(0, 10)}
                              onChange={(e) => setEditingCycle({ ...editingCycle, secondSubmissionDeadline: e.target.value })}
                              className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white" required />
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-1 dark:text-gray-200">Défense P2 (W4 ven)</label>
                            <input type="date" value={editingCycle.secondDefenseDate?.slice(0, 10)}
                              onChange={(e) => setEditingCycle({ ...editingCycle, secondDefenseDate: e.target.value })}
                              className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white" required />
                          </div>
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={editingCycle.isDoubleCycle}
                              onChange={(e) => setEditingCycle({ ...editingCycle, isDoubleCycle: e.target.checked })}
                              className="w-4 h-4"
                            />
                            <label className="text-sm dark:text-gray-200">Double cycle</label>
                          </div>
                          <div className="sm:col-span-2 flex gap-2">
                            <button
                              type="submit"
                              disabled={isSubmittingCycle}
                              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md disabled:opacity-50"
                            >
                              Sauvegarder
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingCycle(null)}
                              className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white px-4 py-2 rounded-md"
                            >
                              Annuler
                            </button>
                          </div>
                        </form>
                      ) : (
                        // ── Mode affichage ──
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <p className="font-semibold dark:text-white">{cycle.name}</p>
                              {cycle.isDoubleCycle && (
                                <span className="text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 px-2 py-0.5 rounded-full">
                                  Double cycle
                                </span>
                              )}
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                isOpen
                                  ? "bg-green-100 text-green-800 dark:bg-green-800/20 dark:text-green-300"
                                  : isUpcoming
                                  ? "bg-blue-100 text-blue-800 dark:bg-blue-800/20 dark:text-blue-300"
                                  : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
                              }`}>
                                {isOpen ? "Ouvert" : isUpcoming ? "À venir" : "Clôturé"}
                              </span>
                            </div>
                            <div className="text-sm text-gray-500 dark:text-gray-400 space-y-0.5">
                              <p>
                                <span className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">P1</span>{" "}
                                Ouverture : <span className="font-medium text-gray-700 dark:text-gray-300">{new Date(cycle.startDate).toLocaleDateString("fr-FR")}</span>
                                {" "}→ Deadline : <span className="font-medium text-gray-700 dark:text-gray-300">{new Date(cycle.firstSubmissionDeadline).toLocaleDateString("fr-FR")}</span>
                                {" "}· Défense : <span className="font-medium text-gray-700 dark:text-gray-300">{new Date(cycle.firstDefenseDate).toLocaleDateString("fr-FR")}</span>
                              </p>
                              <p>
                                <span className="text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">P2</span>{" "}
                                Deadline : <span className="font-medium text-gray-700 dark:text-gray-300">{new Date(cycle.secondSubmissionDeadline).toLocaleDateString("fr-FR")}</span>
                                {" "}· Défense finale : <span className="font-medium text-gray-700 dark:text-gray-300">{new Date(cycle.secondDefenseDate).toLocaleDateString("fr-FR")}</span>
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <button
                              onClick={() => setEditingCycle({ ...cycle })}
                              className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-3 py-1 rounded hover:bg-blue-200 dark:hover:bg-blue-900/50 text-sm"
                            >
                              Modifier
                            </button>
                            <button
                              onClick={() => handleDeleteCycle(cycle._id)}
                              className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-3 py-1 rounded hover:bg-red-200 dark:hover:bg-red-900/50 text-sm"
                            >
                              Supprimer
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
