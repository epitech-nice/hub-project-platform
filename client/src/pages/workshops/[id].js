import { useEffect, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import AppHeader from "../../components/layout/AppHeader";
import Footer from "../../components/layout/Footer";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import Skeleton from "../../components/ui/Skeleton";
import StatusBadge from "../../components/domain/StatusBadge";
import ChangeHistory from "../../components/domain/ChangeHistory";
import { useAuth } from "../../context/AuthContext";
import { useApi } from "../../hooks/useApi";
import { toast } from "react-toastify";

export default function WorkshopDetail() {
  const { isAuthenticated, user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { id } = router.query;
  const { get, post, loading: apiLoading } = useApi();
  const [workshop, setWorkshop] = useState(null);
  const [isMain, setIsMain] = useState(false);
  const [isInstructor, setIsInstructor] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/");
    }
  }, [isAuthenticated, authLoading, router]);

  useEffect(() => {
    const fetchWorkshop = async () => {
      if (isAuthenticated && id) {
        try {
          const response = await get(`/api/workshops/${id}`);
          setWorkshop(response.data);

          if (user) {
            const isMainInstructor =
              response.data.submittedBy.userId === user._id ||
              response.data.submittedBy.userId.toString() === user._id.toString();
            setIsMain(isMainInstructor);

            const isWorkshopInstructor = response.data.instructors.some(
              (instructor) => instructor.email === user.email
            );
            setIsInstructor(isWorkshopInstructor);
          }
        } catch (error) {
          console.error("Erreur lors de la récupération du workshop:", error);
          setError("Impossible de charger les détails du workshop");
        }
      }
    };

    fetchWorkshop();
  }, [isAuthenticated, id, user]);

  const handleLeaveWorkshop = async () => {
    if (window.confirm("Êtes-vous sûr de vouloir quitter ce workshop ? Cette action est irréversible.")) {
      try {
        setIsSubmitting(true);
        await post(`/api/workshops/${id}/leave`);
        toast.success("Vous avez quitté le workshop avec succès !");
        router.push("/dashboard");
      } catch (err) {
        setError(err.message || "Une erreur est survenue lors de la tentative de quitter le workshop");
        setIsSubmitting(false);
      }
    }
  };

  if (authLoading || (apiLoading && !workshop)) {
    return (
      <div className="min-h-screen flex flex-col bg-bg">
        <AppHeader />
        <main className="flex-1 container mx-auto px-4 py-8 max-w-7xl">
          <Skeleton variant="text" width="40%" height={32} className="mb-4" />
          <Skeleton variant="rect" height={400} className="mb-6" />
        </main>
        <Footer />
      </div>
    );
  }

  if (!workshop) {
    return (
      <div className="min-h-screen flex flex-col bg-bg">
        <AppHeader />
        <main className="flex-1 container mx-auto px-4 py-8 max-w-7xl">
          <Card className="text-center">
            <h1 className="text-xl font-bold text-text mb-4">
              {error || "Workshop introuvable"}
            </h1>
            <button
              onClick={() => router.back()}
              className="text-sm text-text-muted hover:text-primary transition-colors duration-150"
            >
              Retour
            </button>
          </Card>
        </main>
        <Footer />
      </div>
    );
  }

  const hasLinks = workshop.links && Object.values(workshop.links).some(
    (link) => link && (Array.isArray(link) ? link.length > 0 : true)
  );

  const historyEntries = (workshop.changeHistory || []).map((h) => ({
    date: h.date,
    status: h.status,
    changedBy: h.reviewer?.name ?? "—",
    comment: h.comments,
  }));

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <Head>
        <title>Hub Projets - Workshop: {workshop.title}</title>
      </Head>

      <AppHeader />

      <main className="flex-1 container mx-auto px-4 py-8 max-w-7xl">
        <div className="mb-6">
          <button
            onClick={() => router.back()}
            className="text-sm text-text-muted hover:text-primary transition-colors duration-150 flex items-center"
          >
            &larr; Retour
          </button>
        </div>

        {isInstructor && !isMain && (
          <Card className="mb-6">
            <h3 className="text-base font-semibold text-text mb-2">Quitter ce workshop</h3>
            <p className="text-sm text-text-muted mb-4">
              En quittant ce workshop, vous serez supprimé de la liste des intervenants et n'aurez plus accès aux informations spécifiques du workshop.
            </p>
            <Button
              variant="danger"
              onClick={handleLeaveWorkshop}
              disabled={isSubmitting}
              loading={isSubmitting}
            >
              Quitter le workshop
            </Button>
          </Card>
        )}

        <Card className="mb-6">
          <div className="flex justify-between items-start mb-5 gap-4">
            <h1 className="text-2xl font-bold text-text">{workshop.title}</h1>
            <StatusBadge status={workshop.status} />
          </div>

          <section className="mb-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-dim mb-2">Détails</h2>
            <p className="text-text-muted whitespace-pre-line">{workshop.details}</p>
          </section>

          <section className="mb-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-dim mb-2">Intervenants</h2>
            <p className="text-sm text-text-muted">
              Nombre d'intervenants : <span className="font-medium text-text">{workshop.instructorCount}</span>
            </p>
            <p className="text-sm text-text-muted">
              Soumis le : <span className="text-text">{new Date(workshop.createdAt).toLocaleDateString()}</span>
            </p>
          </section>

          {workshop.instructorCount > 1 &&
            workshop.instructorEmails &&
            workshop.instructorEmails.length > 0 && (
              <section className="mb-5">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-text-dim mb-2">Liste des intervenants</h2>
                <ul className="space-y-1 text-sm text-text-muted list-disc list-inside ml-2">
                  <li>Principal : {workshop.submittedBy?.email}</li>
                  {workshop.instructorEmails.map((email, index) => (
                    <li key={index}>{email}</li>
                  ))}
                </ul>
              </section>
            )}

          {hasLinks && (
            <section className="mb-5">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-text-dim mb-2">Liens</h2>
              <ul className="space-y-1.5">
                {workshop.links.github && (
                  <li>
                    <a href={workshop.links.github} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
                      GitHub de référence
                    </a>
                  </li>
                )}
                {workshop.links.presentation && (
                  <li>
                    <a href={workshop.links.presentation} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
                      Présentation PowerPoint
                    </a>
                  </li>
                )}
                {workshop.links.other?.map((link, index) => (
                  <li key={index}>
                    <a href={link} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
                      Lien {index + 1}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {workshop.reviewedBy && (
            <section className="mb-5">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-text-dim mb-2">Évaluation</h2>
              <p className="text-sm text-text-muted">
                Évalué par : <span className="text-text">{workshop.reviewedBy.name}</span>
              </p>
              {workshop.reviewedBy.comments && (
                <div className="mt-2">
                  <p className="text-sm font-medium text-text-muted mb-1">Commentaires :</p>
                  <p className="text-sm text-text whitespace-pre-line">{workshop.reviewedBy.comments}</p>
                </div>
              )}
            </section>
          )}

          {historyEntries.length > 0 && <ChangeHistory entries={historyEntries} />}
        </Card>

        {workshop.status === "pending_changes" && (
          <div
            className="mb-6 rounded-lg p-4 border"
            style={{
              backgroundColor: 'rgb(var(--status-changes-bg))',
              borderColor: 'rgb(var(--status-changes-text))',
            }}
          >
            <h3
              className="text-base font-semibold mb-2"
              style={{ color: 'rgb(var(--status-changes-text))' }}
            >
              Modifications requises
            </h3>
            <p
              className="text-sm whitespace-pre-line mb-4"
              style={{ color: 'rgb(var(--status-changes-text))' }}
            >
              {workshop.reviewedBy?.comments}
            </p>
            <Button variant="primary" as="a" href={`/workshops/edit/${workshop._id}`}>
              Effectuer les modifications
            </Button>
          </div>
        )}

        {workshop.status === "completed" && (
          <div
            className="mb-6 rounded-lg p-4 border"
            style={{
              backgroundColor: 'rgb(var(--status-neutral-bg))',
              borderColor: 'rgb(var(--status-neutral-text))',
              color: 'rgb(var(--status-neutral-text))',
            }}
          >
            <h3 className="text-base font-semibold mb-1">Workshop terminé</h3>
            <p className="text-sm">Ce workshop a été marqué comme terminé.</p>
          </div>
        )}

        {error && (
          <div className="mb-6 rounded-md border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
