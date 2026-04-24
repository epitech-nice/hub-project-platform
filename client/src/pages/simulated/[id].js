// pages/simulated/[id].js
import { useEffect, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import AppHeader from "../../components/layout/AppHeader";
import Footer from "../../components/layout/Footer";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import Input from "../../components/ui/Input";
import FormField from "../../components/ui/FormField";
import Skeleton from "../../components/ui/Skeleton";
import StatusBadge from "../../components/domain/StatusBadge";
import ChangeHistory from "../../components/domain/ChangeHistory";
import { useAuth } from "../../context/AuthContext";
import { useApi } from "../../hooks/useApi";

export default function SimulatedProjectDetail() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const { id } = router.query;
  const { get, post, put, loading: apiLoading } = useApi();

  const [project, setProject] = useState(null);
  // enrollment actif (pending/pending_changes/approved)
  const [myEnrollment, setMyEnrollment] = useState(null);
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

  const isCurrentProject =
    myEnrollment && String(myEnrollment.simulatedProject.projectId) === String(id);

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
      const data = await post("/api/simulated/enroll", {
        projectId: id,
        githubProjectLink: githubLink,
      });
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
      const data = await put(
        `/api/simulated/enrollments/${myEnrollment._id}`,
        { githubProjectLink: githubLink }
      );
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

  if (authLoading || (apiLoading && !project)) {
    return (
      <div className="min-h-screen flex flex-col bg-bg">
        <AppHeader />
        <main className="flex-1 container mx-auto px-4 py-8 max-w-4xl">
          <Skeleton variant="text" width="40%" height={32} className="mb-4" />
          <Skeleton variant="rect" height={400} className="mb-6" />
        </main>
        <Footer />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen flex flex-col bg-bg">
        <AppHeader />
        <main className="flex-1 container mx-auto px-4 py-8 max-w-4xl text-center text-text-muted">
          Projet introuvable.
        </main>
        <Footer />
      </div>
    );
  }

  const fmt = (d) => d ? new Date(d).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) : null;
  const fmtShort = (d) => d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : null;

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <Head>
        <title>Hub Projets - {project.title}</title>
      </Head>
      <AppHeader />

      <main className="flex-1 container mx-auto px-4 py-8 max-w-4xl">
        <button
          onClick={() => router.back()}
          className="text-sm text-text-muted hover:text-primary transition-colors duration-150 flex items-center mb-6"
        >
          &larr; Retour au catalogue
        </button>

        {cycleInfo !== undefined && (
          cycle ? (
            <div
              className="mb-6 flex items-start gap-3 rounded-lg px-4 py-3 border"
              style={
                currentPhase === 1
                  ? { backgroundColor: 'rgb(var(--status-approved-bg))', borderColor: 'rgb(var(--status-approved-text))' }
                  : { backgroundColor: 'rgb(var(--primary-ghost))', borderColor: 'rgb(var(--primary-border))' }
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
                    Dépôt du lien GitHub avant le <strong>{fmt(cycle.firstSubmissionDeadline)}</strong>.{" "}
                    Défense le {fmt(cycle.firstDefenseDate)}.
                  </p>
                ) : (
                  <p className="text-sm mt-0.5 text-primary">
                    Mise à jour du GitHub Project avant le <strong>{fmt(cycle.secondSubmissionDeadline)}</strong>.{" "}
                    Défense finale le {fmt(cycle.secondDefenseDate)}.
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
              <p className="text-sm" style={{ color: 'rgb(var(--status-changes-text))' }}>
                <span className="font-semibold">Aucune fenêtre ouverte.</span>{" "}
                Revenez lors du prochain cycle pour soumettre un projet.
              </p>
            </div>
          )
        )}

        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-text">{project.title}</h1>
          {!project.isActive && (
            <Badge variant="neutral" size="sm" className="mt-2">Projet inactif — consultation uniquement</Badge>
          )}
        </div>

        {project.subjectFile ? (
          <div className="bg-surface rounded-lg overflow-hidden mb-8 border border-border shadow-sm">
            <iframe
              src={`${process.env.NEXT_PUBLIC_API_URL}/uploads/${project.subjectFile}#toolbar=1`}
              className="w-full block"
              style={{ height: "75vh" }}
              title={`Sujet : ${project.title}`}
            />
          </div>
        ) : (
          <div className="bg-surface-2 rounded-lg p-12 text-center mb-8 text-text-muted border border-border">
            Aucun document sujet disponible.
          </div>
        )}

        {enrollmentForThisProject && (
          <EnrollmentBlock enrollment={enrollmentForThisProject} fmtShort={fmtShort} />
        )}

        <Card>
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

          {isAlreadyDone && (
            <p className="text-center text-text-muted py-4">
              Ce projet est terminé. Consultation uniquement.
            </p>
          )}

          {!isAlreadyDone && !isCurrentProject && hasActiveEnrollmentElsewhere && (
            <p className="text-center text-text-muted py-4">
              Vous avez déjà un projet en cours (<strong>{myEnrollment.simulatedProject.title}</strong>).
              Attendez qu&apos;il soit terminé avant d&apos;en choisir un autre.
            </p>
          )}

          {!isAlreadyDone && !hasActiveEnrollmentElsewhere && !isCurrentProject &&
            project.isActive && currentPhase === 1 && (
              <form onSubmit={handleEnroll} className="space-y-4">
                <h2 className="text-lg font-bold text-text">Choisir ce projet — Phase 1</h2>
                <FormField label="Lien GitHub Project *">
                  <Input
                    type="url"
                    value={githubLink}
                    onChange={(e) => setGithubLink(e.target.value)}
                    placeholder="https://github.com/users/xxx/projects/1"
                    required
                  />
                </FormField>
                <p className="text-sm text-text-muted">
                  Lien vers votre GitHub Project avec les tâches à effectuer.
                </p>
                <Button type="submit" variant="primary" className="w-full justify-center" loading={isSubmitting} disabled={isSubmitting}>
                  Choisir ce projet
                </Button>
              </form>
            )}

          {isCurrentProject && myEnrollment.phase === 2 && !myEnrollment.lockedByAdmin && (
            <div
              className="mb-4 p-3 rounded-lg border"
              style={{
                backgroundColor: 'rgb(var(--primary-ghost))',
                borderColor: 'rgb(var(--primary-border))',
              }}
            >
              <p className="text-sm text-primary font-medium">
                Défense phase 1 passée
                {myEnrollment.phase1Credits !== null ? ` — ${myEnrollment.phase1Credits} crédit(s) obtenus.` : "."}
              </p>
              {myEnrollment.status === "pending_changes" && (
                <p className="text-sm text-primary mt-0.5">
                  Mettez à jour votre GitHub Project et soumettez-le pour la défense finale.
                </p>
              )}
              {myEnrollment.status === "pending" && (
                <p className="text-sm text-primary mt-0.5">
                  Soumission en cours de validation par un administrateur.
                </p>
              )}
            </div>
          )}

          {canEditCurrentEnrollment && (
            <form onSubmit={handleUpdate} className="space-y-4">
              <h2 className="text-lg font-bold text-text">
                {myEnrollment.phase === 2
                  ? "Mettre à jour mon GitHub Project — Phase 2"
                  : "Modifier mon GitHub Project"}
              </h2>
              <FormField label="Lien GitHub Project *">
                <Input
                  type="url"
                  value={githubLink}
                  onChange={(e) => setGithubLink(e.target.value)}
                  placeholder="https://github.com/users/xxx/projects/1"
                  required
                />
              </FormField>
              {myEnrollment.phase === 2 && (
                <p className="text-sm text-text-muted">
                  Le même lien est accepté si votre GitHub Project a été mis à jour.
                </p>
              )}
              <Button type="submit" variant="primary" className="w-full justify-center" loading={isSubmitting} disabled={isSubmitting}>
                {myEnrollment.phase === 2 ? "Soumettre pour la phase 2" : "Mettre à jour"}
              </Button>
            </form>
          )}

          {isCurrentProject && myEnrollment.lockedByAdmin && myEnrollment.status === "approved" &&
            !(myEnrollment.phase === 2 && myEnrollment.credits !== null) && (
              <p className="text-center text-text-muted py-4">
                Votre GitHub Project est approuvé. En attente de la défense (phase {myEnrollment.phase}).
              </p>
            )}

          {isCurrentProject && myEnrollment.phase === 2 && myEnrollment.credits !== null && myEnrollment.lockedByAdmin && (
            <p className="text-center text-text-muted py-4">
              Les deux défenses sont terminées ({myEnrollment.totalCredits ?? 0} crédit(s) obtenus). En attente de clôture par l&apos;administrateur.
            </p>
          )}

          {!isAlreadyDone && !isCurrentProject && !hasActiveEnrollmentElsewhere &&
            project.isActive && !cycle && (
              <p className="text-center text-text-muted py-4">
                Aucune fenêtre de cycle ouverte. Revenez lors du prochain cycle pour choisir ce projet.
              </p>
            )}
        </Card>
      </main>

      <Footer />
    </div>
  );
}

