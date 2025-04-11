import React, { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import Header from "../../components/layout/Header";
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
    // Rediriger si non authentifié
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

          // Vérifier si l'utilisateur est l'intervenant principal ou un intervenant
          if (user) {
            const isMainInstructor =
              response.data.submittedBy.userId === user._id ||
              response.data.submittedBy.userId.toString() ===
                user._id.toString();
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
    if (
      window.confirm(
        "Êtes-vous sûr de vouloir quitter ce workshop ? Cette action est irréversible."
      )
    ) {
      try {
        setIsSubmitting(true);
        await post(`/api/workshops/${id}/leave`);
        toast.success("Vous avez quitté le workshop avec succès !");
        router.push("/dashboard"); // Rediriger vers le tableau de bord personnel
      } catch (err) {
        setError(
          err.message ||
            "Une erreur est survenue lors de la tentative de quitter le workshop"
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

  if (!workshop) {
    return (
      <div className="min-h-screen dark:bg-gray-900">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-6 text-center">
            <h1 className="text-2xl font-bold mb-4 dark:text-white">
              {error || "Workshop introuvable"}
            </h1>
            <button
              onClick={() => router.back()}
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              Retour
            </button>
          </div>
        </div>
      </div>
    );
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
        <title>Hub Projets - Workshop: {workshop.title}</title>
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

        {/* Bouton pour quitter le workshop (visible uniquement pour les intervenants non-principaux) */}
        {isInstructor && !isMain && (
          <div className="mb-6 p-4 border dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-700">
            <h3 className="text-lg font-semibold mb-3 dark:text-white">
              Quitter ce workshop
            </h3>
            <p className="mb-4 dark:text-gray-300">
              En quittant ce workshop, vous serez supprimé de la liste des
              intervenants et n'aurez plus accès aux informations spécifiques du
              workshop.
            </p>
            <button
              type="button"
              onClick={handleLeaveWorkshop}
              className="bg-red-600 dark:bg-red-700 text-white px-4 py-2 rounded-lg hover:bg-red-700 dark:hover:bg-red-800"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Traitement en cours..." : "Quitter le workshop"}
            </button>
          </div>
        )}

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
            <p className="text-gray-700 dark:text-gray-300">
              Soumis le: {new Date(workshop.createdAt).toLocaleDateString()}
            </p>
          </div>

          {/* Affichage des autres intervenants si plus d'un */}
          {workshop.instructorCount > 1 &&
            workshop.instructorEmails &&
            workshop.instructorEmails.length > 0 && (
              <div className="mb-6">
                <h2 className="text-xl font-semibold mb-2 dark:text-white">
                  Intervenants
                </h2>
                <ul className="list-disc list-inside ml-2">
                  <li className="text-gray-700 dark:text-gray-300">
                    Principal: {workshop.submittedBy?.email}
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
              (link) => link && (Array.isArray(link) ? link.length > 0 : true)
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

          {workshop.reviewedBy && (
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-2 dark:text-white">
                Évaluation
              </h2>
              <p className="text-gray-700 dark:text-gray-300">
                Évalué par: {workshop.reviewedBy.name}
              </p>
              {workshop.reviewedBy.comments && (
                <div>
                  <p className="font-semibold mt-2 dark:text-white">
                    Commentaires:
                  </p>
                  <p className="text-gray-700 dark:text-gray-300 whitespace-pre-line">
                    {workshop.reviewedBy.comments}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Afficher l'historique des modifications si disponible */}
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

        {/* Message pour modifications requises */}
        {workshop.status === "pending_changes" && (
          <div className="mb-8 p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
            <h3 className="text-lg font-semibold text-orange-800 dark:text-orange-300 mb-2">
              Modifications requises
            </h3>
            <p className="text-gray-700 dark:text-gray-300 whitespace-pre-line">
              {workshop.reviewedBy?.comments}
            </p>
            <div className="mt-4">
              <Link href={`/workshops/edit/${workshop._id}`}>
                <a className="bg-orange-500 dark:bg-orange-600 text-white px-4 py-2 rounded-md hover:bg-orange-600 dark:hover:bg-orange-700 inline-block">
                  Effectuer les modifications
                </a>
              </Link>
            </div>
          </div>
        )}

        {/* Afficher un message si le workshop est terminé */}
        {workshop.status === "completed" && (
          <div className="mb-8 p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
            <h3 className="text-lg font-semibold text-purple-800 dark:text-purple-300 mb-2">
              Workshop terminé
            </h3>
            <p className="text-gray-700 dark:text-gray-300">
              Ce workshop a été marqué comme terminé.
            </p>
          </div>
        )}

        {/* Afficher un message d'erreur si présent */}
        {error && (
          <div className="mb-8 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}
      </main>
    </div>
  );
}
