// pages/simulated/[id].js
import React, { useEffect, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import Header from "../../components/layout/Header";
import { useAuth } from "../../context/AuthContext";
import { useApi } from "../../hooks/useApi";

const statusBadge = {
  pending:          { color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-800/20 dark:text-yellow-300",   label: "En attente de validation" },
  pending_changes:  { color: "bg-orange-100 text-orange-800 dark:bg-orange-800/20 dark:text-orange-300",   label: "Modifications requises" },
  approved:         { color: "bg-green-100 text-green-800 dark:bg-green-800/20 dark:text-green-300",       label: "Approuvé" },
  rejected:         { color: "bg-red-100 text-red-800 dark:bg-red-800/20 dark:text-red-300",               label: "Refusé" },
  completed:        { color: "bg-purple-100 text-purple-800 dark:bg-purple-800/20 dark:text-purple-300",   label: "Terminé" },
};

export default function SimulatedProjectDetail() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const { id } = router.query;
  const { get, loading: apiLoading } = useApi();

  const [project, setProject] = useState(null);
  const [myEnrollment, setMyEnrollment] = useState(null); // enrollment actif (pending/pending_changes/approved)
  const [myHistory, setMyHistory] = useState([]);
  // undefined = chargement, null = fermé, { cycle, currentPhase } = ouvert
  const [cycleInfo, setCycleInfo] = useState(undefined);

  const [githubLink, setGithubLink] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push("/");
  }, [isAuthenticated, authLoading, router]);

  useEffect(() => {
    if (isAuthenticated && id) fetchData();
  }, [isAuthenticated, id]);

  const fetchData = async () => {
    try {
      const [projectRes, enrollmentRes, historyRes, cycleRes] = await Promise.all([
        get(`/api/simulated/catalog/${id}`),
        get("/api/simulated/me"),
        get("/api/simulated/my-history"),
        get("/api/simulated/cycles/current"),
      ]);

      setProject(projectRes.data || null);
      setMyEnrollment(enrollmentRes.data);
      setMyHistory(historyRes.data);
      setCycleInfo(cycleRes.data); // null ou { cycle, currentPhase }

      if (enrollmentRes.data && String(enrollmentRes.data.simulatedProject.projectId) === String(id)) {
        setGithubLink(enrollmentRes.data.githubProjectLink || "");
      } else {
        setGithubLink("");
      }
    } catch {
      setProject(null);
      setCycleInfo(null);
    }
  };

  const cycle = cycleInfo?.cycle;
  const currentPhase = cycleInfo?.currentPhase;

  // Enrollment sur CE projet (actif ou terminé) — un seul par projet dans le nouveau modèle
  const enrollmentForThisProject = myHistory.find(
    (e) => String(e.simulatedProject.projectId) === String(id)
  );

  // Projet terminé = marqué "completed" par l'admin
  const isAlreadyDone = enrollmentForThisProject &&
    enrollmentForThisProject.status === "completed";

  // L'enrollment actif concerne CE projet
  const isCurrentProject =
    myEnrollment && String(myEnrollment.simulatedProject.projectId) === String(id);

  // Enrollment actif sur un AUTRE projet
  const hasActiveEnrollmentElsewhere = myEnrollment && !isCurrentProject;

  const canEditCurrentEnrollment =
    isCurrentProject &&
    !myEnrollment.lockedByAdmin &&
    ["pending", "pending_changes"].includes(myEnrollment.status);

  const handleEnroll = async (e) => {
    e.preventDefault();
    setError(""); setSuccessMsg("");
    if (!githubLink.trim()) { setError("Le lien GitHub Project est requis."); return; }
    setIsSubmitting(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/simulated/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ projectId: id, githubProjectLink: githubLink }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      setSuccessMsg("Projet soumis avec succès ! En attente de validation.");
      setMyEnrollment(data.data);
      await fetchData();
    } catch (err) {
      setError(err.message || "Une erreur est survenue.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    setError(""); setSuccessMsg("");
    if (!githubLink.trim()) { setError("Le lien GitHub Project est requis."); return; }
    setIsSubmitting(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/simulated/enrollments/${myEnrollment._id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ githubProjectLink: githubLink }),
        }
      );
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      setSuccessMsg(
        myEnrollment.phase === 2
          ? "Lien mis à jour pour la phase 2 !"
          : "Lien mis à jour avec succès !"
      );
      setMyEnrollment(data.data);
    } catch (err) {
      setError(err.message || "Une erreur est survenue.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading || apiLoading) {
    return <div className="text-center py-10 dark:text-white">Chargement...</div>;
  }

  if (!project) {
    return (
      <div className="min-h-screen dark:bg-gray-900">
        <Header />
        <main className="container mx-auto px-4 py-8 text-center dark:text-white">
          Projet introuvable.
        </main>
      </div>
    );
  }

  const fmt = (d) => d ? new Date(d).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) : null;
  const fmtShort = (d) => d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : null;

  return (
    <div className="min-h-screen dark:bg-gray-900">
      <Head>
        <title>Hub Projets - {project.title}</title>
      </Head>
      <Header />

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Retour */}
        <button onClick={() => router.back()} className="text-blue-600 dark:text-blue-400 hover:underline flex items-center mb-6">
          &larr; Retour au catalogue
        </button>

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
                  <p className="text-sm text-green-700 dark:text-green-400 mt-0.5">
                    Dépôt du lien GitHub avant le <strong>{fmt(cycle.firstSubmissionDeadline)}</strong>.
                    {" "}Défense le {fmt(cycle.firstDefenseDate)}.
                  </p>
                ) : (
                  <p className="text-sm text-blue-700 dark:text-blue-400 mt-0.5">
                    Mise à jour du GitHub Project avant le <strong>{fmt(cycle.secondSubmissionDeadline)}</strong>.
                    {" "}Défense finale le {fmt(cycle.secondDefenseDate)}.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="mb-6 flex items-start gap-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-300 dark:border-orange-700 rounded-lg px-4 py-3">
              <svg className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v4a1 1 0 102 0V5zm-1 8a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" />
              </svg>
              <p className="text-sm text-orange-800 dark:text-orange-300">
                <span className="font-semibold">Aucune fenêtre ouverte.</span>{" "}
                Revenez lors du prochain cycle pour soumettre un projet.
              </p>
            </div>
          )
        )}

        {/* Titre */}
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold dark:text-white">{project.title}</h1>
          {!project.isActive && (
            <span className="mt-2 inline-block text-xs bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400 px-3 py-1 rounded-full">
              Projet inactif — consultation uniquement
            </span>
          )}
        </div>

        {/* PDF */}
        {project.subjectFile ? (
          <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden mb-8">
            <iframe
              src={`${process.env.NEXT_PUBLIC_API_URL}/uploads/${project.subjectFile}#toolbar=1`}
              className="w-full"
              style={{ height: "75vh" }}
              title={`Sujet : ${project.title}`}
            />
          </div>
        ) : (
          <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-12 text-center mb-8 text-gray-400">
            Aucun document sujet disponible.
          </div>
        )}

        {/* ── Bloc enrollment (si existant sur ce projet) ── */}
        {enrollmentForThisProject && (
          <EnrollmentBlock enrollment={enrollmentForThisProject} fmtShort={fmtShort} />
        )}

        {/* ── Zone d'action ── */}
        <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-6">
          {error && (
            <div className="bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}
          {successMsg && (
            <div className="bg-green-100 dark:bg-green-900/30 border border-green-400 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded mb-4">
              {successMsg}
            </div>
          )}

          {/* Projet complètement terminé */}
          {isAlreadyDone && (
            <p className="text-center text-gray-500 dark:text-gray-400 py-4">
              Ce projet est terminé. Consultation uniquement.
            </p>
          )}

          {/* Enrollment actif sur un autre projet */}
          {!isAlreadyDone && !isCurrentProject && hasActiveEnrollmentElsewhere && (
            <p className="text-center text-gray-500 dark:text-gray-400 py-4">
              Vous avez déjà un projet en cours (<strong>{myEnrollment.simulatedProject.title}</strong>).
              Attendez qu&apos;il soit terminé avant d&apos;en choisir un autre.
            </p>
          )}

          {/* Formulaire : choisir ce projet (phase 1, pas encore inscrit) */}
          {!isAlreadyDone && !hasActiveEnrollmentElsewhere && !isCurrentProject &&
           project.isActive && currentPhase === 1 && (
            <form onSubmit={handleEnroll}>
              <h2 className="text-xl font-bold dark:text-white mb-4">Choisir ce projet — Phase 1</h2>
              <div className="mb-4">
                <label className="block font-medium mb-1 dark:text-gray-200">Lien GitHub Project *</label>
                <input
                  type="url"
                  value={githubLink}
                  onChange={(e) => setGithubLink(e.target.value)}
                  placeholder="https://github.com/users/xxx/projects/1"
                  className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  required
                />
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Lien vers votre GitHub Project avec les tâches à effectuer.
                </p>
              </div>
              <button type="submit" disabled={isSubmitting}
                className="w-full bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-white py-3 rounded-lg font-medium disabled:opacity-50">
                {isSubmitting ? "Soumission en cours..." : "Choisir ce projet"}
              </button>
            </form>
          )}

          {/* Notice phase 2 : défense 1 passée, l'étudiant doit mettre à jour son GitHub */}
          {isCurrentProject && myEnrollment.phase === 2 && !myEnrollment.lockedByAdmin && (
            <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
              <p className="text-sm text-blue-800 dark:text-blue-300 font-medium">
                Défense phase 1 passée
                {myEnrollment.phase1Credits !== null ? ` — ${myEnrollment.phase1Credits} crédit(s) obtenus.` : "."}
              </p>
              {myEnrollment.status === "pending_changes" && (
                <p className="text-sm text-blue-700 dark:text-blue-400 mt-0.5">
                  Mettez à jour votre GitHub Project et soumettez-le pour la défense finale.
                </p>
              )}
              {myEnrollment.status === "pending" && (
                <p className="text-sm text-blue-700 dark:text-blue-400 mt-0.5">
                  Soumission en cours de validation par un administrateur.
                </p>
              )}
            </div>
          )}

          {/* Formulaire : mettre à jour le lien (phase 1 ou phase 2, non locké) */}
          {canEditCurrentEnrollment && (
            <form onSubmit={handleUpdate}>
              <h2 className="text-xl font-bold dark:text-white mb-4">
                {myEnrollment.phase === 2
                  ? "Mettre à jour mon GitHub Project — Phase 2"
                  : "Modifier mon GitHub Project"}
              </h2>
              <div className="mb-4">
                <label className="block font-medium mb-1 dark:text-gray-200">Lien GitHub Project *</label>
                <input
                  type="url"
                  value={githubLink}
                  onChange={(e) => setGithubLink(e.target.value)}
                  placeholder="https://github.com/users/xxx/projects/1"
                  className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  required
                />
                {myEnrollment.phase === 2 && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Le même lien est accepté si votre GitHub Project a été mis à jour.
                  </p>
                )}
              </div>
              <button type="submit" disabled={isSubmitting}
                className={`w-full text-white py-3 rounded-lg font-medium disabled:opacity-50 ${
                  myEnrollment.phase === 2
                    ? "bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-700 dark:hover:bg-indigo-800"
                    : "bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800"
                }`}>
                {isSubmitting
                  ? "Mise à jour..."
                  : myEnrollment.phase === 2
                    ? "Soumettre pour la phase 2"
                    : "Mettre à jour"}
              </button>
            </form>
          )}

          {/* GitHub approuvé, en attente de la défense */}
          {isCurrentProject && myEnrollment.lockedByAdmin && myEnrollment.status === "approved" &&
           !(myEnrollment.phase === 2 && myEnrollment.credits !== null) && (
            <p className="text-center text-gray-500 dark:text-gray-400 py-4">
              Votre GitHub Project est approuvé. En attente de la défense (phase {myEnrollment.phase}).
            </p>
          )}

          {/* Après défense 2 — en attente de clôture ou relancement */}
          {isCurrentProject && myEnrollment.phase === 2 && myEnrollment.credits !== null && myEnrollment.lockedByAdmin && (
            <p className="text-center text-gray-500 dark:text-gray-400 py-4">
              Les deux défenses sont terminées ({myEnrollment.totalCredits ?? 0} crédit(s) obtenus). En attente de clôture par l&apos;administrateur.
            </p>
          )}

          {/* Aucune action possible — fenêtre fermée */}
          {!isAlreadyDone && !isCurrentProject && !hasActiveEnrollmentElsewhere &&
           project.isActive && !cycle && (
            <p className="text-center text-gray-500 dark:text-gray-400 py-4">
              Aucune fenêtre de cycle ouverte. Revenez lors du prochain cycle pour choisir ce projet.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

function EnrollmentBlock({ enrollment, fmtShort }) {
  // Label spécial pour phase 2 en attente de soumission (après défense 1)
  const badgeOverride = enrollment.phase === 2 && enrollment.status === "pending_changes"
    ? { color: "bg-blue-100 text-blue-800 dark:bg-blue-800/20 dark:text-blue-300", label: "Phase 1 défendue — Mise à jour requise" }
    : enrollment.phase === 2 && enrollment.status === "pending"
    ? { color: "bg-blue-100 text-blue-800 dark:bg-blue-800/20 dark:text-blue-300", label: "Phase 1 défendue — En attente de validation" }
    : statusBadge[enrollment.status];

  return (
    <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-6 mb-6">
      <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold dark:text-white">
            Cycle n°{enrollment.cycleNumber}
            {enrollment.isDoubleCycle && (
              <span className="ml-2 text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 px-1.5 py-0.5 rounded-full font-normal">
                Double cycle
              </span>
            )}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Phase {enrollment.phase}
            {enrollment.startDate && enrollment.defenseDate && (
              <> · Du {fmtShort(enrollment.startDate)} · Défense le {fmtShort(enrollment.defenseDate)}</>
            )}
          </p>
        </div>
        <span className={`px-3 py-1 rounded-full text-sm font-semibold ${badgeOverride?.color}`}>
          {badgeOverride?.label}
        </span>
      </div>

      {enrollment.reviewedBy?.comments && (
        <div className="mb-4 p-4 bg-orange-50 dark:bg-orange-900/20 border-l-4 border-orange-400 rounded">
          <p className="font-medium text-orange-800 dark:text-orange-300 mb-1">Commentaire :</p>
          <p className="text-orange-700 dark:text-orange-400 whitespace-pre-line">
            {enrollment.reviewedBy.comments}
          </p>
        </div>
      )}

      {/* Total crédits sur le projet (toutes défenses) */}
      {enrollment.totalCredits > 0 && (
        <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
          <p className="text-sm font-bold text-green-800 dark:text-green-300">
            Total crédits obtenus : <strong>{enrollment.totalCredits}</strong> crédit(s)
          </p>
          {enrollment.defenseHistory && enrollment.defenseHistory.length > 0 && (
            <div className="mt-2 space-y-0.5">
              {enrollment.defenseHistory.map((d, i) => (
                <p key={i} className="text-xs text-green-700 dark:text-green-400">
                  Défense {d.defenseNumber} (Cycle {d.cycleNumber} · Phase {d.phase}) : <strong>{d.credits}</strong> crédit(s)
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mb-2">
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">GitHub Project soumis</p>
        {enrollment.githubProjectLink ? (
          <a href={enrollment.githubProjectLink} target="_blank" rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 hover:underline break-all text-sm">
            {enrollment.githubProjectLink}
          </a>
        ) : (
          <p className="text-gray-400 italic text-sm">Non renseigné</p>
        )}
      </div>

      {enrollment.changeHistory && enrollment.changeHistory.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
            Voir l&apos;historique des modifications
          </summary>
          <div className="mt-3 border dark:border-gray-700 rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Date</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Statut</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Par</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Commentaire</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {enrollment.changeHistory.map((h, i) => (
                  <tr key={i}>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500 dark:text-gray-400">
                      {new Date(h.date).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusBadge[h.status]?.color}`}>
                        {statusBadge[h.status]?.label ?? h.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500 dark:text-gray-400">{h.reviewer?.name}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{h.comments}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