function EnrollmentBlock({ enrollment, fmtShort }) {
  // Phase 2 uses a custom label since the standard status label doesn't convey the phase-2 context
  const isPhase2Override = enrollment.phase === 2 &&
    (enrollment.status === "pending_changes" || enrollment.status === "pending");

  const statusEl = isPhase2Override ? (
    <Badge variant="pending">
      {enrollment.status === "pending_changes"
        ? "Phase 1 défendue — Mise à jour requise"
        : "Phase 1 défendue — En attente de validation"}
    </Badge>
  ) : (
    <StatusBadge status={enrollment.status} />
  );

  return (
    <Card className="mb-6">
      <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-text">
            Cycle n°{enrollment.cycleNumber}
            {enrollment.isDoubleCycle && (
              <Badge variant="neutral" size="sm" className="ml-2">Double cycle</Badge>
            )}
          </h2>
          <p className="text-sm text-text-muted mt-0.5">
            Phase {enrollment.phase}
            {enrollment.startDate && enrollment.defenseDate && (
              <> · Du {fmtShort(enrollment.startDate)} · Défense le {fmtShort(enrollment.defenseDate)}</>
            )}
          </p>
        </div>
        {statusEl}
      </div>

      {enrollment.reviewedBy?.comments && (
        <div
          className="mb-4 p-4 border-l-4 rounded text-sm"
          style={{
            backgroundColor: 'rgb(var(--status-changes-bg))',
            borderLeftColor: 'rgb(var(--status-changes-text))',
            color: 'rgb(var(--status-changes-text))',
          }}
        >
          <p className="font-medium mb-1">Commentaire :</p>
          <p className="whitespace-pre-line">{enrollment.reviewedBy.comments}</p>
        </div>
      )}

      {enrollment.totalCredits > 0 && (
        <div
          className="mb-4 p-3 rounded-lg text-sm"
          style={{
            backgroundColor: 'rgb(var(--status-approved-bg))',
            color: 'rgb(var(--status-approved-text))',
          }}
        >
          <p className="font-bold">
            Total crédits obtenus : <strong>{enrollment.totalCredits}</strong> crédit(s)
          </p>
          {enrollment.defenseHistory?.length > 0 && (
            <div className="mt-2 space-y-0.5">
              {enrollment.defenseHistory.map((d, i) => (
                <p key={i} className="text-xs">
                  Défense {d.defenseNumber} (Cycle {d.cycleNumber} · Phase {d.phase}) : <strong>{d.credits}</strong> crédit(s)
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mb-2">
        <p className="text-sm font-medium text-text-muted mb-1">GitHub Project soumis</p>
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

      {enrollment.changeHistory?.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium text-text-muted hover:text-text">
            Voir l&apos;historique des modifications
          </summary>
          <div className="mt-3">
            <ChangeHistory
              entries={enrollment.changeHistory.map((h) => ({
                date: h.date,
                status: h.status,
                changedBy: h.reviewer?.name ?? "—",
                comment: h.comments,
              }))}
            />
          </div>
        </details>
      )}
    </Card>
  );
}
