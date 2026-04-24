import { useEffect, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { toast } from "react-toastify";
import AppHeader from "../components/layout/AppHeader";
import Footer from "../components/layout/Footer";
import BentoCard from "../components/ui/BentoCard";
import Button from "../components/ui/Button";
import Skeleton from "../components/ui/Skeleton";
import Input from "../components/ui/Input";
import EmptyState from "../components/ui/EmptyState";
import StatusBadge from "../components/domain/StatusBadge";
import { useAuth } from "../context/AuthContext";
import { useApi } from "../hooks/useApi";

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

const IconGrid = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
    <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM13 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2h-2z" />
  </svg>
);

const IconArrowUp = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-5 w-5" aria-hidden="true">
    <path d="M10 3v14M3 10l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconBook = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
    <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" />
  </svg>
);

const IconHexagon = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5" aria-hidden="true">
    <path d="M10 2l7 4v8l-7 4-7-4V6l7-4z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconBriefcase = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
    <path fillRule="evenodd" d="M6 6V5a3 3 0 013-3h2a3 3 0 013 3v1h2a2 2 0 012 2v3.57A22.952 22.952 0 0110 13a22.95 22.95 0 01-8-1.43V8a2 2 0 012-2h2zm2-1a1 1 0 011-1h2a1 1 0 011 1v1H8V5zm1 5a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1z" clipRule="evenodd" />
    <path d="M2 13.692V16a2 2 0 002 2h12a2 2 0 002-2v-2.308A24.974 24.974 0 0110 15c-2.796 0-5.487-.46-8-1.308z" />
  </svg>
);

const FILTER_OPTIONS = [
  { value: "all",      label: "Tous" },
  { value: "pending",  label: "En attente" },
  { value: "approved", label: "Validés" },
  { value: "changes",  label: "À revoir" },
  { value: "rejected", label: "Refusés" },
];

