// pages/admin/simulated/enrollments/[id].js
import React, { useEffect, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import Header from "../../../../components/layout/Header";
import { useAuth } from "../../../../context/AuthContext";
import { useApi } from "../../../../hooks/useApi";

const statusColors = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-800/20 dark:text-yellow-300",
  pending_changes: "bg-orange-100 text-orange-800 dark:bg-orange-800/20 dark:text-orange-300",
  approved: "bg-green-100 text-green-800 dark:bg-green-800/20 dark:text-green-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-800/20 dark:text-red-300",
  completed: "bg-purple-100 text-purple-800 dark:bg-purple-800/20 dark:text-purple-300",
};

const statusLabels = {
  pending: "En attente",
  pending_changes: "Modifications requises",
  approved: "Approuvé",
  rejected: "Refusé",
  completed: "Terminé",
};

const CREDITS_NORMAL = [0, 0.5, 1, 1.5];
const CREDITS_DOUBLE = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4];

export default function AdminEnrollmentDetail() {
  const { isAuthenticated, isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const { id } = router.query;
  const { get, patch, delete: deleteRequest, loading: apiLoading } = useApi();

  const [enrollment, setEnrollment] = useState(null);
  const [reviewForm, setReviewForm] = useState({ status: "", comments: "" });
  const [defendForm, setDefendForm] = useState({ credits: null, comments: "" });
  const [showDefendForm, setShowDefendForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || !isAdmin)) router.push("/");
  }, [isAuthenticated, isAdmin, authLoading, router]);

  useEffect(() => {
    if (isAuthenticated && isAdmin && id) fetchEnrollment();
  }, [isAuthenticated, isAdmin, id]);

  const fetchEnrollment = async () => {
    try {
      const res = await get(`/api/simulated/enrollments/${id}`);
      setEnrollment(res.data);
      if (res.data.status !== "pending") {
        setReviewForm({
          status: res.data.status,
          comments: res.data.reviewedBy?.comments || "",
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleReviewChange = (e) => {
    const { name, value } = e.target;
    setReviewForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleReviewSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");
    setIsSubmitting(true);
    try {
      const res = await patch(`/api/simulated/enrollments/${id}/review`, reviewForm);
      setEnrollment(res.data);
      setSuccessMsg(
        reviewForm.status === "approved"
          ? "GitHub Project approuvé — en attente de la défense."
          : reviewForm.status === "rejected"
          ? "Cycle refusé."
          : "Modifications demandées à l'étudiant."
      );
    } catch (err) {
      setError(err.message || "Une erreur est survenue.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDefendSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");
    if (defendForm.credits === null) {
      setError("Les crédits sont requis pour valider la défense.");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await patch(`/api/simulated/enrollments/${id}/defend`, defendForm);
      setEnrollment(res.data);
      setDefendForm({ credits: null, comments: "" });
      setShowDefendForm(false);
      const phase = enrollment.phase;
      setSuccessMsg(
        phase === 1
          ? `Défense phase 1 validée (${defendForm.credits} crédit(s)). L'étudiant peut maintenant mettre à jour son GitHub pour la phase 2.`
          : `Défense phase 2 validée (${defendForm.credits} crédit(s)). Total projet : ${(res.data.totalCredits ?? 0)} crédit(s).`
      );
    } catch (err) {
      setError(err.message || "Une erreur est survenue.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleDoubleCycle = async () => {
    setError("");
    setIsSubmitting(true);
    try {
      const res = await patch(`/api/simulated/enrollments/${id}/toggle-double-cycle`, {});
      setEnrollment(res.data);
      setDefendForm((prev) => ({ ...prev, credits: null }));
    } catch (err) {
      setError(err.message || "Une erreur est survenue.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleComplete = async () => {
    if (!window.confirm("Marquer ce projet comme terminé ? Cette action est irréversible."))
      return;
    setError("");
    setIsSubmitting(true);
    try {
      const res = await patch(`/api/simulated/enrollments/${id}/complete`, {});
      setEnrollment(res.data);
      setSuccessMsg("Projet marqué comme terminé.");
    } catch (err) {
      setError(err.message || "Une erreur est survenue.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Supprimer définitivement cet enrollment ? Cette action est irréversible."))
      return;
    setIsSubmitting(true);
    try {
      await deleteRequest(`/api/simulated/enrollments/${id}`);
      router.push("/admin/simulated");
    } catch (err) {
      setError(err.message || "Une erreur est survenue lors de la suppression.");
      setIsSubmitting(false);
    }
  };

  const handleRelaunch = async () => {
    if (!window.confirm("Relancer un nouveau cycle sur ce projet ? L'historique et les crédits seront conservés."))
      return;
    setError("");
    setIsSubmitting(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/simulated/enrollments/${id}/relaunch`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        }
      );
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      setEnrollment(data.data);
      setSuccessMsg(`Cycle n°${data.data.cycleNumber} lancé. L'étudiant peut maintenant soumettre son GitHub Project.`);
    } catch (err) {
      setError(err.message || "Une erreur est survenue.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading || apiLoading) {
    return <div className="text-center py-10 dark:text-white">Chargement...</div>;
  }

  if (!enrollment) return null;

  const isCompleted = enrollment.status === "completed";
  const creditsOptions = enrollment.isDoubleCycle ? CREDITS_DOUBLE : CREDITS_NORMAL;

  // Défense possible uniquement si le GitHub est approuvé et que la phase n'a pas encore été défendue
  const canDefend = enrollment.status === "approved" && !isCompleted &&
    (enrollment.phase === 1 ? enrollment.phase1Credits === null : enrollment.credits === null);

  // Terminer/relancer seulement après la défense 2 (phase 2 + credits assignés)
  const canComplete = enrollment.status === "approved" && enrollment.phase === 2 &&
    enrollment.credits !== null && !isCompleted;
  const canRelaunch = enrollment.phase === 2 && enrollment.credits !== null &&
    ["approved", "completed"].includes(enrollment.status);

  return (
    <div className="min-h-screen dark:bg-gray-900">
      <Head>
        <title>Hub Projets - Détail Enrollment Simulated</title>
      </Head>

      <Header />

      <main className="container mx-auto px-4 py-8">
        {/* Retour + Supprimer */}
        <div className="mb-6 flex justify-between items-center">
          <button
            onClick={() => router.back()}
            className="text-blue-600 dark:text-blue-400 hover:underline flex items-center"
          >
            &larr; Retour
          </button>
          <button
            onClick={handleDelete}
            disabled={isSubmitting}
            className="bg-red-600 dark:bg-red-700 text-white px-4 py-2 rounded-lg hover:bg-red-700 dark:hover:bg-red-800 disabled:opacity-50 flex items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            Supprimer
          </button>
        </div>

        {/* Messages */}
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

        {/* ── Informations générales ── */}
        <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-6 mb-6">
          <div className="flex justify-between items-start mb-4 flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold dark:text-white">
                {enrollment.simulatedProject.title}
              </h1>
              <p className="text-gray-500 dark:text-gray-400 mt-1">
                Phase {enrollment.phase} — Cycle n°{enrollment.cycleNumber}
                {enrollment.isDoubleCycle && (
                  <span className="ml-2 text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 px-2 py-0.5 rounded-full">
                    Double cycle
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <span className={`px-3 py-1 rounded-full text-sm font-semibold ${statusColors[enrollment.status]}`}>
                {statusLabels[enrollment.status]}
              </span>
              {enrollment.lockedByAdmin && !isCompleted && (
                <span className="px-3 py-1 rounded-full text-sm font-semibold bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                  Verrouillé
                </span>
              )}
              {isCompleted && (
                <span className="px-3 py-1 rounded-full text-sm font-semibold bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                  Lecture seule
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Étudiant</p>
              <p className="dark:text-white">{enrollment.student.name}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">{enrollment.student.email}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Soumis le</p>
              <p className="dark:text-white">{new Date(enrollment.submittedAt).toLocaleString()}</p>
            </div>
            {enrollment.defenseDate && (
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Date de présentation</p>
                <p className="dark:text-white">{new Date(enrollment.defenseDate).toLocaleDateString()}</p>
              </div>
            )}
            {enrollment.submissionDeadline && (
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Deadline soumission</p>
                <p className="dark:text-white">{new Date(enrollment.submissionDeadline).toLocaleDateString()}</p>
              </div>
            )}
          </div>

          {/* GitHub Project Link */}
          <div className="mt-4">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">GitHub Project</p>
            {enrollment.githubProjectLink ? (
              <a
                href={enrollment.githubProjectLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:underline break-all"
              >
                {enrollment.githubProjectLink}
              </a>
            ) : (
              <p className="text-gray-400 italic">Non renseigné</p>
            )}
          </div>

          {/* ── Crédits du cycle courant ── */}
          {(enrollment.phase1Credits !== null || enrollment.credits !== null) && (
            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg space-y-1">
              <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide mb-1">
                Cycle n°{enrollment.cycleNumber} en cours
              </p>
              {enrollment.phase1Credits !== null && (
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  Défense phase 1 : <strong>{enrollment.phase1Credits}</strong> crédit(s)
                </p>
              )}
              {enrollment.credits !== null && (
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  Défense phase 2 : <strong>{enrollment.credits}</strong> crédit(s)
                </p>
              )}
            </div>
          )}

          {/* ── Total crédits projet (toutes défenses) ── */}
          {enrollment.totalCredits > 0 && (
            <div className="mt-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <p className="text-sm font-bold text-green-800 dark:text-green-300">
                Total crédits sur ce projet : <strong>{enrollment.totalCredits}</strong> crédit(s)
                <span className="ml-2 font-normal text-green-600 dark:text-green-400">
                  ({enrollment.defenseHistory?.length ?? 0} défense(s) effectuée(s))
                </span>
              </p>
            </div>
          )}

          {/* ── Actions admin ── */}
          {!isCompleted && (
            <div className="mt-6 pt-4 border-t dark:border-gray-700 space-y-4">
              {/* Toggle double cycle */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium dark:text-white">Double cycle</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {enrollment.isDoubleCycle
                      ? "Activé — crédits max 4 (par pas de 0.5)"
                      : "Désactivé — crédits max 1.5"}
                  </p>
                </div>
                <button
                  onClick={handleToggleDoubleCycle}
                  disabled={isSubmitting}
                  className={`px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 ${
                    enrollment.isDoubleCycle
                      ? "bg-purple-600 hover:bg-purple-700 text-white"
                      : "bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white"
                  }`}
                >
                  {enrollment.isDoubleCycle ? "Désactiver" : "Activer double cycle"}
                </button>
              </div>

              {/* Bouton Défense projet */}
              {canDefend && (
                <div className="pt-2 border-t dark:border-gray-700">
                  {!showDefendForm ? (
                    <div>
                      <button
                        onClick={() => setShowDefendForm(true)}
                        className="bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-700 dark:hover:bg-indigo-800 text-white px-5 py-2 rounded-lg text-sm font-medium"
                      >
                        Défense projet — Phase {enrollment.phase}
                      </button>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Valider la défense et assigner les crédits pour la phase {enrollment.phase}.
                      </p>
                    </div>
                  ) : (
                    <form onSubmit={handleDefendSubmit} className="space-y-4">
                      <h3 className="font-semibold dark:text-white">
                        Défense phase {enrollment.phase} — Assigner les crédits
                      </h3>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Crédits obtenus *
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {creditsOptions.map((credit) => (
                            <button
                              key={credit}
                              type="button"
                              onClick={() => setDefendForm((prev) => ({ ...prev, credits: credit }))}
                              className={`px-4 py-2 rounded-lg font-medium border transition-colors ${
                                defendForm.credits === credit
                                  ? "bg-indigo-600 text-white border-indigo-600"
                                  : "bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-indigo-400"
                              }`}
                            >
                              {credit}
                            </button>
                          ))}
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {enrollment.isDoubleCycle
                            ? "Double cycle : 0 à 4 crédits (par pas de 0.5)"
                            : "Cycle normal : 0 à 1.5 crédit (par pas de 0.5)"}
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Commentaires
                        </label>
                        <textarea
                          value={defendForm.comments}
                          onChange={(e) => setDefendForm((prev) => ({ ...prev, comments: e.target.value }))}
                          rows="3"
                          placeholder="Retour sur la défense..."
                          className="w-full px-3 py-2 border dark:border-gray-700 dark:bg-gray-700 dark:text-white rounded-lg text-sm"
                        />
                      </div>
                      <div className="flex gap-3">
                        <button
                          type="submit"
                          disabled={isSubmitting || defendForm.credits === null}
                          className="bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-700 dark:hover:bg-indigo-800 text-white px-5 py-2 rounded-lg disabled:opacity-50 text-sm font-medium"
                        >
                          {isSubmitting ? "Validation..." : "Valider la défense"}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setShowDefendForm(false); setDefendForm({ credits: null, comments: "" }); }}
                          className="px-4 py-2 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                          Annuler
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}

              {/* Marquer comme terminé — après défense 2 */}
              {canComplete && (
                <div className="pt-2 border-t dark:border-gray-700">
                  <button
                    onClick={handleComplete}
                    disabled={isSubmitting}
                    className="bg-purple-600 hover:bg-purple-700 dark:bg-purple-700 dark:hover:bg-purple-800 text-white px-4 py-2 rounded-lg disabled:opacity-50 text-sm font-medium"
                  >
                    Marquer comme terminé
                  </button>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Action irréversible — le projet passera en lecture seule.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Relancer pour un nouveau cycle — après défense 2 */}
          {canRelaunch && (
            <div className="mt-4 pt-4 border-t dark:border-gray-700">
              <button
                onClick={handleRelaunch}
                disabled={isSubmitting}
                className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-white px-4 py-2 rounded-lg disabled:opacity-50 text-sm font-medium"
              >
                Relancer pour un nouveau cycle
              </button>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Lance le cycle n°{enrollment.cycleNumber + 1}. L&apos;historique et les crédits sont conservés.
              </p>
            </div>
          )}
        </div>

        {/* ── Historique des défenses ── */}
        {enrollment.defenseHistory && enrollment.defenseHistory.length > 0 && (
          <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4 dark:text-white">
              Historique des défenses
              <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                Total : {enrollment.totalCredits ?? 0} crédit(s)
              </span>
            </h2>
            <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Défense</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Cycle</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Phase</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Crédits</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Commentaires</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {enrollment.defenseHistory.map((d, i) => (
                    <tr key={i}>
                      <td className="px-4 py-3 text-sm font-semibold text-indigo-700 dark:text-indigo-400">
                        Défense {d.defenseNumber}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                        Cycle {d.cycleNumber}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                        Phase {d.phase}
                      </td>
                      <td className="px-4 py-3 text-sm font-bold text-green-700 dark:text-green-400">
                        {d.credits} crédit(s)
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {new Date(d.date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                        {d.comments || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Historique des modifications ── */}
        {enrollment.changeHistory && enrollment.changeHistory.length > 0 && (
          <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4 dark:text-white">Historique des modifications</h2>
            <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Statut</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Par</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Commentaires</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {enrollment.changeHistory.map((h, i) => (
                    <tr key={i}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {new Date(h.date).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${statusColors[h.status]}`}>
                          {statusLabels[h.status]}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {h.reviewer?.name}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                        {h.comments}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Formulaire d'évaluation du GitHub ── */}
        {!isCompleted && (
          <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-6">
            <h2 className="text-xl font-bold mb-1 dark:text-white">Évaluation du GitHub Project</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Valider ou demander des modifications sur le lien GitHub soumis par l&apos;étudiant.
              Les crédits sont assignés lors de la défense.
            </p>
            <form onSubmit={handleReviewSubmit}>
              <div className="mb-4">
                <label className="block text-gray-700 dark:text-gray-300 font-bold mb-2">
                  Décision *
                </label>
                <div className="flex flex-wrap gap-4">
                  {[
                    { value: "approved", label: "Approuver le GitHub" },
                    { value: "rejected", label: "Refuser" },
                    { value: "pending_changes", label: "Demander des modifications" },
                  ].map(({ value, label }) => (
                    <label key={value} className="inline-flex items-center dark:text-gray-300">
                      <input
                        type="radio"
                        name="status"
                        value={value}
                        checked={reviewForm.status === value}
                        onChange={handleReviewChange}
                        className="mr-2"
                        required
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-gray-700 dark:text-gray-300 font-bold mb-2">
                  Commentaires
                </label>
                <textarea
                  name="comments"
                  value={reviewForm.comments}
                  onChange={handleReviewChange}
                  rows="4"
                  placeholder="Retour à l'étudiant..."
                  className="w-full px-3 py-2 border dark:border-gray-700 dark:bg-gray-700 dark:text-white rounded-lg"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isSubmitting || !reviewForm.status}
                  className="bg-blue-600 dark:bg-blue-700 text-white px-6 py-2 rounded-lg hover:bg-blue-700 dark:hover:bg-blue-800 disabled:opacity-50"
                >
                  {isSubmitting ? "Envoi en cours..." : "Envoyer l'évaluation"}
                </button>
              </div>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
