import { useEffect, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import AppHeader from "../../components/layout/AppHeader";
import Footer from "../../components/layout/Footer";
import PageHead from "../../components/ui/PageHead";
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
import { toast } from "react-toastify";

export default function ProjectDetail() {
  const { isAuthenticated, user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { id } = router.query;
  const { get, patch, post, loading: apiLoading } = useApi();
  const [project, setProject] = useState(null);
  const [isCreator, setIsCreator] = useState(false);
  const [isMember, setIsMember] = useState(false);
  const [additionalInfo, setAdditionalInfo] = useState({
    personalGithub: "",
    projectGithub: "",
    documents: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/");
    }
  }, [isAuthenticated, authLoading, router]);

  useEffect(() => {
    const fetchProject = async () => {
      if (isAuthenticated && id) {
        try {
          const response = await get(`/api/projects/${id}`);
          setProject(response.data);

          if (user) {
            const isProjectCreator =
              response.data.submittedBy.userId === user._id ||
              response.data.submittedBy.userId.toString() === user._id.toString();
            setIsCreator(isProjectCreator);

            const isMemberOfProject = response.data.members.some(
              (member) => member.email === user.email
            );
            setIsMember(isMemberOfProject);
          }

          if (response.data.additionalInfo) {
            setAdditionalInfo({
              personalGithub: response.data.additionalInfo.personalGithub || "",
              projectGithub: response.data.additionalInfo.projectGithub || "",
              documents: response.data.additionalInfo.documents?.join(", ") || "",
            });
          }
        } catch (error) {
          console.error("Erreur lors de la récupération du projet:", error);
        }
      }
    };

    fetchProject();
  }, [isAuthenticated, id, user]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setAdditionalInfo({ ...additionalInfo, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");

    try {
      const formattedData = {
        ...additionalInfo,
        documents: additionalInfo.documents
          ? additionalInfo.documents.split(",").map((doc) => doc.trim())
          : [],
      };

      const response = await patch(`/api/projects/${id}/additional-info`, formattedData);
      setProject(response.data);
      toast.success("Informations mises à jour avec succès!");
    } catch (err) {
      setError(err.message || "Une erreur est survenue lors de la mise à jour des informations");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLeaveProject = async () => {
    if (window.confirm("Êtes-vous sûr de vouloir quitter ce projet ? Cette action est irréversible.")) {
      try {
        setIsSubmitting(true);
        await post(`/api/projects/${id}/leave`);
        toast.success("Vous avez quitté le projet avec succès !");
        router.push("/dashboard");
      } catch (err) {
        setError(err.message || "Une erreur est survenue lors de la tentative de quitter le projet");
        setIsSubmitting(false);
      }
    }
  };

  if (authLoading || (apiLoading && !project)) {
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

  if (!project) return null;

  const hasLinks = project.links && Object.values(project.links).some((l) => l && l.length > 0);

  const historyEntries = (project.changeHistory || []).map((h) => ({
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
        <title>Hub Projets - {project.name}</title>
      </Head>

      <AppHeader />

      <main className="flex-1 container mx-auto px-4 py-8 max-w-7xl">
        <PageHead title={project.name} back={backLink} />

        {isMember && !isCreator && (
          <Card className="mb-6">
            <h3 className="text-base font-semibold text-text mb-2">Quitter ce projet</h3>
            <p className="text-sm text-text-muted mb-4">
              En quittant ce projet, vous serez supprimé de la liste des membres et n'aurez plus accès aux informations spécifiques du projet.
            </p>
            <Button
              variant="danger"
              onClick={handleLeaveProject}
              disabled={isSubmitting}
              loading={isSubmitting}
            >
              Quitter le projet
            </Button>
          </Card>
        )}

        <Card className="mb-6">
          <div className="flex justify-between items-start mb-5 gap-4">
            <h1 className="text-2xl font-bold text-text">{project.name}</h1>
            <StatusBadge status={project.status} />
          </div>

          <section className="mb-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-dim mb-2">Description</h2>
            <p className="text-text-muted whitespace-pre-line">{project.description}</p>
          </section>

          <section className="mb-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-dim mb-2">Objectifs</h2>
            <p className="text-text-muted whitespace-pre-line">{project.objectives}</p>
          </section>

          <section className="mb-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-dim mb-2">Technologies utilisées</h2>
            <div className="flex flex-wrap gap-2">
              {project.technologies.map((tech, index) => (
                <Badge key={index} variant="neutral" size="sm">{tech}</Badge>
              ))}
            </div>
          </section>

          <section className="mb-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-dim mb-2">Détails</h2>
            <p className="text-sm text-text-muted">
              Nombre d'étudiants impliqués : <span className="font-medium text-text">{project.studentCount}</span>
            </p>
            <p className="text-sm text-text-muted">
              Soumis le : <span className="text-text">{new Date(project.createdAt).toLocaleDateString()}</span>
            </p>
            {(project.status === "approved" || project.status === "completed") &&
              project.credits != null && (
                <p className="text-sm text-text-muted mt-1">
                  Crédits attribués : <span className="font-semibold text-text">{project.credits}</span>
                </p>
              )}
          </section>

          {project.studentCount > 1 && (
            <section className="mb-5">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-text-dim mb-2">Étudiants impliqués</h2>
              <ul className="space-y-1 text-sm text-text-muted list-disc list-inside ml-2">
                <li>Créateur : {project.submittedBy.email}</li>
                {project.studentEmails && project.studentEmails.length > 0 ? (
                  project.studentEmails.map((email, index) => <li key={index}>{email}</li>)
                ) : (
                  <li className="italic">Aucun email d'étudiant supplémentaire fourni</li>
                )}
              </ul>
            </section>
          )}

          {hasLinks && (
            <section className="mb-5">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-text-dim mb-2">Liens</h2>
              <ul className="space-y-1.5">
                {project.links.github && (
                  <li>
                    <a href={project.links.github} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
                      GitHub
                    </a>
                  </li>
                )}
                {project.links.projectGithub && (
                  <li>
                    <a href={project.links.projectGithub} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
                      GitHub Project
                    </a>
                  </li>
                )}
                {project.links.other?.map((link, index) => (
                  <li key={index}>
                    <a href={link} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
                      Lien {index + 1}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {project.reviewedBy && (
            <section className="mb-5">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-text-dim mb-2">Évaluation</h2>
              <p className="text-sm text-text-muted">
                Évalué par : <span className="text-text">{project.reviewedBy.name}</span>
              </p>
              {project.reviewedBy.comments && (
                <div className="mt-2">
                  <p className="text-sm font-medium text-text-muted mb-1">Commentaires :</p>
                  <p className="text-sm text-text whitespace-pre-line">{project.reviewedBy.comments}</p>
                </div>
              )}
            </section>
          )}

          {historyEntries.length > 0 && <ChangeHistory entries={historyEntries} />}
        </Card>

        {project.status === "pending_changes" && (
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
              {project.reviewedBy?.comments}
            </p>
            <Button variant="primary" as="a" href={`/projects/edit/${project._id}`}>
              Effectuer les modifications
            </Button>
          </div>
        )}

        {(project.status === "approved" || project.status === "completed") && (
          <Card>
            <h2 className="text-lg font-bold text-text mb-4">Informations supplémentaires</h2>

            {error && (
              <div className="mb-4 rounded-md border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
                {error}
              </div>
            )}

            {/* Only editable when status is approved, not completed */}
            {project.status === "approved" ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <FormField label="Lien GitHub personnel">
                  <Input
                    type="url"
                    name="personalGithub"
                    value={additionalInfo.personalGithub}
                    onChange={handleChange}
                    placeholder="https://github.com/votre-username"
                  />
                </FormField>

                <FormField label="Lien GitHub project">
                  <Input
                    type="url"
                    name="projectGithub"
                    value={additionalInfo.projectGithub}
                    onChange={handleChange}
                    placeholder="https://github.com/organization/project"
                  />
                </FormField>

                <FormField label="Documents complémentaires (URLs séparées par des virgules)">
                  <Input
                    type="text"
                    name="documents"
                    value={additionalInfo.documents}
                    onChange={handleChange}
                    placeholder="https://docs.google.com/document1, https://docs.google.com/document2"
                  />
                </FormField>

                <div className="flex justify-end pt-2">
                  <Button type="submit" variant="primary" loading={isSubmitting} disabled={isSubmitting}>
                    Mettre à jour les informations
                  </Button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-text-muted mb-1">Lien GitHub personnel</p>
                  {project.additionalInfo?.personalGithub ? (
                    <a href={project.additionalInfo.personalGithub} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
                      {project.additionalInfo.personalGithub}
                    </a>
                  ) : (
                    <p className="text-sm text-text-muted italic">Non fourni</p>
                  )}
                </div>

                <div>
                  <p className="text-sm font-medium text-text-muted mb-1">Lien GitHub project</p>
                  {project.additionalInfo?.projectGithub ? (
                    <a href={project.additionalInfo.projectGithub} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
                      {project.additionalInfo.projectGithub}
                    </a>
                  ) : (
                    <p className="text-sm text-text-muted italic">Non fourni</p>
                  )}
                </div>

                <div>
                  <p className="text-sm font-medium text-text-muted mb-1">Documents complémentaires</p>
                  {project.additionalInfo?.documents?.length > 0 ? (
                    <ul className="space-y-1">
                      {project.additionalInfo.documents.map((doc, index) => (
                        <li key={index}>
                          <a href={doc} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
                            Document {index + 1}
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-text-muted italic">Aucun document fourni</p>
                  )}
                </div>

                <div
                  className="rounded-lg p-3 border"
                  style={{
                    backgroundColor: 'rgb(var(--status-neutral-bg))',
                    borderColor: 'rgb(var(--status-neutral-text))',
                    color: 'rgb(var(--status-neutral-text))',
                  }}
                >
                  <p className="text-sm font-semibold">Ce projet est marqué comme terminé.</p>
                </div>
              </div>
            )}
          </Card>
        )}
      </main>

      <Footer />
    </div>
  );
}
