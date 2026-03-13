// pages/simulated/index.js
import React, { useEffect, useRef, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import Header from "../../components/layout/Header";
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
  const calendarRef = useRef(null);

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

  // Fermer le modal si clic en dehors
  const handleCalendarBackdropClick = (e) => {
    if (calendarRef.current && !calendarRef.current.contains(e.target)) {
      setShowCalendar(false);
    }
  };

  if (authLoading) {
    return <div className="text-center py-10 dark:text-white">Chargement...</div>;
  }

  if (!isAuthenticated) return null;

  const cycle = cycleInfo?.cycle;
  const currentPhase = cycleInfo?.currentPhase;

  return (
    <div className="min-h-screen dark:bg-gray-900">
      <Head>
        <title>Hub Projets - Simulated Professional Work</title>
      </Head>

      <Header />

      <main className="container mx-auto px-4 py-8">
        <div className="flex flex-wrap justify-between items-start gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold dark:text-white">
              Simulated Professional Work
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              Choisissez un projet parmi ceux disponibles. Les projets grisés ont déjà été effectués.
            </p>
          </div>
          <button
            onClick={() => setShowCalendar(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm font-medium transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            Calendrier des cycles
          </button>
        </div>

        {/* Modal calendrier */}
        {showCalendar && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={handleCalendarBackdropClick}
          >
            <div
              ref={calendarRef}
              className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
            >
              {/* En-tête */}
              <div className="flex justify-between items-center px-6 py-4 border-b dark:border-gray-700 shrink-0">
                <h2 className="text-lg font-bold dark:text-white">Calendrier des cycles</h2>
                <button
                  onClick={() => setShowCalendar(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Liste des cycles */}
              <div className="overflow-y-auto px-6 py-4 space-y-4">
                {allCycles.length === 0 ? (
                  <p className="text-center text-gray-500 dark:text-gray-400 py-8">
                    Aucun cycle planifié pour le moment.
                  </p>
                ) : (
                  [...allCycles]
                    .sort((a, b) => {
                      const now = new Date();
                      const getPrio = (cycle) => {
                        const isPast = new Date(cycle.secondDefenseDate) < now;
                        const isFuture = new Date(cycle.startDate) > now;
                        if (!isPast && !isFuture) return 1; // En cours
                        if (isFuture) return 2; // À venir
                        return 3; // Terminé
                      };
                      const prioA = getPrio(a);
                      const prioB = getPrio(b);
                      
                      // Trier par priorité d'abord
                      if (prioA !== prioB) return prioA - prioB;
                      
                      // Si même priorité, on trie par date
                      // Pour les cycles passés, on affiche le plus récent en premier (descendant)
                      if (prioA === 3) return new Date(b.startDate) - new Date(a.startDate);
                      // Pour les cycles à venir ou en cours, on affiche le plus proche en premier (ascendant)
                      return new Date(a.startDate) - new Date(b.startDate);
                    })
                    .map((c) => {
                      const now = new Date();
                    const isPhase1Open = new Date(c.startDate) <= now && now <= new Date(c.firstSubmissionDeadline);
                    const isPhase2Open = new Date(c.firstDefenseDate) <= now && now <= new Date(c.secondSubmissionDeadline);
                    const isPast = new Date(c.secondDefenseDate) < now;
                    const isFuture = new Date(c.startDate) > now;
                    const isCurrentCycle = !isPast && !isFuture;

                    const borderColor = isCurrentCycle
                      ? "border-blue-400 dark:border-blue-500"
                      : isPast
                      ? "border-gray-200 dark:border-gray-700"
                      : "border-gray-200 dark:border-gray-700";

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
                        className={`rounded-lg border-2 ${borderColor} ${
                          isCurrentCycle ? "bg-blue-50 dark:bg-blue-900/20" : isPast ? "bg-gray-50 dark:bg-gray-800/50 opacity-60" : "bg-white dark:bg-gray-800"
                        } p-4`}
                      >
                        {/* Titre du cycle */}
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-900 dark:text-white">{c.name}</span>
                            {c.isDoubleCycle && (
                              <span className="text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 px-2 py-0.5 rounded-full">
                                Double cycle
                              </span>
                            )}
                          </div>
                          {isCurrentCycle && (
                            <span className="text-xs font-semibold bg-blue-600 text-white px-2 py-0.5 rounded-full">
                              {badgeText}
                            </span>
                          )}
                          {isPast && (
                            <span className="text-xs text-gray-400 dark:text-gray-500">Terminé</span>
                          )}
                        </div>

                        {/* Timeline des dates */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                          <TimelineRow
                            icon="▶"
                            label="Ouverture phase 1"
                            date={fmtDate(c.startDate)}
                            active={now <= new Date(c.firstSubmissionDeadline)}
                            colorClass="text-green-600 dark:text-green-400"
                          />
                          <TimelineRow
                            icon="⏱"
                            label="Deadline dépôt phase 1"
                            date={fmtDate(c.firstSubmissionDeadline)}
                            active={now <= new Date(c.firstSubmissionDeadline)}
                            colorClass="text-yellow-600 dark:text-yellow-400"
                          />
                          <TimelineRow
                            icon="🎤"
                            label="1ère défense"
                            date={fmtDate(c.firstDefenseDate)}
                            active={now <= new Date(c.firstDefenseDate)}
                            colorClass="text-blue-600 dark:text-blue-400"
                          />
                          <TimelineRow
                            icon="⏱"
                            label="Deadline dépôt phase 2"
                            date={fmtDate(c.secondSubmissionDeadline)}
                            active={now <= new Date(c.secondSubmissionDeadline)}
                            colorClass="text-yellow-600 dark:text-yellow-400"
                          />
                          <TimelineRow
                            icon="🎤"
                            label="2ème défense (finale)"
                            date={fmtDate(c.secondDefenseDate)}
                            active={now <= new Date(c.secondDefenseDate)}
                            colorClass="text-blue-600 dark:text-blue-400"
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* Bandeau cycle */}
        {cycleInfo !== undefined && (
          cycle ? (
            <div className={`mb-6 flex items-start gap-3 rounded-lg px-4 py-3 border ${
              currentPhase === 1
                ? "bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700"
                : "bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700"
            }`}>
              <svg className={`w-5 h-5 shrink-0 mt-0.5 ${currentPhase === 1 ? "text-green-600 dark:text-green-400" : "text-blue-600 dark:text-blue-400"}`} fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <div>
                <p className={`font-semibold ${currentPhase === 1 ? "text-green-800 dark:text-green-300" : "text-blue-800 dark:text-blue-300"}`}>
                  {currentPhase === 1 ? "Phase 1 ouverte" : "Phase 2 ouverte"} — {cycle.name}
                  {cycle.isDoubleCycle && (
                    <span className="ml-2 text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 px-2 py-0.5 rounded-full font-normal">
                      Double cycle
                    </span>
                  )}
                </p>
                {currentPhase === 1 ? (
                  <p className={`text-sm mt-0.5 text-green-700 dark:text-green-400`}>
                    Choisissez un projet et déposez votre lien GitHub avant le{" "}
                    <strong>{new Date(cycle.firstSubmissionDeadline).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</strong>.{" "}
                    Première défense le {new Date(cycle.firstDefenseDate).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}.
                  </p>
                ) : (
                  <p className={`text-sm mt-0.5 text-blue-700 dark:text-blue-400`}>
                    Mettez à jour votre GitHub Project avant le{" "}
                    <strong>{new Date(cycle.secondSubmissionDeadline).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</strong>.{" "}
                    Défense finale le {new Date(cycle.secondDefenseDate).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="mb-6 flex items-start gap-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-300 dark:border-orange-700 rounded-lg px-4 py-3">
              <svg className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v4a1 1 0 102 0V5zm-1 8a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" />
              </svg>
              <div>
                <p className="font-semibold text-orange-800 dark:text-orange-300">
                  Aucune fenêtre ouverte en ce moment
                </p>
                <p className="text-sm text-orange-700 dark:text-orange-400 mt-0.5">
                  Revenez lors de la prochaine ouverture de cycle pour choisir un projet.
                </p>
              </div>
            </div>
          )
        )}

        {apiLoading ? (
          <div className="text-center py-10 dark:text-white">Chargement des projets...</div>
        ) : catalog.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-8 text-center">
            <p className="text-gray-600 dark:text-gray-300">
              Aucun projet disponible pour le moment.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {catalog.filter((p) => p.isActive).map((project) => {
              const isCompleted = completedProjectIds.includes(project._id);
              return (
                <div key={project._id} className="relative">
                  {isCompleted ? (
                    // ── Projet déjà effectué : grisé, non cliquable ──
                    <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden opacity-50 cursor-not-allowed select-none">
                      <ProjectCard project={project} />
                      <div className="absolute inset-0 flex items-end justify-center pb-4">
                        <span className="bg-gray-800/70 text-white text-sm font-medium px-3 py-1 rounded-full">
                          Déjà effectué
                        </span>
                      </div>
                    </div>
                  ) : (
                    // ── Projet disponible : cliquable ──
                    <Link href={`/simulated/${project._id}`}>
                      <a className="block bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden hover:shadow-lg hover:-translate-y-1 transition-all duration-200">
                        <ProjectCard project={project} />
                      </a>
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

function TimelineRow({ icon, label, date, active, colorClass }) {
  return (
    <div className={`flex items-center gap-2 ${active ? "font-semibold" : "text-gray-600 dark:text-gray-400"}`}>
      <span className={`text-base ${colorClass}`}>{icon}</span>
      <span className="text-gray-500 dark:text-gray-400 min-w-0">{label} —</span>
      <span className={`${active ? colorClass : ""}`}>{date}</span>
    </div>
  );
}

// Carte d'un projet du catalogue
function ProjectCard({ project }) {
  return (
    <>
      {/* Miniature PDF ou placeholder */}
      <div className="aspect-video bg-gray-100 dark:bg-gray-700 flex items-center justify-center border-b dark:border-gray-600 overflow-hidden">
        {project.subjectFile ? (
          <div className="w-full h-full relative">
            <iframe
              src={`${process.env.NEXT_PUBLIC_API_URL}/uploads/${project.subjectFile}#page=1&view=FitH&toolbar=0&navpanes=0&scrollbar=0`}
              className="w-full h-full pointer-events-none"
              title={project.title}
            />
          </div>
        ) : (
          <div className="flex flex-col items-center text-gray-400">
            <svg className="w-12 h-12 mb-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
            </svg>
            <span className="text-sm">Pas de sujet</span>
          </div>
        )}
      </div>

      {/* Titre */}
      <div className="p-4">
        <h2 className="text-lg font-bold dark:text-white text-center">{project.title}</h2>
      </div>
    </>
  );
}
