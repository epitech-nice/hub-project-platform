import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useAuth } from "../../../context/AuthContext";
import { useApi } from "../../../hooks/useApi";
import { toast } from "react-toastify";

import AppHeader from "../../../components/layout/AppHeader";
import Footer from "../../../components/layout/Footer";
import PageHead from "../../../components/ui/PageHead";
import Card from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import Badge from "../../../components/ui/Badge";
import Radio from "../../../components/ui/Radio";
import Input from "../../../components/ui/Input";
import Textarea from "../../../components/ui/Textarea";
import FormField from "../../../components/ui/FormField";
import Skeleton from "../../../components/ui/Skeleton";
import StatusBadge from "../../../components/domain/StatusBadge";
import ChangeHistory from "../../../components/domain/ChangeHistory";

export default function AdminProjectDetail() {
  const { isAuthenticated, isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const { id } = router.query;
  const { get, patch, post, delete: deleteRequest, loading: apiLoading } = useApi();
  const [project, setProject] = useState(null);
  const [reviewForm, setReviewForm] = useState({
    status: "",
    comments: "",
    credits: null,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [isResending, setIsResending] = useState(false);

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || !isAdmin)) {
      router.push("/");
    }
  }, [isAuthenticated, isAdmin, authLoading, router]);

  useEffect(() => {
    const fetchProject = async () => {
      if (isAuthenticated && isAdmin && id) {
        try {
          const response = await get(`/api/projects/${id}`);
          setProject(response.data);

          if (response.data.status !== "pending") {
            setReviewForm({
              status: response.data.status,
              comments: response.data.reviewedBy?.comments || "",
              credits: response.data.credits || null,
            });
          }
        } catch (err) {
          console.error("Erreur lors de la récupération du projet:", err);
        }
      }
    };

    fetchProject();
  }, [isAuthenticated, isAdmin, id]);

  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === "credits") {
      setReviewForm({
        ...reviewForm,
        [name]: value === "" ? null : Number(value),
      });
    } else {
      setReviewForm({
        ...reviewForm,
        [name]: value,
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");

    try {
      if (
        reviewForm.status === "approved" &&
        (reviewForm.credits === null || reviewForm.credits === undefined)
      ) {
        throw new Error("Le champ crédits est requis pour approuver un projet");
      }

      const response = await patch(`/api/projects/${id}/review`, reviewForm);
      setProject(response.data);
      const actionMsg =
        reviewForm.status === "pending_changes"
          ? "Des modifications ont été demandées"
          : reviewForm.status === "approved"
          ? "Le projet a été approuvé"
          : "Le projet a été refusé";

      toast.success(`${actionMsg} avec succès!`);

      if (reviewForm.status === "approved" && response.externalSiteUrl) {
        window.open(response.externalSiteUrl, "_blank");
      }
      router.push("/admin/dashboard");
    } catch (err) {
      setError(
        err.message || "Une erreur est survenue lors de l'évaluation du projet"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCompleteProject = async () => {
    if (
      window.confirm(
        "Êtes-vous sûr de vouloir marquer ce projet comme terminé ?"
      )
    ) {
      try {
        setIsSubmitting(true);
        await patch(`/api/projects/${id}/complete`, {
          comments: "Projet terminé avec succès.",
        });
        toast.success("Le projet a été marqué comme terminé avec succès !");
        router.push("/admin/dashboard");
      } catch (err) {
        setError(err.message || "Une erreur est survenue");
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handleDeleteProject = async () => {
    if (
      window.confirm(
        "Êtes-vous sûr de vouloir supprimer définitivement ce projet ? Cette action est irréversible."
      )
    ) {
      try {
        setIsSubmitting(true);
        await deleteRequest(`/api/projects/${id}`);
        toast.success("Le projet a été supprimé avec succès !");
        router.push("/admin/dashboard");
      } catch (err) {
        setError(err.message || "Une erreur est survenue lors de la suppression");
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handleResendNotification = async () => {
    try {
      setIsResending(true);
      await post(`/api/projects/${id}/resend-notification`, {});
      toast.success("Notification relancée avec succès");
    } catch (err) {
      toast.error(err.message || "Erreur lors de l'envoi");
    } finally {
      setIsResending(false);
    }
  };

  if (authLoading || (apiLoading && !project)) {
    return (
      <div className="min-h-screen flex flex-col bg-bg">
        <AppHeader />
        <main className="flex-1 container mx-auto px-4 py-8 max-w-7xl">
          <div className="space-y-4">
            <Skeleton variant="text" width="40%" height={32} />
            <Skeleton variant="rect" height={200} />
            <Skeleton variant="rect" height={160} />
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!project) {
    return null;
  }

  const hasLinks =
    project.links &&
    Object.values(project.links).some((link) => link && link.length > 0);

  const hasAdditionalInfo =
    project.additionalInfo &&
    Object.values(project.additionalInfo).some(
      (info) => info && (Array.isArray(info) ? info.length > 0 : true)
    );

  const historyEntries = (project.changeHistory || []).map((h) => ({
    date: h.date,
    status: h.status,
    changedBy: h.reviewer?.name ?? "—",
    comment: h.comments,
  }));

  const backLink = (
    <Link href="/admin/dashboard">
      <a className="text-sm text-text-muted hover:text-primary transition-colors duration-150">
        &larr; Administration
      </a>
    </Link>
  );

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <Head>
        <title>Hub Projets - Administration - {project.name}</title>
      </Head>

      <AppHeader />

      <main className="flex-1 container mx-auto px-4 py-8 max-w-7xl">
        <PageHead
          title={project.name}
          back={backLink}
          actions={
            <Button
              variant="danger"
              onClick={handleDeleteProject}
              disabled={isSubmitting}
            >
              Supprimer le projet
            </Button>
          }
        />

        <div className="lg:grid lg:grid-cols-[1fr_360px] lg:gap-8 mt-2">
          <div className="space-y-6">
            <Card>
              <div className="flex items-start justify-between gap-4 mb-5">
                <div>
                  <p className="text-sm font-medium text-text-muted mb-0.5">Soumis par</p>
                  <p className="text-text font-medium">
                    {project.submittedBy.name}
                  </p>
                  <p className="text-sm text-text-muted">
                    {project.submittedBy.email}
                  </p>
                  <p className="text-sm text-text-dim mt-1">
                    Le {new Date(project.createdAt).toLocaleDateString("fr-FR")}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <StatusBadge status={project.status} dot />
                  {project.credits !== null && project.credits !== undefined && (
                    <span className="text-sm text-text-muted">
                      <span className="font-medium text-text">{project.credits}</span> crédit{project.credits !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-sm text-text-muted">
                Nombre d'étudiants impliqués :{" "}
                <span className="font-medium text-text">{project.studentCount}</span>
              </div>
            </Card>

            <Card>
              <div className="space-y-6">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-text-dim mb-2">
                    Description
                  </h2>
                  <p className="text-text whitespace-pre-line leading-relaxed">
                    {project.description}
                  </p>
                </div>

                <div className="border-t border-border pt-5">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-text-dim mb-2">
                    Objectifs
                  </h2>
                  <p className="text-text whitespace-pre-line leading-relaxed">
                    {project.objectives}
                  </p>
                </div>

                <div className="border-t border-border pt-5">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-text-dim mb-2">
                    Technologies
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    {project.technologies.map((tech, index) => (
                      <Badge key={index} variant="neutral" size="sm">
                        {tech}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </Card>

            {project.studentCount > 1 && (
              <Card>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-text-dim mb-3">
                  Étudiants impliqués
                </h2>
                <ul className="space-y-1.5">
                  <li className="text-sm text-text">
                    <span className="text-text-muted">Créateur :</span>{" "}
                    {project.submittedBy.email}
                  </li>
                  {project.studentEmails && project.studentEmails.length > 0 ? (
                    project.studentEmails.map((email, index) => (
                      <li key={index} className="text-sm text-text">
                        {email}
                      </li>
                    ))
                  ) : (
                    <li className="text-sm text-text-dim italic">
                      Aucun email d'étudiant supplémentaire fourni
                    </li>
                  )}
                </ul>
              </Card>
            )}

            {hasLinks && (
              <Card>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-text-dim mb-3">
                  Liens
                </h2>
                <ul className="space-y-2">
                  {project.links.github && (
                    <li>
                      <a
                        href={project.links.github}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline"
                      >
                        GitHub
                      </a>
                    </li>
                  )}
                  {project.links.projectGithub && (
                    <li>
                      <a
                        href={project.links.projectGithub}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline"
                      >
                        GitHub Project
                      </a>
                    </li>
                  )}
                  {project.links.other &&
                    project.links.other.map((link, index) => (
                      <li key={index}>
                        <a
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-primary hover:underline"
                        >
                          Lien {index + 1}
                        </a>
                      </li>
                    ))}
                </ul>
              </Card>
            )}

            {hasAdditionalInfo && (
              <Card>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-text-dim mb-3">
                  Informations supplémentaires
                </h2>
                <ul className="space-y-2">
                  {project.additionalInfo.personalGithub && (
                    <li className="text-sm text-text">
                      <span className="font-medium text-text-muted">GitHub personnel :</span>{" "}
                      <a
                        href={project.additionalInfo.personalGithub}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        {project.additionalInfo.personalGithub}
                      </a>
                    </li>
                  )}
                  {project.additionalInfo.projectGithub && (
                    <li className="text-sm text-text">
                      <span className="font-medium text-text-muted">GitHub du projet :</span>{" "}
                      <a
                        href={project.additionalInfo.projectGithub}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        {project.additionalInfo.projectGithub}
                      </a>
                    </li>
                  )}
                  {project.additionalInfo.documents &&
                    project.additionalInfo.documents.length > 0 && (
                      <li className="text-sm text-text">
                        <span className="font-medium text-text-muted">Documents complémentaires :</span>
                        <ul className="mt-1 ml-4 space-y-1">
                          {project.additionalInfo.documents.map((doc, index) => (
                            <li key={index}>
                              <a
                                href={doc}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline"
                              >
                                Document {index + 1}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </li>
                    )}
                </ul>
              </Card>
            )}

            {project.externalRequestStatus?.sent && (
              <Card>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-text-dim mb-3">
                  Requête externe
                </h2>
                <dl className="space-y-1 text-sm">
                  <div className="flex gap-2">
                    <dt className="text-text-muted">Envoyée le :</dt>
                    <dd className="text-text">
                      {new Date(project.externalRequestStatus.sentAt).toLocaleString("fr-FR")}
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-text-muted">Statut :</dt>
                    <dd className="text-text">
                      {project.externalRequestStatus.response?.status || "Pas de réponse"}
                    </dd>
                  </div>
                </dl>
              </Card>
            )}

            {historyEntries.length > 0 && (
              <ChangeHistory entries={historyEntries} />
            )}
          </div>

          <div className="mt-6 lg:mt-0 space-y-4">
            {project.status !== "pending" && (
              <Card>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-text-dim mb-3">
                  Évaluation actuelle
                </h3>
                <div className="space-y-2">
                  <div>
                    <StatusBadge status={project.status} dot />
                  </div>
                  <p className="text-sm text-text">
                    <span className="text-text-muted">Évalué par :</span>{" "}
                    {project.reviewedBy?.name}
                  </p>
                  <p className="text-sm text-text">
                    <span className="text-text-muted">Date :</span>{" "}
                    {new Date(project.updatedAt).toLocaleDateString("fr-FR")}
                  </p>
                  {project.credits !== null && project.credits !== undefined && (
                    <p className="text-sm text-text">
                      <span className="text-text-muted">Crédits attribués :</span>{" "}
                      <span className="font-medium">{project.credits}</span>
                    </p>
                  )}
                  {project.reviewedBy?.comments && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <p className="text-sm font-medium text-text-muted mb-1">Commentaires</p>
                      <p className="text-sm text-text whitespace-pre-line leading-relaxed">
                        {project.reviewedBy.comments}
                      </p>
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* Formulaire d'évaluation */}
            {project.status !== "completed" && (
              <Card>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-text-dim mb-4">
                  Formulaire d'évaluation
                </h3>

                {error && (
                  <div className="mb-4 rounded-md border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  <fieldset>
                    <legend className="text-sm font-medium text-text mb-2">
                      Décision <span className="text-danger" aria-hidden="true">*</span>
                    </legend>
                    <div className="space-y-1">
                      <Radio
                        label="Approuver"
                        name="status"
                        value="approved"
                        checked={reviewForm.status === "approved"}
                        onChange={handleChange}
                        required
                      />
                      <Radio
                        label="Refuser"
                        name="status"
                        value="rejected"
                        checked={reviewForm.status === "rejected"}
                        onChange={handleChange}
                        required
                      />
                      <Radio
                        label="Demander des modifications"
                        name="status"
                        value="pending_changes"
                        checked={reviewForm.status === "pending_changes"}
                        onChange={handleChange}
                        required
                      />
                    </div>
                  </fieldset>

                  {reviewForm.status === "approved" && (
                    <FormField
                      label="Crédits attribués"
                      required
                      hint="Nombre de crédits à attribuer pour ce projet."
                    >
                      <Input
                        type="number"
                        name="credits"
                        value={reviewForm.credits === null ? "" : reviewForm.credits}
                        onChange={handleChange}
                        min="0"
                        required
                      />
                    </FormField>
                  )}

                  <FormField label="Commentaires">
                    <Textarea
                      name="comments"
                      value={reviewForm.comments}
                      onChange={handleChange}
                      rows={4}
                      placeholder="Fournir un retour aux étudiants sur leur projet..."
                    />
                  </FormField>

                  <div className="pt-2">
                    <Button
                      type="submit"
                      variant="primary"
                      loading={isSubmitting}
                      disabled={isSubmitting || !reviewForm.status}
                      className="w-full"
                    >
                      Envoyer l'évaluation
                    </Button>
                  </div>
                </form>
              </Card>
            )}

            {project.status === "approved" && (
              <Card>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-text-dim mb-2">
                  Clôturer le projet
                </h3>
                <p className="text-sm text-text-muted mb-4">
                  Une fois le projet complètement terminé, vous pouvez le marquer comme tel.
                </p>
                <Button
                  variant="subtle"
                  onClick={handleCompleteProject}
                  disabled={isSubmitting}
                  loading={isSubmitting}
                  className="w-full"
                >
                  Marquer comme terminé
                </Button>
              </Card>
            )}

            {project.status === "pending_changes" && (
              <Card>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-text-dim mb-2">
                  Relancer la notification
                </h3>
                <p className="text-sm text-text-muted mb-4">
                  Renvoyer l'email de demande de modifications à l'étudiant.
                </p>
                <Button
                  variant="subtle"
                  onClick={handleResendNotification}
                  disabled={isResending}
                  loading={isResending}
                  className="w-full"
                >
                  Relancer la notification email
                </Button>
              </Card>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
