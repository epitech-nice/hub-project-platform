// pages/dashboard.js
import React, { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import Header from "../components/layout/Header";
import ProjectCard from "../components/projects/ProjectCard";
import { useAuth } from "../context/AuthContext";
import { useApi } from "../hooks/useApi";

export default function Dashboard() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const { get, loading: apiLoading } = useApi();
  const [projects, setProjects] = useState([]);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    // Rediriger si non authentifié
    if (!authLoading && !isAuthenticated) {
      router.push("/");
    }
  }, [isAuthenticated, authLoading, router]);

  useEffect(() => {
    const fetchProjects = async () => {
      if (isAuthenticated) {
        try {
          const response = await get("/api/projects/me");
          setProjects(response.data);
        } catch (error) {
          console.error("Erreur lors de la récupération des projets:", error);
        }
      }
    };

    fetchProjects();
  }, [isAuthenticated]);

  const filteredProjects =
    filter === "all"
      ? projects
      : projects.filter((project) => project.status === filter);

  if (authLoading) {
    return <div className="text-center py-10">Chargement...</div>;
  }

  if (!isAuthenticated) {
    return null;
  }

  // Ajouter cette fonction dans le composant Dashboard
  const handleProjectDelete = (projectId) => {
    setProjects(projects.filter((project) => project._id !== projectId));
  };

  return (
    <div>
      <Head>
        <title>Hub Projets - Tableau de bord</title>
      </Head>

      <Header />

      <main className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Mes projets</h1>
          <Link href="/submit-project">
            <a className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
              Soumettre un nouveau projet
            </a>
          </Link>
        </div>

        <div className="mb-6">
          <div className="flex space-x-4">
            <button
              className={`px-4 py-2 rounded-md ${
                filter === "all" ? "bg-blue-600 text-white" : "bg-gray-200"
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
        </div>

        {apiLoading ? (
          <div className="text-center py-10">Chargement des projets...</div>
        ) : filteredProjects.length === 0 ? (
          <div className="bg-white shadow-md rounded-lg p-8 text-center">
            <h3 className="text-xl font-bold mb-3">Aucun projet à afficher</h3>
            <p className="text-gray-600 mb-4">
              {filter === "all"
                ? "Vous n'avez pas encore soumis de projet."
                : `Vous n'avez pas de projets ${
                    filter === "pending"
                      ? "en attente"
                      : filter === "approved"
                      ? "approuvés"
                      : "refusés"
                  }.`}
            </p>
            {filter === "all" && (
              <Link href="/submit-project">
                <a className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 inline-block">
                  Soumettre mon premier projet
                </a>
              </Link>
            )}
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProjects.map((project) => (
              <ProjectCard
                key={project._id}
                project={project}
                onDelete={handleProjectDelete}
                isCreator={project.isCreator}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
