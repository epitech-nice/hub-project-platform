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

  if (authLoading) {
    return <div className="text-center py-10">Chargement...</div>;
  }

  if (!isAuthenticated || !isAdmin) {
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
        <title>Hub Projets - Administration</title>
      </Head>

      <Header />

      <main className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-6">Administration des projets</h1>

        <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex space-x-2">
            <button
              className={`px-4 py-2 rounded-md ${
                filter === "all" ? "bg-gray-700 text-white" : "bg-gray-200"
              }`}
              onClick={() => setFilter("all")}
            >
              Tous
            </button>
            <button
              className={`px-4 py-2 rounded-md ${
                filter === "pending"
                  ? "bg-yellow-500 text-white"
                  : "bg-gray-200"
              }`}
              onClick={() => setFilter("pending")}
            >
              En attente
            </button>
            <button
              className={`px-4 py-2 rounded-md ${
                filter === "pending_changes"
                  ? "bg-orange-500 text-white"
                  : "bg-gray-200"
              }`}
              onClick={() => setFilter("pending_changes")}
            >
              Modifs requises
            </button>
            <button
              className={`px-4 py-2 rounded-md ${
                filter === "approved"
                  ? "bg-green-600 text-white"
                  : "bg-gray-200"
              }`}
              onClick={() => setFilter("approved")}
            >
              Approuvés
            </button>
            <button
              className={`px-4 py-2 rounded-md ${
                filter === "rejected" ? "bg-red-600 text-white" : "bg-gray-200"
              }`}
              onClick={() => setFilter("rejected")}
            >
              Refusés
            </button>
            <button
              className={`px-4 py-2 rounded-md ${
                filter === "completed"
                  ? "bg-purple-600 text-white"
                  : "bg-gray-200"
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
              className="w-full px-3 py-2 border rounded-md"
            />
          </div>
        </div>

        {apiLoading ? (
          <div className="text-center py-10">Chargement des projets...</div>
        ) : filteredProjects.length === 0 ? (
          <div className="bg-white shadow-md rounded-lg p-8 text-center">
            <h3 className="text-xl font-bold mb-3">Aucun projet à afficher</h3>
            <p className="text-gray-600 mb-4">
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
            <table className="w-full bg-white shadow-md rounded-lg">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left">Nom du projet</th>
                  <th className="px-4 py-3 text-left">Soumis par</th>
                  <th className="px-4 py-3 text-left">Date de soumission</th>
                  <th className="px-4 py-3 text-left">Statut</th>
                  <th className="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProjects.map((project) => (
                  <tr key={project._id} className="border-t">
                    <td className="px-4 py-3">
                      <span className="font-medium">{project.name}</span>
                    </td>
                    <td className="px-4 py-3">{project.submittedBy.name}</td>
                    <td className="px-4 py-3">
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
                        <a className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 text-sm">
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
      </main>
    </div>
  );
}