export default function Dashboard() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const { get, delete: deleteRequest, loading: apiLoading } = useApi();
  const [projects, setProjects] = useState([]);
  const [simulatedLabel, setSimulatedLabel] = useState(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push("/");
  }, [isAuthenticated, authLoading, router]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const fetchProjects = async () => {
      try {
        const response = await get("/api/projects/me");
        setProjects(response.data);
      } catch (error) {
        console.error("Erreur lors de la récupération des projets:", error);
      }
    };
    fetchProjects();

    const fetchSimulated = async () => {
      try {
        // 1. Enrollment personnel actif
        const me = await get("/api/simulated/me");
        if (me.data) {
          const e = me.data;
          const dateStr = new Date(e.defenseDate).toLocaleDateString("fr-FR", {
            weekday: "long", day: "numeric", month: "long",
          });
          setSimulatedLabel(`Cycle ${e.cycleNumber} · ${dateStr}`);
          return;
        }
        // 2. Cycle global en cours (fallback admin / sans enrollment)
        const cycleRes = await get("/api/simulated/cycles/current");
        if (!cycleRes.data) return;
        const { cycle, currentPhase } = cycleRes.data;
        if (!cycle) return;
        const defenseDate = currentPhase === 1 ? cycle.firstDefenseDate : cycle.secondDefenseDate;
        const dateStr = new Date(defenseDate).toLocaleDateString("fr-FR", {
          weekday: "long", day: "numeric", month: "long",
        });
        const shortName = cycle.name.split(/\s*[—–-]\s*/)[0].trim();
        setSimulatedLabel(`${shortName} · ${dateStr}`);
      } catch {}
    };
    fetchSimulated();
  }, [isAuthenticated]);

  const handleDelete = async (projectId) => {
    if (!window.confirm("Êtes-vous sûr de vouloir supprimer ce projet ? Cette action est irréversible.")) return;
    try {
      await deleteRequest(`/api/projects/${projectId}`);
      setProjects((prev) => prev.filter((p) => p._id !== projectId));
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

  const firstName = user?.name?.split(" ")[0] ?? "étudiant";

  // Stats
  const statPending  = projects.filter((p) => p.status === "pending").length;
  const statApproved = projects.filter((p) => p.status === "approved" || p.status === "completed").length;
  const statChanges  = projects.filter((p) => p.status === "pending_changes").length;
  const statRejected = projects.filter((p) => p.status === "rejected").length;
  const progressPct  = projects.length > 0 ? Math.round((statApproved / projects.length) * 100) : 0;

  // Filter predicate map
  const filterFns = {
    all:      () => true,
    pending:  (p) => p.status === "pending",
    approved: (p) => p.status === "approved" || p.status === "completed",
    changes:  (p) => p.status === "pending_changes",
    rejected: (p) => p.status === "rejected",
  };
  const filteredProjects = projects
    .filter(filterFns[filter] ?? (() => true))
    .filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()));

  // Count per filter for the pill labels
  const filterCounts = {
    all:      projects.length,
    pending:  statPending,
    approved: statApproved,
    changes:  statChanges,
    rejected: statRejected,
  };

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <Head>
        <title>Hub Projets - Tableau de bord</title>
      </Head>

      <AppHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="border-b border-border bg-surface">
          <div className="container mx-auto px-4 py-8 max-w-container">
            <p className="text-text-muted text-sm mb-1">Tableau de bord</p>
            <h1 className="text-2xl font-bold tracking-tight text-text">
              Bonjour, {firstName}
            </h1>
          </div>
        </section>

        {/* Bento navigation */}
        <section className="container mx-auto px-4 py-8 max-w-container">
          <div className="flex flex-col gap-5">
            {/* Row 1 — 2 cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <BentoCard variant="highlight" as="a" href="/dashboard" aria-label="Mes projets">
                <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center mb-3 text-primary">
                  <IconGrid />
                </div>
                <p className="text-2xl font-bold text-text mb-0.5">
                  {projects.length}
                  <span className="text-base font-normal text-text-muted ml-2">
                    projet{projects.length !== 1 ? "s" : ""} soumis
                  </span>
                </p>
                {projects.length > 0 && (
                  <div className="mt-3">
                    <div className="h-1.5 rounded-full bg-border overflow-hidden">
                      <div
                        className="h-full rounded-full bg-accent transition-all duration-500"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                    <p className="text-xs text-text-muted mt-1.5">
                      {progressPct}% validés
                    </p>
                  </div>
                )}
              </BentoCard>

              <BentoCard as="a" href="/submit-project" aria-label="Soumettre un projet">
                <div className="w-10 h-10 rounded-xl bg-surface-2 border border-border flex items-center justify-center mb-3 text-primary">
                  <IconArrowUp />
                </div>
                <p className="text-sm font-semibold text-text mb-1">Soumettre un projet</p>
                <p className="text-sm text-text-dim leading-relaxed">
                  Nouvelle idée ? Soumettez votre projet et suivez les retours.
                </p>
              </BentoCard>
            </div>

            {/* Row 2 — 3 cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <BentoCard as="a" href="/workshops/dashboard" aria-label="Workshops">
                <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center mb-3 text-accent">
                  <IconBook />
                </div>
                <p className="text-sm font-semibold text-text mb-1">Workshops</p>
                <p className="text-sm text-text-dim">Mes ateliers</p>
              </BentoCard>

              <BentoCard as="a" href="/simulated" aria-label="Travaux pratiques Simulated">
                <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center mb-3 text-primary">
                  <IconHexagon />
                </div>
                <p className="text-sm font-semibold text-text mb-1">Simulated</p>
                <p className="text-sm text-text-dim">{simulatedLabel ?? "Travail professionnel simulé"}</p>
              </BentoCard>

              <BentoCard as="a" href="/inventory" aria-label="Inventaire du matériel">
                <div className="w-10 h-10 rounded-xl bg-secondary/15 flex items-center justify-center mb-3 text-secondary">
                  <IconBriefcase />
                </div>
                <p className="text-sm font-semibold text-text mb-1">Inventaire</p>
                <p className="text-sm text-text-dim">Matériel disponible</p>
              </BentoCard>
            </div>
          </div>
        </section>

        {/* Projects section */}
        <section className="container mx-auto px-4 pb-12 max-w-container">
          {/* Section header */}
          <div className="flex items-end justify-between mb-6">
            <div>
              <p className="text-xs text-text-muted mb-1">Hub · Projets</p>
              <h2 className="text-xl font-bold text-text">Mes soumissions</h2>
            </div>
            <Button variant="primary" size="sm" as="a" href="/submit-project">
              + Nouveau projet
            </Button>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {[
              { label: "EN ATTENTE", value: statPending,        color: "text-primary"   },
              { label: "VALIDÉS",    value: statApproved,       color: "text-secondary" },
              { label: "À REVOIR",   value: statChanges,        color: "text-accent"    },
              { label: "TOTAL",      value: projects.length,    color: "text-text"      },
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
                placeholder="Rechercher un projet..."
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
            ) : filteredProjects.length === 0 ? (
              <div className="p-8">
                <EmptyState
                  title="Aucun projet à afficher"
                  sub={
                    search
                      ? "Aucun projet ne correspond à votre recherche."
                      : filter === "all"
                      ? "Vous n'avez pas encore soumis de projet."
                      : "Aucun projet avec ce statut."
                  }
                  action={
                    filter === "all" && !search ? (
                      <Button variant="primary" as="a" href="/submit-project">
                        Soumettre mon premier projet
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
                      PROJET
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
                  {filteredProjects.map((project) => {
                    const canEdit =
                      project.isCreator &&
                      (project.status === "pending" || project.status === "pending_changes");
                    return (
                      <tr
                        key={project._id}
                        className="border-b border-border last:border-0 hover:bg-surface-2 cursor-pointer transition-colors duration-100"
                        onClick={() => router.push(`/projects/${project._id}`)}
                      >
                        <td className="px-4 py-3.5">
                          <p className="text-sm font-medium text-text">{project.name}</p>
                          <p className="text-xs text-text-dim mt-0.5">
                            Soumis le{" "}
                            {new Date(project.createdAt).toLocaleDateString("fr-FR")}
                          </p>
                        </td>
                        <td className="hidden sm:table-cell px-4 py-3.5">
                          <StatusBadge status={project.status} />
                        </td>
                        <td className="hidden md:table-cell px-4 py-3.5 text-sm text-text-muted">
                          {timeAgo(project.updatedAt || project.createdAt)}
                        </td>
                        <td
                          className="px-4 py-3.5 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {canEdit ? (
                            <div className="flex justify-end gap-1">
                              <button
                                className="px-2.5 py-1 text-xs text-text-muted hover:text-text border border-border rounded-md hover:bg-surface-2 transition-colors"
                                onClick={() => router.push(`/projects/edit/${project._id}`)}
                              >
                                Modifier
                              </button>
                              <button
                                className="px-2.5 py-1 text-xs text-danger/80 hover:text-danger border border-border rounded-md hover:bg-danger/5 transition-colors"
                                onClick={() => handleDelete(project._id)}
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
