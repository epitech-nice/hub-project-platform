import React, { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import Header from "../../components/layout/Header";
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
    // Rediriger si non authentifié
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

          // Vérifier si l'utilisateur est le créateur ou membre
          if (user) {
            const isProjectCreator = 
              response.data.submittedBy.userId === user._id ||
              response.data.submittedBy.userId.toString() === user._id.toString();
            setIsCreator(isProjectCreator);
            
            const isMemberOfProject = response.data.members.some(
              member => member.email === user.email
            );
            setIsMember(isMemberOfProject);
          }

          // Initialiser le formulaire d'informations additionnelles
          if (response.data.additionalInfo) {
            setAdditionalInfo({
              personalGithub: response.data.additionalInfo.personalGithub || "",
              projectGithub: response.data.additionalInfo.projectGithub || "",
              documents:
                response.data.additionalInfo.documents?.join(", ") || "",
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
    setAdditionalInfo({
      ...additionalInfo,
      [name]: value,
    });
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

      const response = await patch(
        `/api/projects/${id}/additional-info`,
        formattedData
      );
      setProject(response.data);
      toast.success("Informations mises à jour avec succès!");
    } catch (err) {
      setError(
        err.message ||
          "Une erreur est survenue lors de la mise à jour des informations"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLeaveProject = async () => {
    if (
      window.confirm(
        "Êtes-vous sûr de vouloir quitter ce projet ? Cette action est irréversible."
      )
    ) {
      try {
        setIsSubmitting(true);
        await post(`/api/projects/${id}/leave`);
        toast.success("Vous avez quitté le projet avec succès !");
        router.push("/dashboard"); // Rediriger vers le tableau de bord personnel
      } catch (err) {
        setError(
          err.message ||
            "Une erreur est survenue lors de la tentative de quitter le projet"
        );
        setIsSubmitting(false);
      }
    }
  };

  if (authLoading || apiLoading) {
    return (
      <div className="text-center py-10 dark:text-white">Chargement...</div>
    );
  }

  if (!project) {
    return null;
  }

  const statusColors = {
    pending:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-800/20 dark:text-yellow-300",
    pending_changes:
      "bg-orange-100 text-orange-800 dark:bg-orange-800/20 dark:text-orange-300",
    approved:
      "bg-green-100 text-green-800 dark:bg-green-800/20 dark:text-green-300",
    rejected: "bg-red-100 text-red-800 dark:bg-red-800/20 dark:text-red-300",
    completed:
      "bg-purple-100 text-purple-800 dark:bg-purple-800/20 dark:text-purple-300",
  };

  const statusLabels = {
    pending: "En attente",
    pending_changes: "Modifications requises",
    approved: "Approuvé",
    rejected: "Refusé",
    completed: "Terminé",
  };

  return (
    <div className="min-h-screen dark:bg-gray-900">
      <Head>
        <title>Hub Projets - {project.name}</title>
      </Head>

      <Header />

      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <button
            onClick={() => router.back()}
            className="text-blue-600 dark:text-blue-400 hover:underline flex items-center"
          >
            &larr; Retour
          </button>
        </div>
          
        {/* Bouton pour quitter le projet (visible uniquement pour les membres non-créateurs) */}
        {isMember && !isCreator && (
          <div className="mb-6 p-4 border dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-700">
            <h3 className="text-lg font-semibold mb-3 dark:text-white">
              Quitter ce projet
            </h3>
            <p className="mb-4 dark:text-gray-300">
              En quittant ce projet, vous serez supprimé de la liste des
              membres et n'aurez plus accès aux informations spécifiques du
              projet.
            </p>
            <button
              type="button"
              onClick={handleLeaveProject}
              className="bg-red-600 dark:bg-red-700 text-white px-4 py-2 rounded-lg hover:bg-red-700 dark:hover:bg-red-800"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Traitement en cours..." : "Quitter le projet"}
            </button>
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-6 mb-8">
          <div className="flex justify-between items-start mb-4">
            <h1 className="text-3xl font-bold dark:text-white">
              {project.name}
            </h1>
            <span
              className={`px-3 py-1 rounded-full text-sm font-semibold ${
                statusColors[project.status]
              }`}
            >
              {statusLabels[project.status]}
            </span>
          </div>

          <div className="mb-6">
            <h2 className="text-xl font-semibold mb-2 dark:text-white">
              Description
            </h2>
            <p className="text-gray-700 dark:text-gray-300 whitespace-pre-line">
              {project.description}
            </p>
          </div>

          <div className="mb-6">
            <h2 className="text-xl font-semibold mb-2 dark:text-white">
              Objectifs
            </h2>
            <p className="text-gray-700 dark:text-gray-300 whitespace-pre-line">
              {project.objectives}
            </p>
          </div>

          <div className="mb-6">
            <h2 className="text-xl font-semibold mb-2 dark:text-white">
              Technologies utilisées
            </h2>
            <div className="flex flex-wrap gap-2">
              {project.technologies.map((tech, index) => (
                <span
                  key={index}
                  className="bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded-md text-gray-700 dark:text-gray-300"
                >
                  {tech}
                </span>
              ))}
            </div>
          </div>

          <div className="mb-6">
            <h2 className="text-xl font-semibold mb-2 dark:text-white">
              Détails
            </h2>
            <p className="text-gray-700 dark:text-gray-300">
              Nombre d'étudiants impliqués: {project.studentCount}
            </p>
            <p className="text-gray-700 dark:text-gray-300">
              Soumis le: {new Date(project.createdAt).toLocaleDateString()}
            </p>

            {/* Afficher les crédits si définis et si le projet est approuvé ou terminé */}
            {(project.status === "approved" ||
              project.status === "completed") &&
              project.credits !== null &&
              project.credits !== undefined && (
                <p className="text-gray-700 dark:text-gray-300 mt-2">
                  <span className="font-semibold">Crédits attribués:</span>{" "}
                  {project.credits}
                </p>
              )}
          </div>

          {/* Affichage des étudiants impliqués */}
          {project.studentCount > 1 && (
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-2 dark:text-white">
                Étudiants impliqués
              </h2>
              <ul className="list-disc list-inside ml-2">
                <li className="text-gray-700 dark:text-gray-300">
                  Créateur: {project.submittedBy.email}
                </li>
                {project.studentEmails && project.studentEmails.length > 0 ? (
                  project.studentEmails.map((email, index) => (
                    <li
                      key={index}
                      className="text-gray-700 dark:text-gray-300"
                    >
                      {email}
                    </li>
                  ))
                ) : (
                  <li className="text-gray-700 dark:text-gray-300 italic">
                    Aucun email d'étudiant supplémentaire fourni
                  </li>
                )}
              </ul>
            </div>
          )}

          {project.links &&
            Object.values(project.links).some(
              (link) => link && link.length > 0
            ) && (
              <div className="mb-6">
                <h2 className="text-xl font-semibold mb-2 dark:text-white">
                  Liens
                </h2>
                <ul className="list-disc list-inside">
                  {project.links.github && (
                    <li>
                      <a
                        href={project.links.github}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 dark:text-blue-400 hover:underline"
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
                        className="text-blue-600 dark:text-blue-400 hover:underline"
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
                          className="text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          Lien {index + 1}
                        </a>
                      </li>
                    ))}
                </ul>
              </div>
            )}

          {project.reviewedBy && (
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-2 dark:text-white">
                Évaluation
              </h2>
              <p className="text-gray-700 dark:text-gray-300">
                Évalué par: {project.reviewedBy.name}
              </p>
              {project.reviewedBy.comments && (
                <div>
                  <p className="font-semibold mt-2 dark:text-white">
                    Commentaires:
                  </p>
                  <p className="text-gray-700 dark:text-gray-300 whitespace-pre-line">
                    {project.reviewedBy.comments}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Afficher l'historique des modifications si disponible */}
          {project.changeHistory && project.changeHistory.length > 0 && (
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-2 dark:text-white">
                Historique des modifications
              </h2>
              <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Statut
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Par
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Commentaires
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {project.changeHistory.map((history, index) => (
                      <tr key={index}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {new Date(history.date).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full 
                            ${
                              history.status === "pending"
                                ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-800/20 dark:text-yellow-300"
                                : history.status === "pending_changes"
                                ? "bg-orange-100 text-orange-800 dark:bg-orange-800/20 dark:text-orange-300"
                                : history.status === "approved"
                                ? "bg-green-100 text-green-800 dark:bg-green-800/20 dark:text-green-300"
                                : history.status === "completed"
                                ? "bg-purple-100 text-purple-800 dark:bg-purple-800/20 dark:text-purple-300"
                                : "bg-red-100 text-red-800 dark:bg-red-800/20 dark:text-red-300"
                            }`}
                          >
                            {history.status === "pending"
                              ? "En attente"
                              : history.status === "pending_changes"
                              ? "Modifications requises"
                              : history.status === "approved"
                              ? "Approuvé"
                              : history.status === "completed"
                              ? "Terminé"
                              : "Refusé"}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {history.reviewer.name}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                          {history.comments}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Message pour modifications requises */}
        {project.status === "pending_changes" && (
          <div className="mb-8 p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
            <h3 className="text-lg font-semibold text-orange-800 dark:text-orange-300 mb-2">
              Modifications requises
            </h3>
            <p className="text-gray-700 dark:text-gray-300 whitespace-pre-line">
              {project.reviewedBy?.comments}
            </p>
            <div className="mt-4">
              <Link href={`/projects/edit/${project._id}`}>
                <a className="bg-orange-500 dark:bg-orange-600 text-white px-4 py-2 rounded-md hover:bg-orange-600 dark:hover:bg-orange-700 inline-block">
                  Effectuer les modifications
                </a>
              </Link>
            </div>
          </div>
        )}

        {/* Informations supplémentaires pour les projets approuvés */}
        {(project.status === "approved" || project.status === "completed") && (
          <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-6">
            <h2 className="text-2xl font-bold mb-4 dark:text-white">
              Informations supplémentaires
            </h2>

            {error && (
              <div className="bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded mb-4">
                {error}
              </div>
            )}

            {/* Formulaire modifiable uniquement si le projet est approuvé (pas terminé) */}
            {project.status === "approved" ? (
              <form onSubmit={handleSubmit}>
                <div className="mb-4">
                  <label
                    className="block text-gray-700 dark:text-gray-300 font-bold mb-2"
                    htmlFor="personalGithub"
                  >
                    Lien GitHub personnel
                  </label>
                  <input
                    type="url"
                    id="personalGithub"
                    name="personalGithub"
                    value={additionalInfo.personalGithub}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border dark:border-gray-700 dark:bg-gray-700 dark:text-white rounded-lg"
                    placeholder="https://github.com/votre-username"
                  />
                </div>

                <div className="mb-4">
                  <label
                    className="block text-gray-700 dark:text-gray-300 font-bold mb-2"
                    htmlFor="projectGithub"
                  >
                    Lien GitHub du projet
                  </label>
                  <input
                    type="url"
                    id="projectGithub"
                    name="projectGithub"
                    value={additionalInfo.projectGithub}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border dark:border-gray-700 dark:bg-gray-700 dark:text-white rounded-lg"
                    placeholder="https://github.com/organization/project"
                  />
                </div>

                <div className="mb-6">
                  <label
                    className="block text-gray-700 dark:text-gray-300 font-bold mb-2"
                    htmlFor="documents"
                  >
                    Documents complémentaires (URLs séparées par des virgules)
                  </label>
                  <input
                    type="text"
                    id="documents"
                    name="documents"
                    value={additionalInfo.documents}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border dark:border-gray-700 dark:bg-gray-700 dark:text-white rounded-lg"
                    placeholder="https://docs.google.com/document1, https://docs.google.com/document2"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="bg-blue-600 dark:bg-blue-700 text-white px-6 py-2 rounded-lg hover:bg-blue-700 dark:hover:bg-blue-800 disabled:opacity-50"
                    disabled={isSubmitting}
                  >
                    {isSubmitting
                      ? "Mise à jour..."
                      : "Mettre à jour les informations"}
                  </button>
                </div>
              </form>
            ) : (
              // Affichage en lecture seule pour les projets terminés
              <div>
                <div className="mb-4">
                  <p className="font-semibold dark:text-white">
                    Lien GitHub personnel:
                  </p>
                  {project.additionalInfo?.personalGithub ? (
                    <a
                      href={project.additionalInfo.personalGithub}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      {project.additionalInfo.personalGithub}
                    </a>
                  ) : (
                    <p className="text-gray-500 dark:text-gray-400 italic">
                      Non fourni
                    </p>
                  )}
                </div>

                <div className="mb-4">
                  <p className="font-semibold dark:text-white">
                    Lien GitHub du projet:
                  </p>
                  {project.additionalInfo?.projectGithub ? (
                    <a
                      href={project.additionalInfo.projectGithub}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      {project.additionalInfo.projectGithub}
                    </a>
                  ) : (
                    <p className="text-gray-500 dark:text-gray-400 italic">
                      Non fourni
                    </p>
                  )}
                </div>

                <div className="mb-4">
                  <p className="font-semibold dark:text-white">
                    Documents complémentaires:
                  </p>
                  {project.additionalInfo?.documents &&
                  project.additionalInfo.documents.length > 0 ? (
                    <ul className="list-disc list-inside ml-2">
                      {project.additionalInfo.documents.map((doc, index) => (
                        <li key={index}>
                          <a
                            href={doc}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            Document {index + 1}
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-gray-500 dark:text-gray-400 italic">
                      Aucun document fourni
                    </p>
                  )}
                </div>

                {project.status === "completed" && (
                  <div className="mt-4 p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
                    <p className="text-purple-800 dark:text-purple-300 font-semibold">
                      Ce projet est marqué comme terminé.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}