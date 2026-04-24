// pages/admin/simulated/enrollments/[id].js
import { useEffect, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import AppHeader from "../../../../components/layout/AppHeader";
import Footer from "../../../../components/layout/Footer";
import Card from "../../../../components/ui/Card";
import Button from "../../../../components/ui/Button";
import Badge from "../../../../components/ui/Badge";
import Skeleton from "../../../../components/ui/Skeleton";
import Radio from "../../../../components/ui/Radio";
import Textarea from "../../../../components/ui/Textarea";
import FormField from "../../../../components/ui/FormField";
import StatusBadge from "../../../../components/domain/StatusBadge";
import ChangeHistory from "../../../../components/domain/ChangeHistory";
import { useAuth } from "../../../../context/AuthContext";
import { useApi } from "../../../../hooks/useApi";

const CREDITS_NORMAL = [0, 0.5, 1, 1.5];
const CREDITS_DOUBLE = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4];

export default function AdminEnrollmentDetail() {
  const { isAuthenticated, isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const { id } = router.query;
  const { get, post, patch, delete: deleteRequest, loading: apiLoading } = useApi();

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
    setError(""); setSuccessMsg(""); setIsSubmitting(true);
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
    setError(""); setSuccessMsg("");
    if (defendForm.credits === null) {
      setError("Les crédits sont requis pour valider la défense.");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await patch(`/api/simulated/enrollments/${id}/defend`, defendForm);
      setEnrollment(res.data);
      const phase = enrollment.phase;
      setDefendForm({ credits: null, comments: "" });
      setShowDefendForm(false);
      setSuccessMsg(
        phase === 1
          ? `Défense phase 1 validée (${defendForm.credits} crédit(s)). L'étudiant peut maintenant mettre à jour son GitHub pour la phase 2.`
          : `Défense phase 2 validée (${defendForm.credits} crédit(s)). Total projet : ${res.data.totalCredits ?? 0} crédit(s).`
      );
    } catch (err) {
      setError(err.message || "Une erreur est survenue.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleDoubleCycle = async () => {
    setError(""); setIsSubmitting(true);
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
    if (!window.confirm("Marquer ce projet comme terminé ? Cette action est irréversible.")) return;
    setError(""); setIsSubmitting(true);
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
    if (!window.confirm("Supprimer définitivement cet enrollment ? Cette action est irréversible.")) return;
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
    if (!window.confirm("Relancer un nouveau cycle sur ce projet ? L'historique et les crédits seront conservés.")) return;
    setError(""); setIsSubmitting(true);
    try {
      const res = await post(`/api/simulated/enrollments/${id}/relaunch`, {});
      setEnrollment(res.data);
      setSuccessMsg(`Cycle n°${res.data.cycleNumber} lancé. L'étudiant peut maintenant soumettre son GitHub Project.`);
    } catch (err) {
      setError(err.message || "Une erreur est survenue.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading || (apiLoading && !enrollment)) {
    return (
      <div className="min-h-screen flex flex-col bg-bg">
        <AppHeader />
        <main className="flex-1 container mx-auto px-4 py-8 max-w-7xl">
          <Skeleton variant="text" width="40%" height={32} className="mb-4" />
          <Skeleton variant="rect" height={300} className="mb-6" />
        </main>
        <Footer />
      </div>
    );
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

  const historyEntries = (enrollment.changeHistory || []).map((h) => ({
    date: h.date,
    status: h.status,
    changedBy: h.reviewer?.name ?? "—",
    comment: h.comments,
  }));

  const backLink = (
    <button
      onClick={() => router.back()}
      className="text-sm text-text-muted hover:text-primary transition-colors duration-150"
    >
      &larr; Retour
    </button>
  );

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <Head>
        <title>Hub Projets - Détail Enrollment Simulated</title>
      </Head>

      <AppHeader />

      <main className="flex-1 container mx-auto px-4 py-8 max-w-7xl">
        <div className="flex items-center justify-between mb-6">
          {backLink}
          <Button variant="danger" onClick={handleDelete} disabled={isSubmitting} loading={isSubmitting}>
            Supprimer
          </Button>
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}
        {successMsg && (
          <div
            className="mb-4 rounded-md border px-4 py-3 text-sm"
            style={{
              backgroundColor: 'rgb(var(--status-approved-bg))',
              borderColor: 'rgb(var(--status-approved-text))',
              color: 'rgb(var(--status-approved-text))',
            }}
          >
            {successMsg}
          </div>
        )}

        <Card className="mb-6">
          <div className="flex justify-between items-start mb-5 flex-wrap gap-3">
            <div>
              <h1 className="text-xl font-bold text-text">
                {enrollment.simulatedProject.title}
              </h1>
              <p className="text-sm text-text-muted mt-1">
                Phase {enrollment.phase} — Cycle n°{enrollment.cycleNumber}
                {enrollment.isDoubleCycle && (
                  <Badge variant="neutral" size="sm" className="ml-2">Double cycle</Badge>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={enrollment.status} />
              {enrollment.lockedByAdmin && !isCompleted && (
                <Badge variant="neutral">Verrouillé</Badge>
              )}
              {isCompleted && (
                <Badge variant="neutral">Lecture seule</Badge>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-0.5">Étudiant</p>
              <p className="text-text font-medium">{enrollment.student.name}</p>
              <p className="text-sm text-text-muted">{enrollment.student.email}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-0.5">Soumis le</p>
              <p className="text-text">{new Date(enrollment.submittedAt).toLocaleString()}</p>
            </div>
            {enrollment.defenseDate && (
              <div>
                <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-0.5">Date de présentation</p>
                <p className="text-text">{new Date(enrollment.defenseDate).toLocaleDateString()}</p>
              </div>
            )}
            {enrollment.submissionDeadline && (
              <div>
                <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-0.5">Deadline soumission</p>
                <p className="text-text">{new Date(enrollment.submissionDeadline).toLocaleDateString()}</p>
              </div>
            )}
          </div>

          <div className="mb-4">
            <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1">GitHub Project</p>
            {enrollment.githubProjectLink ? (
              <a
                href={enrollment.githubProjectLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline break-all text-sm"
              >
                {enrollment.githubProjectLink}
              </a>
            ) : (
              <p className="text-text-dim italic text-sm">Non renseigné</p>
            )}
          </div>

          {(enrollment.phase1Credits !== null || enrollment.credits !== null) && (
            <div
              className="mb-4 p-3 rounded-lg space-y-1"
              style={{
                backgroundColor: 'rgb(var(--primary-ghost))',
                borderColor: 'rgb(var(--primary-border))',
              }}
            >
              <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-1">
                Cycle n°{enrollment.cycleNumber} en cours
              </p>
              {enrollment.phase1Credits !== null && (
                <p className="text-sm text-primary">
                  Défense phase 1 : <strong>{enrollment.phase1Credits}</strong> crédit(s)
                </p>
              )}
              {enrollment.credits !== null && (
                <p className="text-sm text-primary">
                  Défense phase 2 : <strong>{enrollment.credits}</strong> crédit(s)
                </p>
              )}
            </div>
          )}

          {enrollment.totalCredits > 0 && (
            <div
              className="mb-4 p-3 rounded-lg"
              style={{
                backgroundColor: 'rgb(var(--status-approved-bg))',
                color: 'rgb(var(--status-approved-text))',
              }}
            >
              <p className="text-sm font-bold">
                Total crédits sur ce projet : <strong>{enrollment.totalCredits}</strong> crédit(s){' '}
                <span className="font-normal">
                  ({enrollment.defenseHistory?.length ?? 0} défense(s) effectuée(s))
                </span>
              </p>
            </div>
          )}

          {!isCompleted && (
            <div className="mt-5 pt-4 border-t border-border space-y-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-text">Double cycle</p>
                  <p className="text-sm text-text-muted">
                    {enrollment.isDoubleCycle
                      ? "Activé — crédits max 4 (par pas de 0.5)"
                      : "Désactivé — crédits max 1.5"}
                  </p>
                </div>
                <Button
                  variant={enrollment.isDoubleCycle ? "primary" : "outline"}
                  onClick={handleToggleDoubleCycle}
                  disabled={isSubmitting}
                >
                  {enrollment.isDoubleCycle ? "Désactiver" : "Activer double cycle"}
                </Button>
              </div>

              {canDefend && (
                <div className="pt-4 border-t border-border">
                  {!showDefendForm ? (
                    <div>
                      <Button variant="primary" onClick={() => setShowDefendForm(true)}>
                        Défense projet — Phase {enrollment.phase}
                      </Button>
                      <p className="text-xs text-text-muted mt-1">
                        Valider la défense et assigner les crédits pour la phase {enrollment.phase}.
                      </p>
                    </div>
                  ) : (
                    <form onSubmit={handleDefendSubmit} className="space-y-4">
                      <h3 className="font-semibold text-text">
                        Défense phase {enrollment.phase} — Assigner les crédits
                      </h3>
                      <div>
                        <p className="text-sm font-medium text-text mb-2">Crédits obtenus *</p>
                        <div className="flex flex-wrap gap-2">
                          {creditsOptions.map((credit) => (
                            <button
                              key={credit}
                              type="button"
                              onClick={() => setDefendForm((prev) => ({ ...prev, credits: credit }))}
                              className={`px-4 py-2 rounded-lg font-medium border transition-colors ${
                                defendForm.credits === credit
                                  ? "text-white border-transparent"
                                  : "bg-surface text-text border-border hover:border-primary"
                              }`}
                              style={defendForm.credits === credit
                                ? { backgroundColor: 'rgb(var(--primary))', borderColor: 'rgb(var(--primary))' }
                                : {}}
                            >
                              {credit}
                            </button>
                          ))}
                        </div>
                        <p className="text-xs text-text-muted mt-1">
                          {enrollment.isDoubleCycle
                            ? "Double cycle : 0 à 4 crédits (par pas de 0.5)"
                            : "Cycle normal : 0 à 1.5 crédit (par pas de 0.5)"}
                        </p>
                      </div>
                      <FormField label="Commentaires">
                        <Textarea
                          value={defendForm.comments}
                          onChange={(e) => setDefendForm((prev) => ({ ...prev, comments: e.target.value }))}
                          rows={3}
                          placeholder="Retour sur la défense..."
                        />
                      </FormField>
                      <div className="flex gap-3">
                        <Button
                          type="submit"
                          variant="primary"
                          loading={isSubmitting}
                          disabled={isSubmitting || defendForm.credits === null}
                        >
                          Valider la défense
                        </Button>
                        <Button
                          type="button"
                          variant="subtle"
                          onClick={() => { setShowDefendForm(false); setDefendForm({ credits: null, comments: "" }); }}
                        >
                          Annuler
                        </Button>
                      </div>
                    </form>
                  )}
                </div>
              )}

              {canComplete && (
                <div className="pt-4 border-t border-border">
                  <Button variant="subtle" onClick={handleComplete} disabled={isSubmitting} loading={isSubmitting}>
                    Marquer comme terminé
                  </Button>
                  <p className="text-xs text-text-muted mt-1">
                    Action irréversible — le projet passera en lecture seule.
                  </p>
                </div>
              )}
            </div>
          )}

          {canRelaunch && (
            <div className="mt-4 pt-4 border-t border-border">
              <Button variant="primary" onClick={handleRelaunch} disabled={isSubmitting} loading={isSubmitting}>
                Relancer pour un nouveau cycle
              </Button>
              <p className="text-xs text-text-muted mt-1">
                Lance le cycle n°{enrollment.cycleNumber + 1}. L&apos;historique et les crédits sont conservés.
              </p>
            </div>
          )}
        </Card>

        {enrollment.defenseHistory?.length > 0 && (
          <Card className="mb-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-dim mb-4">
              Historique des défenses
              <span className="ml-2 normal-case font-normal text-text-muted">
                Total : {enrollment.totalCredits ?? 0} crédit(s)
              </span>
            </h2>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-surface-2 border-b border-border">
                  <tr>
                    {['Défense', 'Cycle', 'Phase', 'Crédits', 'Date', 'Commentaires'].map((col) => (
                      <th key={col} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-text-dim">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-surface">
                  {enrollment.defenseHistory.map((d, i) => (
                    <tr key={i} className="hover:bg-surface-2 transition-colors">
                      <td className="px-4 py-3 font-semibold text-primary">Défense {d.defenseNumber}</td>
                      <td className="px-4 py-3 text-text-muted">Cycle {d.cycleNumber}</td>
                      <td className="px-4 py-3 text-text-muted">Phase {d.phase}</td>
                      <td className="px-4 py-3 font-bold" style={{ color: 'rgb(var(--status-approved-text))' }}>
                        {d.credits} crédit(s)
                      </td>
                      <td className="px-4 py-3 text-text-muted whitespace-nowrap">{new Date(d.date).toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-text-muted">{d.comments || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {historyEntries.length > 0 && (
          <div className="mb-6">
            <ChangeHistory entries={historyEntries} />
          </div>
        )}

        {!isCompleted && (
          <Card>
            <h2 className="text-lg font-bold text-text mb-1">Évaluation du GitHub Project</h2>
            <p className="text-sm text-text-muted mb-4">
              Valider ou demander des modifications sur le lien GitHub soumis par l&apos;étudiant.
              Les crédits sont assignés lors de la défense.
            </p>
            <form onSubmit={handleReviewSubmit} className="space-y-4">
              <fieldset>
                <legend className="text-sm font-medium text-text mb-2">
                  Décision <span className="text-danger" aria-hidden="true">*</span>
                </legend>
                <div className="space-y-1">
                  <Radio
                    label="Approuver le GitHub"
                    name="status"
                    value="approved"
                    checked={reviewForm.status === "approved"}
                    onChange={handleReviewChange}
                    required
                  />
                  <Radio
                    label="Refuser"
                    name="status"
                    value="rejected"
                    checked={reviewForm.status === "rejected"}
                    onChange={handleReviewChange}
                    required
                  />
                  <Radio
                    label="Demander des modifications"
                    name="status"
                    value="pending_changes"
                    checked={reviewForm.status === "pending_changes"}
                    onChange={handleReviewChange}
                    required
                  />
                </div>
              </fieldset>

              <FormField label="Commentaires">
                <Textarea
                  name="comments"
                  value={reviewForm.comments}
                  onChange={handleReviewChange}
                  rows={4}
                  placeholder="Retour à l'étudiant..."
                />
              </FormField>

              <div className="flex justify-end">
                <Button
                  type="submit"
                  variant="primary"
                  loading={isSubmitting}
                  disabled={isSubmitting || !reviewForm.status}
                >
                  Envoyer l'évaluation
                </Button>
              </div>
            </form>
          </Card>
        )}
      </main>

      <Footer />
    </div>
  );
}
