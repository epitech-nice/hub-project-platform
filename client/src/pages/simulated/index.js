// pages/simulated/index.js
import { useEffect, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import AppHeader from "../../components/layout/AppHeader";
import Footer from "../../components/layout/Footer";
import Modal from "../../components/ui/Modal";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import EmptyState from "../../components/ui/EmptyState";
import Skeleton from "../../components/ui/Skeleton";
import { useAuth } from "../../context/AuthContext";
import { useApi } from "../../hooks/useApi";

export default function SimulatedCatalog() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const { get, loading: apiLoading } = useApi();

  const [catalog, setCatalog] = useState([]);
  const [completedProjectIds, setCompletedProjectIds] = useState([]);
  // undefined = chargement, null = aucune fenêtre ouverte, { cycle, currentPhase } = fenêtre ouverte
  const [cycleInfo, setCycleInfo] = useState(undefined);
  const [showCalendar, setShowCalendar] = useState(false);
  const [allCycles, setAllCycles] = useState([]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push("/");
  }, [isAuthenticated, authLoading, router]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchData();
    }
  }, [isAuthenticated]);

  const fetchData = async () => {
    try {
      const [catalogRes, historyRes, cycleRes, upcomingRes] = await Promise.all([
        get("/api/simulated/catalog"),
        get("/api/simulated/my-history"),
        get("/api/simulated/cycles/current"),
        get("/api/simulated/cycles/upcoming"),
      ]);
      setCatalog(catalogRes.data);

      // Un projet est "déjà effectué" seulement si la phase 2 a été approuvée/completée
      const doneIds = historyRes.data
        .filter((e) => e.phase === 2 && ["approved", "completed"].includes(e.status))
        .map((e) => e.simulatedProject.projectId);
      setCompletedProjectIds(doneIds);

      setCycleInfo(cycleRes.data); // null si aucune fenêtre ouverte, sinon { cycle, currentPhase }
      setAllCycles(upcomingRes.data);
    } catch (e) {
      console.error(e);
      setCycleInfo(null);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-bg">
        <AppHeader />
        <main className="flex-1 container mx-auto px-4 py-8 max-w-7xl">
          <Skeleton variant="text" width="40%" height={32} className="mb-4" />
          <Skeleton variant="text" width="60%" height={20} className="mb-8" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => <Skeleton key={i} variant="rect" height={200} />)}
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  const cycle = cycleInfo?.cycle;
  const currentPhase = cycleInfo?.currentPhase;

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <Head>
        <title>Hub Projets - Simulated Professional Work</title>
      </Head>

      <AppHeader />

      <main className="flex-1 container mx-auto px-4 py-8 max-w-7xl">
        <div className="flex flex-wrap justify-between items-start gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-text">Simulated Professional Work</h1>
            <p className="text-text-muted mt-1 text-sm">
              Choisissez un projet parmi ceux disponibles. Les projets grisés ont déjà été effectués.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => setShowCalendar(true)}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            Calendrier des cycles
          </Button>
        </div>

        {/* Cycle banner */}
        {cycleInfo !== undefined && (
          cycle ? (
            <div
              className="mb-6 flex items-start gap-3 rounded-lg px-4 py-3 border"
              style={
                currentPhase === 1
                  ? {
                      backgroundColor: 'rgb(var(--status-approved-bg))',
                      borderColor: 'rgb(var(--status-approved-text))',
                    }
                  : {
                      backgroundColor: 'rgb(var(--primary-ghost))',
                      borderColor: 'rgb(var(--primary-border))',
                    }
              }
            >
              <svg
                className="w-5 h-5 shrink-0 mt-0.5"
                style={{ color: currentPhase === 1 ? 'rgb(var(--status-approved-text))' : 'rgb(var(--primary))' }}
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <div>
                <p
                  className="font-semibold"
                  style={{ color: currentPhase === 1 ? 'rgb(var(--status-approved-text))' : 'rgb(var(--primary))' }}
                >
                  {currentPhase === 1 ? "Phase 1 ouverte" : "Phase 2 ouverte"} — {cycle.name}
                  {cycle.isDoubleCycle && (
                    <Badge variant="neutral" size="sm" className="ml-2">Double cycle</Badge>
                  )}
                </p>
                {currentPhase === 1 ? (
                  <p className="text-sm mt-0.5" style={{ color: 'rgb(var(--status-approved-text))' }}>
                    Choisissez un projet et déposez votre lien GitHub avant le{" "}
                    <strong>{new Date(cycle.firstSubmissionDeadline).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</strong>.{" "}
                    Première défense le {new Date(cycle.firstDefenseDate).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}.
                  </p>
                ) : (
                  <p className="text-sm mt-0.5 text-primary">
                    Mettez à jour votre GitHub Project avant le{" "}
                    <strong>{new Date(cycle.secondSubmissionDeadline).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</strong>.{" "}
                    Défense finale le {new Date(cycle.secondDefenseDate).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div
              className="mb-6 flex items-start gap-3 rounded-lg px-4 py-3 border"
              style={{
                backgroundColor: 'rgb(var(--status-changes-bg))',
                borderColor: 'rgb(var(--status-changes-text))',
              }}
            >
              <svg
                className="w-5 h-5 shrink-0 mt-0.5"
                style={{ color: 'rgb(var(--status-changes-text))' }}
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v4a1 1 0 102 0V5zm-1 8a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" />
              </svg>
              <div>
                <p className="font-semibold" style={{ color: 'rgb(var(--status-changes-text))' }}>
                  Aucune fenêtre ouverte en ce moment
                </p>
                <p className="text-sm mt-0.5" style={{ color: 'rgb(var(--status-changes-text))' }}>
                  Revenez lors de la prochaine ouverture de cycle pour choisir un projet.
                </p>
              </div>
            </div>
          )
        )}

        {/* Project grid */}
        {apiLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => <Skeleton key={i} variant="rect" height={200} />)}
          </div>
        ) : catalog.filter((p) => p.isActive).length === 0 ? (
          <EmptyState
            title="Aucun projet disponible"
            sub="Aucun projet n'est disponible pour le moment."
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {catalog.filter((p) => p.isActive).map((project) => {
              const isCompleted = completedProjectIds.includes(project._id);
              return (
                <div key={project._id} className="relative">
                  {isCompleted ? (
                    <div className="opacity-50 cursor-not-allowed select-none">
                      <Card className="overflow-hidden">
                        <ProjectCard project={project} />
                      </Card>
                      <div className="absolute inset-0 flex items-end justify-center pb-4 pointer-events-none">
                        <span className="bg-surface text-text-muted text-sm font-medium px-3 py-1 rounded-full border border-border">
                          Déjà effectué
                        </span>
                      </div>
                    </div>
                  ) : (
                    <Card
                      interactive
                      className="overflow-hidden"
                      onClick={() => router.push(`/simulated/${project._id}`)}
                    >
                      <ProjectCard project={project} />
                    </Card>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      <Footer />

      {/* Calendar modal */}
      <Modal
        open={showCalendar}
        onClose={() => setShowCalendar(false)}
        title="Calendrier des cycles"
        size="lg"
      >
        {allCycles.length === 0 ? (
          <p className="text-center text-text-muted py-8">
            Aucun cycle planifié pour le moment.
          </p>
        ) : (
          <div className="space-y-4">
            {[...allCycles]
              .sort((a, b) => {
                const now = new Date();
                const getPrio = (c) => {
                  const isPast = new Date(c.secondDefenseDate) < now;
                  const isFuture = new Date(c.startDate) > now;
                  if (!isPast && !isFuture) return 1;
                  if (isFuture) return 2;
                  return 3;
                };
                const prioA = getPrio(a);
                const prioB = getPrio(b);
                if (prioA !== prioB) return prioA - prioB;
                if (prioA === 3) return new Date(b.startDate) - new Date(a.startDate);
                return new Date(a.startDate) - new Date(b.startDate);
              })
              .map((c) => {
                const now = new Date();
                const isPhase1Open = new Date(c.startDate) <= now && now <= new Date(c.firstSubmissionDeadline);
                const isPhase2Open = new Date(c.firstDefenseDate) <= now && now <= new Date(c.secondSubmissionDeadline);
                const isPast = new Date(c.secondDefenseDate) < now;
                const isFuture = new Date(c.startDate) > now;
                const isCurrentCycle = !isPast && !isFuture;

                let badgeText = "Cycle en cours";
                if (isPhase1Open) badgeText = "Phase 1 en cours";
                else if (isPhase2Open) badgeText = "Phase 2 en cours";
                else if (now > new Date(c.firstSubmissionDeadline) && now <= new Date(c.firstDefenseDate)) badgeText = "Défenses phase 1";
                else if (now > new Date(c.secondSubmissionDeadline) && now <= new Date(c.secondDefenseDate)) badgeText = "Défenses finales";

                const fmtDate = (d) =>
                  new Date(d).toLocaleDateString("fr-FR", {
                    weekday: "short", day: "numeric", month: "short",
                  });

                return (
                  <div
                    key={c._id}
                    className={`rounded-lg border-2 p-4 ${
                      isCurrentCycle
                        ? "border-primary bg-primary-ghost"
                        : isPast
                        ? "border-border bg-surface-2 opacity-60"
                        : "border-border bg-surface"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-text">{c.name}</span>
                        {c.isDoubleCycle && (
                          <Badge variant="neutral" size="sm">Double cycle</Badge>
                        )}
                      </div>
                      {isCurrentCycle && (
                        <span
                          className="text-xs font-semibold px-2 py-0.5 rounded-full text-white"
                          style={{ backgroundColor: 'rgb(var(--primary))' }}
                        >
                          {badgeText}
                        </span>
                      )}
                      {isPast && (
                        <span className="text-xs text-text-muted">Terminé</span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                      <TimelineRow
                        icon="▶"
                        label="Ouverture phase 1"
                        date={fmtDate(c.startDate)}
                        active={now <= new Date(c.firstSubmissionDeadline)}
                        color="rgb(var(--status-approved-text))"
                      />
                      <TimelineRow
                        icon="⏱"
                        label="Deadline dépôt phase 1"
                        date={fmtDate(c.firstSubmissionDeadline)}
                        active={now <= new Date(c.firstSubmissionDeadline)}
                        color="rgb(var(--status-pending-text))"
                      />
                      <TimelineRow
                        icon="🎤"
                        label="1ère défense"
                        date={fmtDate(c.firstDefenseDate)}
                        active={now <= new Date(c.firstDefenseDate)}
                        color="rgb(var(--primary))"
                      />
                      <TimelineRow
                        icon="⏱"
                        label="Deadline dépôt phase 2"
                        date={fmtDate(c.secondSubmissionDeadline)}
                        active={now <= new Date(c.secondSubmissionDeadline)}
                        color="rgb(var(--status-pending-text))"
                      />
                      <TimelineRow
                        icon="🎤"
                        label="2ème défense (finale)"
                        date={fmtDate(c.secondDefenseDate)}
                        active={now <= new Date(c.secondDefenseDate)}
                        color="rgb(var(--primary))"
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </Modal>
    </div>
  );
}

function TimelineRow({ icon, label, date, active, color }) {
  return (
    <div className={`flex items-center gap-2 ${active ? "font-semibold" : "text-text-muted"}`}>
      <span style={{ color }}>{icon}</span>
      <span className="text-text-dim min-w-0">{label} —</span>
      <span style={active ? { color } : {}}>{date}</span>
    </div>
  );
}

function ProjectCard({ project }) {
  return (
    <>
      <div className="aspect-video bg-surface-2 flex items-center justify-center border-b border-border overflow-hidden">
        {project.subjectFile ? (
          <div className="w-full h-full relative">
            <iframe
              src={`${process.env.NEXT_PUBLIC_API_URL}/uploads/${project.subjectFile}#page=1&view=FitH&toolbar=0&navpanes=0&scrollbar=0`}
              className="w-full h-full pointer-events-none"
              title={project.title}
            />
          </div>
        ) : (
          <div className="flex flex-col items-center text-text-dim">
            <svg className="w-12 h-12 mb-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
            </svg>
            <span className="text-sm">Pas de sujet</span>
          </div>
        )}
      </div>
      <div className="p-4">
        <h2 className="text-lg font-bold text-text text-center">{project.title}</h2>
      </div>
    </>
  );
}
