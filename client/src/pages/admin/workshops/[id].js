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
import Radio from "../../../components/ui/Radio";
import Textarea from "../../../components/ui/Textarea";
import FormField from "../../../components/ui/FormField";
import Skeleton from "../../../components/ui/Skeleton";
import StatusBadge from "../../../components/domain/StatusBadge";
import ChangeHistory from "../../../components/domain/ChangeHistory";

export default function AdminWorkshopDetail() {
  const { isAuthenticated, isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const { id } = router.query;
  const { get, patch, delete: deleteRequest, loading: apiLoading } = useApi();
  const [workshop, setWorkshop] = useState(null);
  const [reviewForm, setReviewForm] = useState({
    status: "",
    comments: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || !isAdmin)) {
      router.push("/");
    }
  }, [isAuthenticated, isAdmin, authLoading, router]);

  useEffect(() => {
    const fetchWorkshop = async () => {
      if (isAuthenticated && isAdmin && id) {
        try {
          const response = await get(`/api/workshops/${id}`);
          setWorkshop(response.data);

          if (response.data.status !== "pending") {
            setReviewForm({
              status: response.data.status,
              comments: response.data.reviewedBy?.comments || "",
            });
          }
        } catch (error) {
          console.error("Erreur lors de la récupération du workshop:", error);
        }
      }
    };

    fetchWorkshop();
  }, [isAuthenticated, isAdmin, id]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setReviewForm({
      ...reviewForm,
      [name]: value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");

    try {
      const response = await patch(`/api/workshops/${id}/review`, reviewForm);
      setWorkshop(response.data);
      const actionMsg =
        reviewForm.status === "pending_changes"
          ? "Des modifications ont été demandées"
          : reviewForm.status === "approved"
          ? "Le workshop a été approuvé"
          : "Le workshop a été refusé";

      toast.success(`${actionMsg} avec succès!`);
      router.push("/admin/workshops/dashboard");
    } catch (err) {
      setError(
        err.message ||
          "Une erreur est survenue lors de l'évaluation du workshop"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCompleteWorkshop = async () => {
    if (
      window.confirm(
        "Êtes-vous sûr de vouloir marquer ce workshop comme terminé ?"
      )
    ) {
      try {
        setIsSubmitting(true);
        await patch(`/api/workshops/${id}/complete`, {
          comments: "Workshop terminé avec succès.",
        });
        toast.success("Le workshop a été marqué comme terminé avec succès !");
        router.push("/admin/workshops/dashboard");
      } catch (err) {
        setError(err.message || "Une erreur est survenue");
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handleDeleteWorkshop = async () => {
    if (
      window.confirm(
        "Êtes-vous sûr de vouloir supprimer définitivement ce workshop ? Cette action est irréversible."
      )
    ) {
      try {
        setIsSubmitting(true);
        await deleteRequest(`/api/workshops/${id}`);
        toast.success("Le workshop a été supprimé avec succès !");
        router.push("/admin/workshops/dashboard");
      } catch (err) {
        setError(err.message || "Une erreur est survenue lors de la suppression");
        setIsSubmitting(false);
      }
    }
  };

  if (authLoading || (apiLoading && !workshop)) {
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

  if (!workshop) {
    return null;
  }

  const hasLinks =
    workshop.links &&
    Object.values(workshop.links).some((link) => link && link.length > 0);

  const historyEntries = (workshop.changeHistory || []).map((h) => ({
    date: h.date,
    status: h.status,
    changedBy: h.reviewer?.name ?? "—",
    comment: h.comments,
  }));

  const backLink = (
    <Link href="/admin/workshops/dashboard">
      <a className="text-sm text-text-muted hover:text-primary transition-colors duration-150">
        &larr; Administration des workshops
      </a>
    </Link>
  );

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <Head>
        <title>Hub Projets - Administration - {workshop.title}</title>
      </Head>

      <AppHeader />

      <main className="flex-1 container mx-auto px-4 py-8 max-w-7xl">
        <PageHead
          title={workshop.title}
          back={backLink}
          actions={
            <Button
              variant="danger"
              onClick={handleDeleteWorkshop}
              disabled={isSubmitting}
            >
              Supprimer le workshop
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
                    {workshop.submittedBy.name}
                  </p>
                  <p className="text-sm text-text-muted">
                    {workshop.submittedBy.email}
                  </p>
                  <p className="text-sm text-text-dim mt-1">
                    Le {new Date(workshop.createdAt).toLocaleDateString("fr-FR")}
                  </p>
                </div>
                <StatusBadge status={workshop.status} dot />
              </div>
            </Card>

            <Card>
              <div className="space-y-6">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-text-dim mb-2">
                    Détails
                  </h2>
                  <p className="text-text whitespace-pre-line leading-relaxed">
                    {workshop.details}
                  </p>
                </div>

                <div className="border-t border-border pt-5">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-text-dim mb-2">
                    Intervenants
                  </h2>
                  <p className="text-sm text-text-muted">
                    Nombre d'intervenants :{" "}
                    <span className="font-medium text-text">{workshop.instructorCount}</span>
                  </p>
                </div>
              </div>
            </Card>

            {workshop.instructorCount > 1 &&
              workshop.instructorEmails &&
              workshop.instructorEmails.length > 0 && (
                <Card>
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-text-dim mb-3">
                    Liste des intervenants
                  </h2>
                  <ul className="space-y-1.5">
                    <li className="text-sm text-text">
                      <span className="text-text-muted">Principal :</span>{" "}
                      {workshop.submittedBy.email}
                    </li>
                    {workshop.instructorEmails.map((email, index) => (
                      <li key={index} className="text-sm text-text">
                        {email}
                      </li>
                    ))}
                  </ul>
                </Card>
              )}

            {hasLinks && (
              <Card>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-text-dim mb-3">
                  Liens
                </h2>
                <ul className="space-y-2">
                  {workshop.links.github && (
                    <li>
                      <a
                        href={workshop.links.github}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline"
                      >
                        GitHub de référence
                      </a>
                    </li>
                  )}
                  {workshop.links.presentation && (
                    <li>
                      <a
                        href={workshop.links.presentation}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline"
                      >
                        Présentation PowerPoint
                      </a>
                    </li>
                  )}
                  {workshop.links.other &&
                    workshop.links.other.map((link, index) => (
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

            {historyEntries.length > 0 && (
              <ChangeHistory entries={historyEntries} />
            )}
          </div>

          <div className="mt-6 lg:mt-0 space-y-4">
            {workshop.status !== "pending" && (
              <Card>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-text-dim mb-3">
                  Évaluation actuelle
                </h2>
                <div className="space-y-2">
                  <div>
                    <StatusBadge status={workshop.status} dot />
                  </div>
                  <p className="text-sm text-text">
                    <span className="text-text-muted">Évalué par :</span>{" "}
                    {workshop.reviewedBy?.name}
                  </p>
                  <p className="text-sm text-text">
                    <span className="text-text-muted">Date :</span>{" "}
                    {new Date(workshop.updatedAt).toLocaleDateString("fr-FR")}
                  </p>
                  {workshop.reviewedBy?.comments && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <p className="text-sm font-medium text-text-muted mb-1">Commentaires</p>
                      <p className="text-sm text-text whitespace-pre-line leading-relaxed">
                        {workshop.reviewedBy.comments}
                      </p>
                    </div>
                  )}
                </div>
              </Card>
            )}

            {workshop.status !== "completed" && (
              <Card>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-text-dim mb-4">
                  Formulaire d'évaluation
                </h2>

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

                  <FormField label="Commentaires">
                    <Textarea
                      name="comments"
                      value={reviewForm.comments}
                      onChange={handleChange}
                      rows={4}
                      placeholder="Fournir un retour sur le workshop proposé..."
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

            {workshop.status === "approved" && (
              <Card>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-text-dim mb-2">
                  Marquer comme terminé
                </h2>
                <p className="text-sm text-text-muted mb-4">
                  Une fois le workshop complètement terminé, vous pouvez le marquer comme tel.
                </p>
                <Button
                  variant="subtle"
                  onClick={handleCompleteWorkshop}
                  disabled={isSubmitting}
                  loading={isSubmitting}
                  className="w-full"
                >
                  Marquer comme terminé
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
