// pages/admin/dashboard.js
import React, { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import Header from "../../components/layout/Header";
import { useAuth } from "../../context/AuthContext";
import { useApi } from "../../hooks/useApi";

export default function AdminDashboard() {
  const { isAuthenticated, isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const { get, loading: apiLoading } = useApi();
  const [projects, setProjects] = useState([]);
  const [filter, setFilter] = useState("pending");
  const [searchTerm, setSearchTerm] = useState("");
  const [showExportModal, setShowExportModal] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    // Rediriger si non authentifié ou non admin
    if (!authLoading && (!isAuthenticated || !isAdmin)) {
      router.push("/");
    }
  }, [isAuthenticated, isAdmin, authLoading, router]);

  useEffect(() => {
    const fetchProjects = async () => {
      if (isAuthenticated && isAdmin) {
        try {
          const response = await get("/api/projects", {
            status: filter !== "all" ? filter : undefined,
          });
          setProjects(response.data);
        } catch (error) {
          console.error("Erreur lors de la récupération des projets:", error);
        }
      }
    };

    fetchProjects();
  }, [isAuthenticated, isAdmin, filter]);

  // Filtrer les projets en fonction du terme de recherche
  const filteredProjects = searchTerm
    ? projects.filter(
        (project) =>
          project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          project.submittedBy.name
            .toLowerCase()
            .includes(searchTerm.toLowerCase())
      )
    : projects;

  // Fonction pour exporter les projets terminés en CSV
  const handleExportCSV = async () => {
    try {
      setIsExporting(true);

      // Construire l'URL avec les paramètres de date
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const token = localStorage.getItem('token');
      const url = `${process.env.NEXT_PUBLIC_API_URL}/api/projects/export/completed-csv${params.toString() ? '?' + params.toString() : ''}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Erreur lors de l\'export');
      }

      // Créer un blob à partir de la réponse
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);

      // Créer un lien temporaire pour télécharger le fichier
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `completed_projects_${startDate || 'all'}_to_${endDate || 'all'}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Nettoyer l'URL
      window.URL.revokeObjectURL(downloadUrl);

      // Fermer le modal
      setShowExportModal(false);
      setStartDate('');
      setEndDate('');
    } catch (error) {
      console.error('Erreur lors de l\'export:', error);
      alert(error.message || 'Erreur lors de l\'export des projets');
    } finally {
      setIsExporting(false);
    }
  };

  if (authLoading) {
    return <div className="text-center py-10 dark:text-white">Chargement...</div>;
  }

  if (!isAuthenticated || !isAdmin) {
    return null;
  }

  const statusColors = {
    pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-800/20 dark:text-yellow-300",
    pending_changes: "bg-orange-100 text-orange-800 dark:bg-orange-800/20 dark:text-orange-300",
    approved: "bg-green-100 text-green-800 dark:bg-green-800/20 dark:text-green-300",
    rejected: "bg-red-100 text-red-800 dark:bg-red-800/20 dark:text-red-300",
    completed: "bg-purple-100 text-purple-800 dark:bg-purple-800/20 dark:text-purple-300",
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
        <title>Hub Projets - Administration</title>
      </Head>

      <Header />

      <main className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-6 dark:text-white">Administration des projets</h1>

        <div className="mb-6 flex flex-col gap-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex space-x-2 overflow-x-auto pb-2">
              <button
                className={`px-4 py-2 rounded-md ${
                  filter === "all"
                    ? "bg-gray-700 text-white dark:bg-gray-600"
                    : "bg-gray-200 dark:bg-gray-700 dark:text-gray-300"
                }`}
                onClick={() => setFilter("all")}
              >
                Tous
              </button>
              <button
                className={`px-4 py-2 rounded-md ${
                  filter === "pending"
                    ? "bg-yellow-500 text-white dark:bg-yellow-600"
                    : "bg-gray-200 dark:bg-gray-700 dark:text-gray-300"
                }`}
                onClick={() => setFilter("pending")}
              >
                En attente
              </button>
              <button
                className={`px-4 py-2 rounded-md ${
                  filter === "pending_changes"
                    ? "bg-orange-500 text-white dark:bg-orange-600"
                    : "bg-gray-200 dark:bg-gray-700 dark:text-gray-300"
                }`}
                onClick={() => setFilter("pending_changes")}
              >
                Modifs requises
              </button>
              <button
                className={`px-4 py-2 rounded-md ${
                  filter === "approved"
                    ? "bg-green-600 text-white dark:bg-green-700"
                    : "bg-gray-200 dark:bg-gray-700 dark:text-gray-300"
                }`}
                onClick={() => setFilter("approved")}
              >
                Approuvés
              </button>
              <button
                className={`px-4 py-2 rounded-md ${
                  filter === "rejected"
                    ? "bg-red-600 text-white dark:bg-red-700"
                    : "bg-gray-200 dark:bg-gray-700 dark:text-gray-300"
                }`}
                onClick={() => setFilter("rejected")}
              >
                Refusés
              </button>
              <button
                className={`px-4 py-2 rounded-md ${
                  filter === "completed"
                    ? "bg-purple-600 text-white dark:bg-purple-700"
                    : "bg-gray-200 dark:bg-gray-700 dark:text-gray-300"
                }`}
                onClick={() => setFilter("completed")}
              >
                Terminés
              </button>
            </div>

            <div className="w-full md:w-64">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Rechercher..."
                className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
            </div>
          </div>

          {filter === "completed" && (
            <div className="flex justify-end">
              <button
                onClick={() => setShowExportModal(true)}
                className="bg-purple-600 hover:bg-purple-700 dark:bg-purple-700 dark:hover:bg-purple-800 text-white px-4 py-2 rounded-md flex items-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
                Exporter en CSV
              </button>
            </div>
          )}
        </div>

        {apiLoading ? (
          <div className="text-center py-10 dark:text-white">Chargement des projets...</div>
        ) : filteredProjects.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-8 text-center">
            <h3 className="text-xl font-bold mb-3 dark:text-white">Aucun projet à afficher</h3>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              {searchTerm
                ? "Aucun projet ne correspond à votre recherche."
                : `Il n'y a actuellement aucun projet ${
                    filter === "all"
                      ? ""
                      : filter === "pending"
                      ? "en attente"
                      : filter === "approved"
                      ? "approuvé"
                      : "refusé"
                  }.`}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full bg-white dark:bg-gray-800 shadow-md rounded-lg">
              <thead className="bg-gray-100 dark:bg-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left dark:text-gray-200">Nom du projet</th>
                  <th className="px-4 py-3 text-left dark:text-gray-200">Soumis par</th>
                  <th className="px-4 py-3 text-left dark:text-gray-200">Date de soumission</th>
                  <th className="px-4 py-3 text-left dark:text-gray-200">Statut</th>
                  <th className="px-4 py-3 text-center dark:text-gray-200">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProjects.map((project) => (
                  <tr key={project._id} className="border-t dark:border-gray-700">
                    <td className="px-4 py-3 dark:text-white">
                      <span className="font-medium">{project.name}</span>
                    </td>
                    <td className="px-4 py-3 dark:text-gray-300">{project.submittedBy.name}</td>
                    <td className="px-4 py-3 dark:text-gray-300">
                      {new Date(project.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          statusColors[project.status]
                        }`}
                      >
                        {statusLabels[project.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Link href={`/admin/projects/${project._id}`}>
                        <a className="bg-blue-600 dark:bg-blue-700 text-white px-3 py-1 rounded hover:bg-blue-700 dark:hover:bg-blue-800 text-sm">
                          Détails
                        </a>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Modal pour l'export CSV */}
        {showExportModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
              <h2 className="text-xl font-bold mb-4 dark:text-white">Exporter les projets terminés</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2 dark:text-gray-200">
                    Date de début
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 dark:text-gray-200">
                    Date de fin
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                </div>

                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Laissez vide pour exporter tous les projets terminés
                </p>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowExportModal(false);
                    setStartDate('');
                    setEndDate('');
                  }}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-white"
                  disabled={isExporting}
                >
                  Annuler
                </button>
                <button
                  onClick={handleExportCSV}
                  disabled={isExporting}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 dark:bg-purple-700 dark:hover:bg-purple-800 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isExporting ? 'Export en cours...' : 'Exporter'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}