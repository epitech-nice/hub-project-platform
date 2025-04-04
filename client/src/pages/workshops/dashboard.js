// pages/workshops/dashboard.js
import React, { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import Header from "../../components/layout/Header";
import WorkshopCard from "../../components/workshops/WorkshopCard";
import { useAuth } from "../../context/AuthContext";
import { useApi } from "../../hooks/useApi";

export default function WorkshopsDashboard() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const { get, loading: apiLoading } = useApi();
  const [workshops, setWorkshops] = useState([]);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    // Rediriger si non authentifié
    if (!authLoading && !isAuthenticated) {
      router.push("/");
    }
  }, [isAuthenticated, authLoading, router]);

  useEffect(() => {
    const fetchWorkshops = async () => {
      if (isAuthenticated) {
        try {
          const response = await get("/api/workshops/me");
          setWorkshops(response.data);
        } catch (error) {
          console.error("Erreur lors de la récupération des workshops:", error);
        }
      }
    };

    fetchWorkshops();
  }, [isAuthenticated]);

  const filteredWorkshops =
    filter === "all"
      ? workshops
      : workshops.filter((workshop) => workshop.status === filter);

  if (authLoading) {
    return <div className="text-center py-10 dark:text-white">Chargement...</div>;
  }

  if (!isAuthenticated) {
    return null;
  }

  // Fonction pour gérer la suppression d'un workshop
  const handleWorkshopDelete = (workshopId) => {
    setWorkshops(workshops.filter((workshop) => workshop._id !== workshopId));
  };

  return (
    <div className="min-h-screen dark:bg-gray-900">
      <Head>
        <title>Hub Projets - Workshops</title>
      </Head>

      <Header />

      <main className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold dark:text-white">Mes workshops</h1>
          <Link href="/submit-workshop">
            <a className="bg-blue-600 dark:bg-blue-700 text-white px-4 py-2 rounded-lg hover:bg-blue-700 dark:hover:bg-blue-800">
              Soumettre un nouveau workshop
            </a>
          </Link>
        </div>

        <div className="mb-6">
          <div className="flex space-x-4 overflow-x-auto pb-2">
            <button
              className={`px-4 py-2 rounded-md ${
                filter === "all" 
                  ? "bg-blue-600 text-white dark:bg-blue-700" 
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
        </div>

        {apiLoading ? (
          <div className="text-center py-10 dark:text-white">Chargement des workshops...</div>
        ) : filteredWorkshops.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-8 text-center">
            <h3 className="text-xl font-bold mb-3 dark:text-white">Aucun workshop à afficher</h3>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              {filter === "all"
                ? "Vous n'avez pas encore soumis de workshop."
                : `Vous n'avez pas de workshops ${
                    filter === "pending"
                      ? "en attente"
                      : filter === "approved"
                      ? "approuvés"
                      : filter === "rejected"
                      ? "refusés"
                      : filter === "completed"
                      ? "terminés"
                      : "en attente de modifications"
                  }.`}
            </p>
            {filter === "all" && (
              <Link href="/submit-workshop">
                <a className="bg-blue-600 dark:bg-blue-700 text-white px-4 py-2 rounded-md hover:bg-blue-700 dark:hover:bg-blue-800 inline-block">
                  Soumettre mon premier workshop
                </a>
              </Link>
            )}
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredWorkshops.map((workshop) => (
              <WorkshopCard
                key={workshop._id}
                workshop={workshop}
                onDelete={handleWorkshopDelete}
                isMain={workshop.isMain}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}