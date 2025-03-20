import React, { useEffect, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import Header from "../../../components/layout/Header";
import { useAuth } from "../../../context/AuthContext";
import { useApi } from "../../../hooks/useApi";

export default function AdminProjectDetail() {
  const { isAuthenticated, isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const { id } = router.query;
  const { get, patch, loading: apiLoading } = useApi();
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

      alert(`${actionMsg} avec succès!`);
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
        alert("Le projet a été marqué comme terminé avec succès !");
        router.push("/admin/dashboard");
      } catch (err) {
        setError(err.message || "Une erreur est survenue");
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  if (authLoading || apiLoading) {
    return <div className="text-center py-10">Chargement...</div>;
  }

  if (!project) {
    return null;
  }

  const statusColors = {
    pending: "bg-yellow-100 text-yellow-800",
    pending_changes: "bg-orange-100 text-orange-800",
    approved: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800",
    completed: "bg-purple-100 text-purple-800",
  };

  const statusLabels = {
    pending: "En attente",
    pending_changes: "Modifications requises",
    approved: "Approuvé",
    rejected: "Refusé",
    completed: "Terminé",
  };

  return (
    <div>
      <Head>
        <title>Hub Projets - Administration - {project.name}</title>
      </Head>

      <Header />

      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <button
            onClick={() => router.back()}
            className="text-blue-600 hover:underline flex items-center"
          >
            &larr; Retour
          </button>
        </div>

        <div className="bg-white shadow-md rounded-lg p-6 mb-8">
          <div className="flex justify-between items-start mb-4">
            <h1 className="text-3xl font-bold">{project.name}</h1>
            <span
              className={`px-3 py-1 rounded-full text-sm font-semibold ${
                statusColors[project.status]
              }`}
            >
              {statusLabels[project.status]}
            </span>
          </div>

          <div className="mb-6">
            <h2 className="text-xl font-semibold mb-2">Soumis par</h2>
            <p className="text-gray-700">
              {project.submittedBy.name} ({project.submittedBy.email})
            </p>
            <p className="text-gray-700">
              Le {new Date(project.createdAt).toLocaleDateString()}
            </p>
          </div>

          <div className="mb-6">
            <h2 className="text-xl font-semibold mb-2">Description</h2>
            <p className="text-gray-700 whitespace-pre-line">
              {project.description}
            </p>
          </div>

          <div className="mb-6">
            <h2 className="text-xl font-semibold mb-2">Objectifs</h2>
            <p className="text-gray-700 whitespace-pre-line">
              {project.objectives}
            </p>
          </div>

          <div className="mb-6">
            <h2 className="text-xl font-semibold mb-2">
              Technologies utilisées
            </h2>
            <div className="flex flex-wrap gap-2">
              {project.technologies.map((tech, index) => (
                <span
                  key={index}
                  className="bg-gray-100 px-3 py-1 rounded-md text-gray-700"
                >
                  {tech}
                </span>
              ))}
            </div>
          </div>

          <div className="mb-6">
            <h2 className="text-xl font-semibold mb-2">Détails</h2>
            <p className="text-gray-700">
              Nombre d'étudiants impliqués: {project.studentCount}
            </p>

            {/* Afficher les crédits si définis */}
            {project.credits !== null && project.credits !== undefined && (
              <p className="text-gray-700 mt-2">
                <span className="font-semibold">Crédits attribués:</span>{" "}
                {project.credits}
              </p>
            )}
          </div>

          {/* Affichage des étudiants impliqués */}
          {project.studentCount > 1 && (
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-2">
                Étudiants impliqués
              </h2>
              <ul className="list-disc list-inside ml-2">
                <li className="text-gray-700">
                  Créateur: {project.submittedBy.email}
                </li>
                {project.studentEmails && project.studentEmails.length > 0 ? (
                  project.studentEmails.map((email, index) => (
                    <li key={index} className="text-gray-700">
                      {email}
                    </li>
                  ))
                ) : (
                  <li className="text-gray-700 italic">
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
                <h2 className="text-xl font-semibold mb-2">Liens</h2>
                <ul className="list-disc list-inside">
                  {project.links.github && (
                    <li>
                      <a
                        href={project.links.github}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        GitHub
                      </a>
                    </li>
                  )}
                  {project.links.docs && (
                    <li>
                      <a
                        href={project.links.docs}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        Documentation
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
                          className="text-blue-600 hover:underline"
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
                <h2 className="text-xl font-semibold mb-2">
                  Informations supplémentaires
                </h2>
                <ul className="list-disc list-inside">
                  {project.additionalInfo.personalGithub && (
                    <li>
                      <span className="font-medium">GitHub personnel: </span>
                      <a
                        href={project.additionalInfo.personalGithub}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        {project.additionalInfo.personalGithub}
                      </a>
                    </li>
                  )}
                  {project.additionalInfo.projectGithub && (
                    <li>
                      <span className="font-medium">GitHub du projet: </span>
                      <a
                        href={project.additionalInfo.projectGithub}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        {project.additionalInfo.projectGithub}
                      </a>
                    </li>
                  )}
                  {project.additionalInfo.documents &&
                    project.additionalInfo.documents.length > 0 && (
                      <li>
                        <span className="font-medium">
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
                                  className="text-blue-600 hover:underline"
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
                <h2 className="text-xl font-semibold mb-2">Requête externe</h2>
                <p className="text-gray-700">
                  <span className="font-medium">Envoyée le:</span>{" "}
                  {new Date(
                    project.externalRequestStatus.sentAt
                  ).toLocaleString()}
                </p>
                <p className="text-gray-700">
                  <span className="font-medium">Statut:</span>{" "}
                  {project.externalRequestStatus.response?.status ||
                    "Pas de réponse"}
                </p>
              </div>
            )}

          {project.changeHistory && project.changeHistory.length > 0 && (
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-2">
                Historique des modifications
              </h2>
              <div className="border rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Statut
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Par
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Commentaires
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {project.changeHistory.map((history, index) => (
                      <tr key={index}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(history.date).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full 
                            ${
                              history.status === "pending"
                                ? "bg-yellow-100 text-yellow-800"
                                : history.status === "pending_changes"
                                ? "bg-orange-100 text-orange-800"
                                : history.status === "approved"
                                ? "bg-green-100 text-green-800"
                                : history.status === "completed"
                                ? "bg-purple-100 text-purple-800"
                                : "bg-red-100 text-red-800"
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
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {history.reviewer.name}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
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

        <div className="bg-white shadow-md rounded-lg p-6">
          <h2 className="text-2xl font-bold mb-4">Évaluation du projet</h2>

          {project.status !== "pending" && (
            <div className="mb-6 p-4 border rounded-lg bg-gray-50">
              <h3 className="text-lg font-semibold mb-2">
                Évaluation actuelle
              </h3>
              <p>
                <span className="font-medium">Statut:</span>
                <span
                  className={`ml-2 px-2 py-1 rounded-full text-xs font-semibold ${
                    statusColors[project.status]
                  }`}
                >
                  {statusLabels[project.status]}
                </span>
              </p>
              <p>
                <span className="font-medium">Évalué par:</span>{" "}
                {project.reviewedBy?.name}
              </p>
              <p>
                <span className="font-medium">Date d'évaluation:</span>{" "}
                {new Date(project.updatedAt).toLocaleDateString()}
              </p>
              {project.credits !== null && project.credits !== undefined && (
                <p>
                  <span className="font-medium">Crédits attribués:</span>{" "}
                  {project.credits}
                </p>
              )}
              {project.reviewedBy?.comments && (
                <div className="mt-2">
                  <p className="font-medium">Commentaires:</p>
                  <p className="text-gray-700 whitespace-pre-line">
                    {project.reviewedBy.comments}
                  </p>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          {/* Afficher le formulaire d'évaluation uniquement si le projet n'est pas terminé */}
          {project.status !== "completed" && (
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="block text-gray-700 font-bold mb-2">
                  Décision *
                </label>
                <div className="flex space-x-4">
                  <label className="inline-flex items-center">
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
                  <label className="inline-flex items-center">
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
                  <label className="inline-flex items-center">
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
                    className="block text-gray-700 font-bold mb-2"
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
                    className="w-full px-3 py-2 border rounded-lg"
                    min="0"
                    required
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    Nombre de crédits à attribuer pour ce projet.
                  </p>
                </div>
              )}

              <div className="mb-6">
                <label
                  className="block text-gray-700 font-bold mb-2"
                  htmlFor="comments"
                >
                  Commentaires
                </label>
                <textarea
                  id="comments"
                  name="comments"
                  value={reviewForm.comments}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border rounded-lg"
                  rows="4"
                  placeholder="Fournir un retour aux étudiants sur leur projet..."
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  disabled={isSubmitting || !reviewForm.status}
                >
                  {isSubmitting ? "Envoi en cours..." : "Envoyer l'évaluation"}
                </button>
              </div>
            </form>
          )}

          {/* Bouton pour marquer le projet comme terminé (visible uniquement pour les projets approuvés) */}
          {project.status === "approved" && (
            <div className="mt-6 p-4 border rounded-lg bg-gray-50">
              <h3 className="text-lg font-semibold mb-3">
                Marquer le projet comme terminé
              </h3>
              <p className="mb-4">
                Une fois le projet complètement terminé, vous pouvez le marquer
                comme tel.
              </p>
              <button
                type="button"
                onClick={handleCompleteProject}
                className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700"
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
