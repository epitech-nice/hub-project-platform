import React, { useEffect, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import Header from "../../../components/layout/Header";
import { useAuth } from "../../../context/AuthContext";
import { useApi } from "../../../hooks/useApi";
import { toast } from "react-toastify";

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
    // Rediriger si non authentifié ou non admin
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

          // Si le workshop a déjà été évalué, initialiser le formulaire avec les valeurs existantes
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

  if (authLoading || apiLoading) {
    return (
      <div className="text-center py-10 dark:text-white">Chargement...</div>
    );
  }

  if (!workshop) {
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
        <title>Hub Projets - Administration - {workshop.title}</title>
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
            onClick={handleDeleteWorkshop}
            className="bg-red-600 dark:bg-red-700 text-white px-4 py-2 rounded-lg hover:bg-red-700 dark:hover:bg-red-800 disabled:opacity-50 flex items-center"
            disabled={isSubmitting}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            Supprimer le workshop
          </button>
        </div>

        <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-6 mb-8">
          <div className="flex justify-between items-start mb-4">
            <h1 className="text-3xl font-bold dark:text-white">
              {workshop.title}
            </h1>
            <span
              className={`px-3 py-1 rounded-full text-sm font-semibold ${
                statusColors[workshop.status]
              }`}
            >
              {statusLabels[workshop.status]}
            </span>
          </div>

          <div className="mb-6">
            <h2 className="text-xl font-semibold mb-2 dark:text-white">
              Soumis par
            </h2>
            <p className="text-gray-700 dark:text-gray-300">
              {workshop.submittedBy.name} ({workshop.submittedBy.email})
            </p>
            <p className="text-gray-700 dark:text-gray-300">
              Le {new Date(workshop.createdAt).toLocaleDateString()}
            </p>
          </div>

          <div className="mb-6">
            <h2 className="text-xl font-semibold mb-2 dark:text-white">
              Détails
            </h2>
            <p className="text-gray-700 dark:text-gray-300 whitespace-pre-line">
              {workshop.details}
            </p>
          </div>

          <div className="mb-6">
            <h2 className="text-xl font-semibold mb-2 dark:text-white">
              Intervenants
            </h2>
            <p className="text-gray-700 dark:text-gray-300">
              Nombre d'intervenants: {workshop.instructorCount}
            </p>
          </div>

          {/* Affichage des intervenants */}
          {workshop.instructorCount > 1 &&
            workshop.instructorEmails &&
            workshop.instructorEmails.length > 0 && (
              <div className="mb-6">
                <h2 className="text-xl font-semibold mb-2 dark:text-white">
                  Liste des intervenants
                </h2>
                <ul className="list-disc list-inside ml-2">
                  <li className="text-gray-700 dark:text-gray-300">
                    Principal: {workshop.submittedBy.email}
                  </li>
                  {workshop.instructorEmails.map((email, index) => (
                    <li
                      key={index}
                      className="text-gray-700 dark:text-gray-300"
                    >
                      {email}
                    </li>
                  ))}
                </ul>
              </div>
            )}

          {workshop.links &&
            Object.values(workshop.links).some(
              (link) => link && link.length > 0
            ) && (
              <div className="mb-6">
                <h2 className="text-xl font-semibold mb-2 dark:text-white">
                  Liens
                </h2>
                <ul className="list-disc list-inside">
                  {workshop.links.github && (
                    <li>
                      <a
                        href={workshop.links.github}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 dark:text-blue-400 hover:underline"
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
                        className="text-blue-600 dark:text-blue-400 hover:underline"
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
                          className="text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          Lien {index + 1}
                        </a>
                      </li>
                    ))}
                </ul>
              </div>
            )}

          {workshop.changeHistory && workshop.changeHistory.length > 0 && (
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
                    {workshop.changeHistory.map((history, index) => (
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
            Évaluation du workshop
          </h2>

          {workshop.status !== "pending" && (
            <div className="mb-6 p-4 border dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-700">
              <h3 className="text-lg font-semibold mb-2 dark:text-white">
                Évaluation actuelle
              </h3>
              <p className="dark:text-gray-300">
                <span className="font-medium dark:text-white">Statut:</span>
                <span
                  className={`ml-2 px-2 py-1 rounded-full text-xs font-semibold ${
                    statusColors[workshop.status]
                  }`}
                >
                  {statusLabels[workshop.status]}
                </span>
              </p>
              <p className="dark:text-gray-300">
                <span className="font-medium dark:text-white">Évalué par:</span>{" "}
                {workshop.reviewedBy?.name}
              </p>
              <p className="dark:text-gray-300">
                <span className="font-medium dark:text-white">
                  Date d'évaluation:
                </span>{" "}
                {new Date(workshop.updatedAt).toLocaleDateString()}
              </p>
              {workshop.reviewedBy?.comments && (
                <div className="mt-2">
                  <p className="font-medium dark:text-white">Commentaires:</p>
                  <p className="text-gray-700 dark:text-gray-300 whitespace-pre-line">
                    {workshop.reviewedBy.comments}
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

          {/* Afficher le formulaire d'évaluation uniquement si le workshop n'est pas terminé */}
          {workshop.status !== "completed" && (
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
                  placeholder="Fournir un retour sur le workshop proposé..."
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

          {/* Bouton pour marquer le workshop comme terminé (visible uniquement pour les workshops approuvés) */}
          {workshop.status === "approved" && (
            <div className="mt-6 p-4 border dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-700">
              <h3 className="text-lg font-semibold mb-3 dark:text-white">
                Marquer le workshop comme terminé
              </h3>
              <p className="mb-4 dark:text-gray-300">
                Une fois le workshop complètement terminé, vous pouvez le
                marquer comme tel.
              </p>
              <button
                type="button"
                onClick={handleCompleteWorkshop}
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