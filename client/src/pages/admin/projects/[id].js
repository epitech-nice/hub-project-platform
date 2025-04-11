import React, { useEffect, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import Header from "../../../components/layout/Header";
import { useAuth } from "../../../context/AuthContext";
import { useApi } from "../../../hooks/useApi";
import { toast } from "react-toastify";

export default function AdminProjectDetail() {
  const { isAuthenticated, isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const { id } = router.query;
  const { get, patch, delete: deleteRequest, loading: apiLoading } = useApi();
  const [project, setProject] = useState(null);
  const [reviewForm, setReviewForm] = useState({
    status: "",
    comments: "",
    credits: null,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // Rediriger si non authentifié ou non admin
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

          // Si le projet a déjà été évalué, initialiser le formulaire avec les valeurs existantes
          if (response.data.status !== "pending") {
            setReviewForm({
              status: response.data.status,
              comments: response.data.reviewedBy?.comments || "",
              credits: response.data.credits || null,
            });
          }
        } catch (error) {
          console.error("Erreur lors de la récupération du projet:", error);
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
      // Valider que les crédits sont fournis si le statut est "approved"
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

      // Si le projet est approuvé et que l'URL externe est fournie, ouvrir dans un nouvel onglet
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
        <title>Hub Projets - Administration - {project.name}</title>
      </Head>

      <Header />

      <main className="container mx-auto px-4 py-8">
        <div className="mb-6 flex justify-between items-center">
          <button
            onClick={() => router.back()}
            className="text-blue-600 dark:text-blue-400 hover:underline flex items-center"
          >
            &larr; Retour
          </button>
          
          {/* Bouton de suppression */}
          <button
            onClick={handleDeleteProject}
            className="bg-red-600 dark:bg-red-700 text-white px-4 py-2 rounded-lg hover:bg-red-700 dark:hover:bg-red-800 disabled:opacity-50 flex items-center"
            disabled={isSubmitting}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            Supprimer le projet
          </button>
        </div>

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
              Soumis par
            </h2>
            <p className="text-gray-700 dark:text-gray-300">
              {project.submittedBy.name} ({project.submittedBy.email})
            </p>
            <p className="text-gray-700 dark:text-gray-300">
              Le {new Date(project.createdAt).toLocaleDateString()}
            </p>
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

            {/* Afficher les crédits si définis */}
            {project.credits !== null && project.credits !== undefined && (
              <p className="text-gray-700 dark:text-gray-300 mt-2">
                <span className="font-semibold dark:text-white">
                  Crédits attribués:
                </span>{" "}
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

          {project.additionalInfo &&
            Object.values(project.additionalInfo).some(
              (info) => info && (Array.isArray(info) ? info.length > 0 : true)
            ) && (
              <div className="mb-6">
                <h2 className="text-xl font-semibold mb-2 dark:text-white">
                  Informations supplémentaires
                </h2>
                <ul className="list-disc list-inside">
                  {project.additionalInfo.personalGithub && (
                    <li className="dark:text-gray-300">
                      <span className="font-medium dark:text-white">
                        GitHub personnel:{" "}
                      </span>
                      <a
                        href={project.additionalInfo.personalGithub}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        {project.additionalInfo.personalGithub}
                      </a>
                    </li>
                  )}
                  {project.additionalInfo.projectGithub && (
                    <li className="dark:text-gray-300">
                      <span className="font-medium dark:text-white">
                        GitHub du projet:{" "}
                      </span>
                      <a
                        href={project.additionalInfo.projectGithub}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        {project.additionalInfo.projectGithub}
                      </a>
                    </li>
                  )}
                  {project.additionalInfo.documents &&
                    project.additionalInfo.documents.length > 0 && (
                      <li className="dark:text-gray-300">
                        <span className="font-medium dark:text-white">
                          Documents complémentaires:
                        </span>
                        <ul className="ml-6 list-disc">
                          {project.additionalInfo.documents.map(
                            (doc, index) => (
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
                            )
                          )}
                        </ul>
                      </li>
                    )}
                </ul>
              </div>
            )}

          {project.externalRequestStatus &&
            project.externalRequestStatus.sent && (
              <div className="mb-6">
                <h2 className="text-xl font-semibold mb-2 dark:text-white">
                  Requête externe
                </h2>
                <p className="text-gray-700 dark:text-gray-300">
                  <span className="font-medium dark:text-white">
                    Envoyée le:
                  </span>{" "}
                  {new Date(
                    project.externalRequestStatus.sentAt
                  ).toLocaleString()}
                </p>
                <p className="text-gray-700 dark:text-gray-300">
                  <span className="font-medium dark:text-white">Statut:</span>{" "}
                  {project.externalRequestStatus.response?.status ||
                    "Pas de réponse"}
                </p>
              </div>
            )}

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

        <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-6">
          <h2 className="text-2xl font-bold mb-4 dark:text-white">
            Évaluation du projet
          </h2>

          {project.status !== "pending" && (
            <div className="mb-6 p-4 border dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-700">
              <h3 className="text-lg font-semibold mb-2 dark:text-white">
                Évaluation actuelle
              </h3>
              <p className="dark:text-gray-300">
                <span className="font-medium dark:text-white">Statut:</span>
                <span
                  className={`ml-2 px-2 py-1 rounded-full text-xs font-semibold ${
                    statusColors[project.status]
                  }`}
                >
                  {statusLabels[project.status]}
                </span>
              </p>
              <p className="dark:text-gray-300">
                <span className="font-medium dark:text-white">Évalué par:</span>{" "}
                {project.reviewedBy?.name}
              </p>
              <p className="dark:text-gray-300">
                <span className="font-medium dark:text-white">
                  Date d'évaluation:
                </span>{" "}
                {new Date(project.updatedAt).toLocaleDateString()}
              </p>
              {project.credits !== null && project.credits !== undefined && (
                <p className="dark:text-gray-300">
                  <span className="font-medium dark:text-white">
                    Crédits attribués:
                  </span>{" "}
                  {project.credits}
                </p>
              )}
              {project.reviewedBy?.comments && (
                <div className="mt-2">
                  <p className="font-medium dark:text-white">Commentaires:</p>
                  <p className="text-gray-700 dark:text-gray-300 whitespace-pre-line">
                    {project.reviewedBy.comments}
                  </p>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          {/* Afficher le formulaire d'évaluation uniquement si le projet n'est pas terminé */}
          {project.status !== "completed" && (
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="block text-gray-700 dark:text-gray-300 font-bold mb-2">
                  Décision *
                </label>
                <div className="flex space-x-4">
                  <label className="inline-flex items-center dark:text-gray-300">
                    <input
                      type="radio"
                      name="status"
                      value="approved"
                      checked={reviewForm.status === "approved"}
                      onChange={handleChange}
                      className="mr-2"
                      required
                    />
                    Approuver
                  </label>
                  <label className="inline-flex items-center dark:text-gray-300">
                    <input
                      type="radio"
                      name="status"
                      value="rejected"
                      checked={reviewForm.status === "rejected"}
                      onChange={handleChange}
                      className="mr-2"
                      required
                    />
                    Refuser
                  </label>
                  <label className="inline-flex items-center dark:text-gray-300">
                    <input
                      type="radio"
                      name="status"
                      value="pending_changes"
                      checked={reviewForm.status === "pending_changes"}
                      onChange={handleChange}
                      className="mr-2"
                      required
                    />
                    Demander des modifications
                  </label>
                </div>
              </div>

              {/* Champ de crédits conditionnel pour le statut "approved" */}
              {reviewForm.status === "approved" && (
                <div className="mb-4">
                  <label
                    className="block text-gray-700 dark:text-gray-300 font-bold mb-2"
                    htmlFor="credits"
                  >
                    Crédits attribués *
                  </label>
                  <input
                    type="number"
                    id="credits"
                    name="credits"
                    value={
                      reviewForm.credits === null ? "" : reviewForm.credits
                    }
                    onChange={handleChange}
                    className="w-full px-3 py-2 border dark:border-gray-700 dark:bg-gray-700 dark:text-white rounded-lg"
                    min="0"
                    required
                  />
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Nombre de crédits à attribuer pour ce projet.
                  </p>
                </div>
              )}

              <div className="mb-6">
                <label
                  className="block text-gray-700 dark:text-gray-300 font-bold mb-2"
                  htmlFor="comments"
                >
                  Commentaires
                </label>
                <textarea
                  id="comments"
                  name="comments"
                  value={reviewForm.comments}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border dark:border-gray-700 dark:bg-gray-700 dark:text-white rounded-lg"
                  rows="4"
                  placeholder="Fournir un retour aux étudiants sur leur projet..."
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="bg-blue-600 dark:bg-blue-700 text-white px-6 py-2 rounded-lg hover:bg-blue-700 dark:hover:bg-blue-800 disabled:opacity-50"
                  disabled={isSubmitting || !reviewForm.status}
                >
                  {isSubmitting ? "Envoi en cours..." : "Envoyer l'évaluation"}
                </button>
              </div>
            </form>
          )}

          {/* Bouton pour marquer le projet comme terminé (visible uniquement pour les projets approuvés) */}
          {project.status === "approved" && (
            <div className="mt-6 p-4 border dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-700">
              <h3 className="text-lg font-semibold mb-3 dark:text-white">
                Marquer le projet comme terminé
              </h3>
              <p className="mb-4 dark:text-gray-300">
                Une fois le projet complètement terminé, vous pouvez le marquer
                comme tel.
              </p>
              <button
                type="button"
                onClick={handleCompleteProject}
                className="bg-purple-600 dark:bg-purple-700 text-white px-4 py-2 rounded-lg hover:bg-purple-700 dark:hover:bg-purple-800"
                disabled={isSubmitting}
              >
                {isSubmitting
                  ? "Traitement en cours..."
                  : "Marquer comme terminé"}
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}