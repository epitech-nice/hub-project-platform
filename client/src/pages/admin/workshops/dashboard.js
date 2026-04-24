// pages/admin/workshops/dashboard.js
import { useEffect, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { useAuth } from "../../../context/AuthContext";
import { useApi } from "../../../hooks/useApi";
import AppHeader from "../../../components/layout/AppHeader";
import Footer from "../../../components/layout/Footer";
import PageHead from "../../../components/ui/PageHead";
import FilterChips from "../../../components/ui/FilterChips";
import TableToolbar from "../../../components/ui/TableToolbar";
import DataTable from "../../../components/ui/DataTable";
import Select from "../../../components/ui/Select";
import StatusBadge from "../../../components/domain/StatusBadge";

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
    key: "title",
    label: "Titre du workshop",
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

export default function AdminWorkshopsDashboard() {
  const { isAuthenticated, isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const { get, loading: apiLoading } = useApi();
  const [workshops, setWorkshops] = useState([]);
  const [filter, setFilter] = useState("pending");
  const [searchTerm, setSearchTerm] = useState("");
  const [schoolYear, setSchoolYear] = useState("");
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || !isAdmin)) {
      router.push("/");
    }
  }, [isAuthenticated, isAdmin, authLoading, router]);

  useEffect(() => {
    if (!isAuthenticated || !isAdmin) return;
    get("/api/workshops/stats", schoolYear ? { schoolYear } : {})
      .then((r) => setStats(r.data))
      .catch(() => {});
  }, [isAuthenticated, isAdmin, schoolYear]);

  useEffect(() => {
    const fetchWorkshops = async () => {
      if (isAuthenticated && isAdmin) {
        try {
          const response = await get("/api/workshops", {
            status: filter !== "all" ? filter : undefined,
          });
          setWorkshops(response.data);
        } catch (error) {
          console.error("Erreur lors de la récupération des workshops:", error);
        }
      }
    };

    fetchWorkshops();
  }, [isAuthenticated, isAdmin, filter]);

  // Générer les options d'années scolaires (de 2020 jusqu'à l'année en cours)
  const currentYear = new Date().getFullYear();
  const schoolYearOptions = [];
  for (let y = 2020; y <= currentYear; y++) {
    schoolYearOptions.push(`${y}-${y + 1}`);
  }

  // Filtrer par année scolaire (1 sept → 31 août)
  const isInSchoolYear = (date, yearLabel) => {
    if (!yearLabel) return true;
    const startYear = parseInt(yearLabel.split("-")[0], 10);
    const start = new Date(startYear, 8, 1); // 1 septembre
    const end = new Date(startYear + 1, 7, 31, 23, 59, 59); // 31 août
    const d = new Date(date);
    return d >= start && d <= end;
  };

  // Filtrer les workshops en fonction du terme de recherche et de l'année scolaire
  const filteredWorkshops = workshops.filter((workshop) => {
    const matchesSearch =
      !searchTerm ||
      workshop.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      workshop.submittedBy?.name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesYear = isInSchoolYear(workshop.createdAt, schoolYear);
    return matchesSearch && matchesYear;
  });

  if (authLoading) {
    return <div className="text-center py-10 text-text-muted">Chargement...</div>;
  }

  if (!isAuthenticated || !isAdmin) {
    return null;
  }

  const emptySubMessage = searchTerm
    ? "Aucun workshop ne correspond à votre recherche."
    : `Il n'y a actuellement aucun workshop${
        filter === "all"
          ? ""
          : filter === "pending"
          ? " en attente"
          : filter === "pending_changes"
          ? " en attente de modifications"
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
        <title>Hub Projets - Administration des Workshops</title>
      </Head>

      <AppHeader />

      <main className="flex-1 container mx-auto px-4 py-8 max-w-7xl">
        <PageHead
          title="Administration des workshops"
          sub="Gérez les soumissions de workshops des intervenants"
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

        <TableToolbar className="mb-4">
          <div className="flex w-full items-center gap-2">
            <div className="relative flex-1">
              <span
                className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-text-dim"
                aria-hidden="true"
              >
                <svg
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className="h-4 w-4"
                >
                  <circle cx="7" cy="7" r="4.5" />
                  <path d="M10.5 10.5l3 3" strokeLinecap="round" />
                </svg>
              </span>
              <input
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Rechercher un workshop..."
                aria-label="Rechercher un workshop..."
                className="h-9 w-full rounded-md border border-border bg-surface pl-9 pr-3 text-sm text-text placeholder:text-text-dim transition-colors duration-150 ease-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:border-primary/50"
              />
            </div>
            <Select
              value={schoolYear}
              onChange={(e) => setSchoolYear(e.target.value)}
              className="w-44 shrink-0"
            >
              <option value="">Toutes les années</option>
              {schoolYearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          </div>
        </TableToolbar>

        <DataTable
          columns={COLUMNS}
          rows={filteredWorkshops}
          rowKey="_id"
          onRowClick={(workshop) => router.push(`/admin/workshops/${workshop._id}`)}
          emptyLabel={emptySubMessage}
          loading={apiLoading}
        />

        {filteredWorkshops.length > 0 && (
          <p className="mt-4 text-sm text-text-muted">
            Affichage 1–{filteredWorkshops.length} sur {filteredWorkshops.length} workshop{filteredWorkshops.length !== 1 ? "s" : ""}
          </p>
        )}
      </main>

      <Footer />
    </div>
  );
}
