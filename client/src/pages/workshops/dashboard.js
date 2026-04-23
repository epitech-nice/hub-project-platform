import { useEffect, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { toast } from "react-toastify";
import AppHeader from "../../components/layout/AppHeader";
import Footer from "../../components/layout/Footer";
import Button from "../../components/ui/Button";
import Skeleton from "../../components/ui/Skeleton";
import Input from "../../components/ui/Input";
import EmptyState from "../../components/ui/EmptyState";
import StatusBadge from "../../components/domain/StatusBadge";
import { useAuth } from "../../context/AuthContext";
import { useApi } from "../../hooks/useApi";

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `il y a ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `il y a ${hrs} h`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "hier";
  if (days < 7) return `il y a ${days} j`;
  return new Date(dateStr).toLocaleDateString("fr-FR");
}

const FILTER_OPTIONS = [
  { value: "all",      label: "Tous" },
  { value: "pending",  label: "En attente" },
  { value: "approved", label: "Validés" },
  { value: "changes",  label: "À revoir" },
  { value: "rejected", label: "Refusés" },
];

export default function WorkshopsDashboard() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const { get, delete: deleteRequest, loading: apiLoading } = useApi();
  const [workshops, setWorkshops] = useState([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push("/");
  }, [isAuthenticated, authLoading, router]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const fetchWorkshops = async () => {
      try {
        const response = await get("/api/workshops/me");
        setWorkshops(response.data);
      } catch (error) {
        console.error("Erreur lors de la récupération des workshops:", error);
      }
    };
    fetchWorkshops();
  }, [isAuthenticated]);

  const handleDelete = async (workshopId) => {
    if (!window.confirm("Êtes-vous sûr de vouloir supprimer ce workshop ? Cette action est irréversible.")) return;
    try {
      await deleteRequest(`/api/workshops/${workshopId}`);
      setWorkshops((prev) => prev.filter((w) => w._id !== workshopId));
    } catch {
      toast.error("Une erreur est survenue lors de la suppression.");
    }
  };

  if (authLoading) {
    return (
      <div className="flex justify-center py-16">
        <Skeleton variant="rect" width={320} height={48} />
      </div>
    );
  }
  if (!isAuthenticated) return null;

  // Stats
  const statPending  = workshops.filter((w) => w.status === "pending").length;
  const statApproved = workshops.filter((w) => w.status === "approved" || w.status === "completed").length;
  const statChanges  = workshops.filter((w) => w.status === "pending_changes").length;

  const filterFns = {
    all:      () => true,
    pending:  (w) => w.status === "pending",
    approved: (w) => w.status === "approved" || w.status === "completed",
    changes:  (w) => w.status === "pending_changes",
    rejected: (w) => w.status === "rejected",
  };
  const filteredWorkshops = workshops
    .filter(filterFns[filter] ?? (() => true))
    .filter((w) => !search || w.title.toLowerCase().includes(search.toLowerCase()));

  const filterCounts = {
    all:      workshops.length,
    pending:  statPending,
    approved: statApproved,
    changes:  statChanges,
    rejected: workshops.filter((w) => w.status === "rejected").length,
  };

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <Head>
        <title>Hub Projets - Workshops</title>
      </Head>

      <AppHeader />

      <main className="flex-1">
        {/* Header */}
        <section className="border-b border-border bg-surface">
          <div className="container mx-auto px-4 py-8 max-w-container">
            <p className="text-text-muted text-sm mb-1">Hub · Workshops</p>
            <h1 className="text-2xl font-bold tracking-tight text-text">Mes workshops</h1>
          </div>
        </section>

        <section className="container mx-auto px-4 py-8 pb-12 max-w-container">
          {/* Section header */}
          <div className="flex items-end justify-between mb-6">
            <h2 className="text-xl font-bold text-text">Mes soumissions</h2>
            <Button variant="primary" size="sm" as="a" href="/submit-workshop">
              + Nouveau workshop
            </Button>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {[
              { label: "EN ATTENTE", value: statPending,       color: "text-primary"   },
              { label: "VALIDÉS",    value: statApproved,      color: "text-secondary" },
              { label: "À REVOIR",   value: statChanges,       color: "text-accent"    },
              { label: "TOTAL",      value: workshops.length,  color: "text-text"      },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-xl border border-border bg-surface p-4">
                <p className="text-xs font-semibold text-text-dim tracking-wider mb-2">{label}</p>
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Table panel */}
          <div className="rounded-xl border border-border bg-surface overflow-hidden">
            {/* Toolbar */}
            <div className="p-4 border-b border-border flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
              <Input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un workshop..."
                className="w-full sm:w-64"
              />
              <div className="flex flex-wrap gap-2">
                {FILTER_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setFilter(opt.value)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors duration-150 ${
                      filter === opt.value
                        ? "bg-primary text-white"
                        : "bg-surface-2 text-text-muted hover:text-text border border-border"
                    }`}
                  >
                    {opt.label} · {filterCounts[opt.value]}
                  </button>
                ))}
              </div>
            </div>

            {/* Content */}
            {apiLoading ? (
              <div className="p-6 space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} variant="rect" height={52} />
                ))}
              </div>
            ) : filteredWorkshops.length === 0 ? (
              <div className="p-8">
                <EmptyState
                  title="Aucun workshop à afficher"
                  sub={
                    search
                      ? "Aucun workshop ne correspond à votre recherche."
                      : filter === "all"
                      ? "Vous n'avez pas encore soumis de workshop."
                      : "Aucun workshop avec ce statut."
                  }
                  action={
                    filter === "all" && !search ? (
                      <Button variant="primary" as="a" href="/submit-workshop">
                        Soumettre mon premier workshop
                      </Button>
                    ) : null
                  }
                />
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-text-dim tracking-wider">
                      WORKSHOP
                    </th>
                    <th className="hidden sm:table-cell px-4 py-3 text-left text-xs font-semibold text-text-dim tracking-wider">
                      STATUT
                    </th>
                    <th className="hidden md:table-cell px-4 py-3 text-left text-xs font-semibold text-text-dim tracking-wider">
                      MAJ
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-text-dim tracking-wider">
                      ACTIONS
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredWorkshops.map((workshop) => {
                    const canEdit =
                      workshop.isMain &&
                      (workshop.status === "pending" || workshop.status === "pending_changes");
                    return (
                      <tr
                        key={workshop._id}
                        className="border-b border-border last:border-0 hover:bg-surface-2 cursor-pointer transition-colors duration-100"
                        onClick={() => router.push(`/workshops/${workshop._id}`)}
                      >
                        <td className="px-4 py-3.5">
                          <p className="text-sm font-medium text-text">{workshop.title}</p>
                          <p className="text-xs text-text-dim mt-0.5">
                            {workshop.isMain ? "Soumis" : "Intervenant"} le{" "}
                            {new Date(workshop.createdAt).toLocaleDateString("fr-FR")}
                          </p>
                        </td>
                        <td className="hidden sm:table-cell px-4 py-3.5">
                          <StatusBadge status={workshop.status} />
                        </td>
                        <td className="hidden md:table-cell px-4 py-3.5 text-sm text-text-muted">
                          {timeAgo(workshop.updatedAt || workshop.createdAt)}
                        </td>
                        <td
                          className="px-4 py-3.5 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {canEdit ? (
                            <div className="flex justify-end gap-1">
                              <button
                                className="px-2.5 py-1 text-xs text-text-muted hover:text-text border border-border rounded-md hover:bg-surface-2 transition-colors"
                                onClick={() => router.push(`/workshops/edit/${workshop._id}`)}
                              >
                                Modifier
                              </button>
                              <button
                                className="px-2.5 py-1 text-xs text-danger/80 hover:text-danger border border-border rounded-md hover:bg-danger/5 transition-colors"
                                onClick={() => handleDelete(workshop._id)}
                              >
                                Supprimer
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-text-dim select-none">→</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
