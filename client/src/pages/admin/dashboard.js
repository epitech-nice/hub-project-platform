// pages/admin/dashboard.js
import { useEffect, useState, useRef, useCallback } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { useAuth } from "../../context/AuthContext";
import { useApi } from "../../hooks/useApi";
import AppHeader from "../../components/layout/AppHeader";
import Footer from "../../components/layout/Footer";
import PageHead from "../../components/ui/PageHead";
import FilterChips from "../../components/ui/FilterChips";
import TableToolbar from "../../components/ui/TableToolbar";
import DataTable from "../../components/ui/DataTable";
import Pagination from "../../components/ui/Pagination";
import Modal from "../../components/ui/Modal";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import Select from "../../components/ui/Select";
import StatusBadge from "../../components/domain/StatusBadge";

const FILTER_OPTIONS = [
  { value: "all", label: "Tous" },
  { value: "pending", label: "En attente" },
  { value: "pending_changes", label: "Modifs requises" },
  { value: "approved", label: "Approuvés" },
  { value: "rejected", label: "Refusés" },
  { value: "completed", label: "Terminés" },
];

const COLUMNS = [
  {
    key: "name",
    label: "Nom du projet",
    render: (v) => <span className="font-medium text-text">{v}</span>,
  },
  {
    key: "submittedBy",
    label: "Soumis par",
    render: (v) => v?.name,
  },
  {
    key: "createdAt",
    label: "Date de soumission",
    render: (v) => new Date(v).toLocaleDateString("fr-FR"),
  },
  {
    key: "status",
    label: "Statut",
    render: (v) => <StatusBadge status={v} />,
  },
];

const ITEMS_PER_PAGE = 20;

