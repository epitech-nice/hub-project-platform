// pages/projects/[id].js
import React, { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import Header from "../../components/layout/Header";
import { useAuth } from "../../context/AuthContext";
import { useApi } from "../../hooks/useApi";

export default function ProjectDetail() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const { id } = router.query;
  const { get, patch, loading: apiLoading } = useApi();
  const [project, setProject] = useState(null);
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
  }, [isAuthenticated, id]);

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
      alert("Informations mises à jour avec succès!");
    } catch (err) {
      setError(
        err.message ||
          "Une erreur est survenue lors de la mise à jour des informations"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading || apiLoading) {
    return <div className="text-center py-10">Chargement...</div>;
  }

  if (!project) {
    return null;
  }

  const statusColors = {
    pending: 'bg-yellow-100 text-yellow-800',
    pending_changes: 'bg-orange-100 text-orange-800',
    approved: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800'
  };
  
  const statusLabels = {
    pending: 'En attente',
    pending_changes: 'Modifications requises',
    approved: 'Approuvé',
    rejected: 'Refusé'
  };

  return (
    <div>
      <Head>
        <title>Hub Projets - {project.name}</title>
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

          {project.status === "pending_changes" && (
            <div className="mt-4 p-4 bg-orange-50 border border-orange-200 rounded-lg">
              <h3 className="text-lg font-semibold text-orange-800 mb-2">
                Modifications requises
              </h3>
              <p className="text-gray-700 whitespace-pre-line">
                {project.reviewedBy?.comments}
              </p>
              <div className="mt-4">
                <Link href={`/projects/edit/${project._id}`}>
                  <a className="bg-orange-500 text-white px-4 py-2 rounded-md hover:bg-orange-600 inline-block">
                    Effectuer les modifications
                  </a>
                </Link>
              </div>
            </div>
          )}

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
            {project.changeHistory && project.changeHistory.length > 0 && (
              <div className="mb-6">
                <h2 className="text-xl font-semibold mb-2">Historique des modifications</h2>
                <div className="border rounded-lg overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Statut</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Par</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Commentaires</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {project.changeHistory.map((history, index) => (
                        <tr key={index}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {new Date(history.date).toLocaleString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full 
                              ${history.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 
                              history.status === 'pending_changes' ? 'bg-orange-100 text-orange-800' :
                              history.status === 'approved' ? 'bg-green-100 text-green-800' :
                              'bg-red-100 text-red-800'}`}>
                              {history.status === 'pending' ? 'En attente' : 
                              history.status === 'pending_changes' ? 'Modifications requises' :
                              history.status === 'approved' ? 'Approuvé' : 'Refusé'}
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
            <p className="text-gray-700">
              Nombre d'étudiants impliqués: {project.studentCount}
            </p>
            <p className="text-gray-700">
              Soumis le: {new Date(project.createdAt).toLocaleDateString()}
            </p>
          </div>

          <div className="mt-2">
            <p className="text-gray-700 font-semibold">Étudiants impliqués:</p>
            <ul className="list-disc list-inside ml-2">
              <li className="text-gray-700">
                Chef de groupe: {project.submittedBy.email}
              </li>
              {project.studentCount > 1 &&
                project.studentEmails &&
                project.studentEmails.length > 0 &&
                project.studentEmails.map((email, index) => (
                  <li key={index} className="text-gray-700">
                    {email}
                  </li>
                ))}
            </ul>
          </div>

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

          {project.reviewedBy && (
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-2">Évaluation</h2>
              <p className="text-gray-700">
                Évalué par: {project.reviewedBy.name}
              </p>
              {project.reviewedBy.comments && (
                <div>
                  <p className="font-semibold mt-2">Commentaires:</p>
                  <p className="text-gray-700 whitespace-pre-line">
                    {project.reviewedBy.comments}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {project.status === "approved" && (
          <div className="bg-white shadow-md rounded-lg p-6">
            <h2 className="text-2xl font-bold mb-4">
              Informations supplémentaires
            </h2>

            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label
                  className="block text-gray-700 font-bold mb-2"
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
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="https://github.com/votre-username"
                />
              </div>

              <div className="mb-4">
                <label
                  className="block text-gray-700 font-bold mb-2"
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
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="https://github.com/organization/project"
                />
              </div>

              <div className="mb-6">
                <label
                  className="block text-gray-700 font-bold mb-2"
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
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="https://docs.google.com/document1, https://docs.google.com/document2"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  disabled={isSubmitting}
                >
                  {isSubmitting
                    ? "Mise à jour..."
                    : "Mettre à jour les informations"}
                </button>
              </div>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