export default function AdminDashboard() {
  const { isAuthenticated, isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const { get, loading: apiLoading } = useApi();
  const [projects, setProjects] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState("pending");
  const [stats, setStats] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [schoolYear, setSchoolYear] = useState("");
  const [showExportModal, setShowExportModal] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  const prevSearchTermRef = useRef("");

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || !isAdmin)) {
      router.push("/");
    }
  }, [isAuthenticated, isAdmin, authLoading, router]);

  useEffect(() => {
    if (!isAuthenticated || !isAdmin) return;
    get("/api/projects/stats")
      .then((r) => setStats(r.data))
      .catch(() => {});
  }, [isAuthenticated, isAdmin]);

  const fetchProjects = useCallback(async (page) => {
    try {
      const params = { page, limit: ITEMS_PER_PAGE };
      if (filter !== "all") params.status = filter;
      if (searchTerm) params.search = searchTerm;
      if (schoolYear) params.schoolYear = schoolYear;
      const response = await get("/api/projects", params);
      setProjects(response.data);
      setCurrentPage(response.page || page);
      setTotalPages(response.totalPages || 1);
      setTotal(response.total || 0);
    } catch (error) {
      console.error("Erreur lors de la récupération des projets:", error);
    }
  }, [filter, searchTerm, schoolYear]);

  useEffect(() => {
    if (!isAuthenticated || !isAdmin) return;

    setCurrentPage(1);

    const searchChanged = prevSearchTermRef.current !== searchTerm;
    prevSearchTermRef.current = searchTerm;

    if (searchChanged) {
      const timer = setTimeout(() => fetchProjects(1), 300);
      return () => clearTimeout(timer);
    } else {
      fetchProjects(1);
    }
  }, [filter, schoolYear, searchTerm, isAuthenticated, isAdmin, fetchProjects]);

  const handlePageChange = async (newPage) => {
    if (newPage < 1 || newPage > totalPages) return;
    fetchProjects(newPage);
  };

  const currentYear = new Date().getFullYear();
  const schoolYearOptions = [];
  for (let y = 2020; y <= currentYear; y++) {
    schoolYearOptions.push(`${y}-${y + 1}`);
  }

  const handleExportCSV = async () => {
    try {
      setIsExporting(true);

      const params = new URLSearchParams();
      if (startDate) params.append("startDate", startDate);
      if (endDate) params.append("endDate", endDate);

      const token = localStorage.getItem("token");
      const url = `${process.env.NEXT_PUBLIC_API_URL}/api/projects/export/completed-csv${params.toString() ? "?" + params.toString() : ""}`;

      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Erreur lors de l'export");
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `completed_projects_${startDate || "all"}_to_${endDate || "all"}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      window.URL.revokeObjectURL(downloadUrl);

      setShowExportModal(false);
      setStartDate("");
      setEndDate("");
    } catch (error) {
      console.error("Erreur lors de l'export:", error);
      alert(error.message || "Erreur lors de l'export des projets");
    } finally {
      setIsExporting(false);
    }
  };

  if (authLoading) {
    return <div className="text-center py-10 text-text-muted">Chargement...</div>;
  }

  if (!isAuthenticated || !isAdmin) {
    return null;
  }

  const emptySubMessage = searchTerm
    ? "Aucun projet ne correspond à votre recherche."
    : `Il n'y a actuellement aucun projet${
        filter === "all"
          ? ""
          : filter === "pending"
          ? " en attente"
          : filter === "pending_changes"
          ? " avec modifications requises"
          : filter === "approved"
          ? " approuvé"
          : filter === "rejected"
          ? " refusé"
          : filter === "completed"
          ? " terminé"
          : ""
      }.`;

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <Head>
        <title>Hub Projets - Administration</title>
      </Head>

      <AppHeader />

      <main className="flex-1 container mx-auto px-4 py-8 max-w-7xl">
        <PageHead
          title="Administration des projets"
          sub="Gérez les soumissions de projets des étudiants"
          actions={
            filter === "completed" ? (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowExportModal(true)}
              >
                Exporter en CSV
              </Button>
            ) : undefined
          }
        />

        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            {[
              { label: "Total",      value: stats.total,           color: "text-text"      },
              { label: "En attente", value: stats.pending,         color: "text-primary"   },
              { label: "À modifier", value: stats.pending_changes, color: "text-accent"    },
              { label: "Approuvés",  value: stats.approved,        color: "text-secondary" },
              { label: "Refusés",    value: stats.rejected,        color: "text-danger"    },
              { label: "Terminés",   value: stats.completed,       color: "text-text-muted"},
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-xl border border-border bg-surface p-4">
                <p className="text-xs font-semibold text-text-dim tracking-wider mb-2 uppercase">{label}</p>
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
              </div>
            ))}
          </div>
        )}

        <FilterChips
          className="mb-4"
          options={FILTER_OPTIONS}
          value={filter}
          onChange={setFilter}
        />

        <TableToolbar
          className="mb-4"
          search={searchTerm}
          onSearch={setSearchTerm}
          searchPlaceholder="Rechercher un projet..."
        >
          <Select
            value={schoolYear}
            onChange={(e) => setSchoolYear(e.target.value)}
            className="w-40"
          >
            <option value="">Toutes les années</option>
            {schoolYearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </TableToolbar>

        {searchTerm && (
          <p className="mb-3 text-sm text-text-muted">
            {total} résultat{total !== 1 ? "s" : ""} trouvé{total !== 1 ? "s" : ""}
          </p>
        )}

        <DataTable
          columns={COLUMNS}
          rows={projects}
          rowKey="_id"
          onRowClick={(project) => router.push(`/admin/projects/${project._id}`)}
          emptyLabel={emptySubMessage}
          loading={apiLoading}
        />

        {!searchTerm && total > 0 && (
          <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-sm text-text-muted">
              Affichage {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, total)} sur {total} projet{total !== 1 ? "s" : ""}
            </p>
            {totalPages > 1 && (
              <Pagination
                page={currentPage}
                totalPages={totalPages}
                onChange={handlePageChange}
              />
            )}
          </div>
        )}
      </main>

      <Footer />

      <Modal
        open={showExportModal}
        onClose={() => {
          setShowExportModal(false);
          setStartDate("");
          setEndDate("");
        }}
        title="Exporter les projets terminés"
        footer={
          <div className="flex justify-end gap-3">
            <Button
              variant="subtle"
              onClick={() => {
                setShowExportModal(false);
                setStartDate("");
                setEndDate("");
              }}
              disabled={isExporting}
            >
              Annuler
            </Button>
            <Button
              variant="primary"
              onClick={handleExportCSV}
              loading={isExporting}
              disabled={isExporting}
            >
              Exporter
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="export-start-date" className="block text-sm font-medium text-text mb-1.5">
              Date de début
            </label>
            <Input
              id="export-start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="export-end-date" className="block text-sm font-medium text-text mb-1.5">
              Date de fin
            </label>
            <Input
              id="export-end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <p className="text-sm text-text-muted">
            Laissez vide pour exporter tous les projets terminés.
          </p>
        </div>
      </Modal>
    </div>
  );
}
