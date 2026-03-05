// pages/admin/workshops/dashboard.js
import React, { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import Header from "../../../components/layout/Header";
import { useAuth } from "../../../context/AuthContext";
import { useApi } from "../../../hooks/useApi";

export default function AdminWorkshopsDashboard() {
  const { isAuthenticated, isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const { get, loading: apiLoading } = useApi();
  const [workshops, setWorkshops] = useState([]);
  const [filter, setFilter] = useState("pending");
  const [searchTerm, setSearchTerm] = useState("");
  const [schoolYear, setSchoolYear] = useState("");

  useEffect(() => {
    // Rediriger si non authentifié ou non admin
    if (!authLoading && (!isAuthenticated || !isAdmin)) {
      router.push("/");
    }
  }, [isAuthenticated, isAdmin, authLoading, router]);

  useEffect(() => {
    const fetchWorkshops = async () => {
      if (isAuthenticated && isAdmin) {
        try {
          const response = await get("/api/workshops", {
            status: filter !== "all" ? filter : undefined,
          });
          setWorkshops(response.data);
        } catch (error) {
          console.error("Erreur lors de la récupération des workshops:", error);
        }
      }
    };

    fetchWorkshops();
  }, [isAuthenticated, isAdmin, filter]);

  // Générer les options d'années scolaires (de 2020 jusqu'à l'année en cours)
  const currentYear = new Date().getFullYear();
  const schoolYearOptions = [];
  for (let y = 2020; y <= currentYear; y++) {
    schoolYearOptions.push(`${y}-${y + 1}`);
  }

  // Filtrer par année scolaire (1 sept → 31 août)
  const isInSchoolYear = (date, yearLabel) => {
    if (!yearLabel) return true;
    const startYear = parseInt(yearLabel.split("-")[0], 10);
    const start = new Date(startYear, 8, 1); // 1 septembre
    const end = new Date(startYear + 1, 7, 31, 23, 59, 59); // 31 août
    const d = new Date(date);
    return d >= start && d <= end;
  };

  // Filtrer les workshops en fonction du terme de recherche et de l'année scolaire
  const filteredWorkshops = workshops.filter((workshop) => {
    const matchesSearch =
      !searchTerm ||
      workshop.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      workshop.submittedBy.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesYear = isInSchoolYear(workshop.createdAt, schoolYear);
    return matchesSearch && matchesYear;
  });

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
        <title>Hub Projets - Administration des Workshops</title>
      </Head>

      <Header />

      <main className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-6 dark:text-white">Administration des workshops</h1>

        <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
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

          <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
            <select
              value={schoolYear}
              onChange={(e) => setSchoolYear(e.target.value)}
              className="px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            >
              <option value="">Toutes les années</option>
              {schoolYearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Rechercher..."
              className="w-full md:w-64 px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
          </div>
        </div>

        {apiLoading ? (
          <div className="text-center py-10 dark:text-white">Chargement des workshops...</div>
        ) : filteredWorkshops.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-8 text-center">
            <h3 className="text-xl font-bold mb-3 dark:text-white">Aucun workshop à afficher</h3>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              {searchTerm
                ? "Aucun workshop ne correspond à votre recherche."
                : `Il n'y a actuellement aucun workshop ${
                    filter === "all"
                      ? ""
                      : filter === "pending"
                      ? "en attente"
                      : filter === "approved"
                      ? "approuvé"
                      : filter === "rejected"
                      ? "refusé"
                      : filter === "completed"
                      ? "terminé"
                      : "en attente de modifications"
                  }.`}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full bg-white dark:bg-gray-800 shadow-md rounded-lg">
              <thead className="bg-gray-100 dark:bg-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left dark:text-gray-200">Titre du workshop</th>
                  <th className="px-4 py-3 text-left dark:text-gray-200">Soumis par</th>
                  <th className="px-4 py-3 text-left dark:text-gray-200">Date de soumission</th>
                  <th className="px-4 py-3 text-left dark:text-gray-200">Statut</th>
                  <th className="px-4 py-3 text-center dark:text-gray-200">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredWorkshops.map((workshop) => (
                  <tr key={workshop._id} className="border-t dark:border-gray-700">
                    <td className="px-4 py-3 dark:text-white">
                      <span className="font-medium">{workshop.title}</span>
                    </td>
                    <td className="px-4 py-3 dark:text-gray-300">{workshop.submittedBy.name}</td>
                    <td className="px-4 py-3 dark:text-gray-300">
                      {new Date(workshop.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          statusColors[workshop.status]
                        }`}
                      >
                        {statusLabels[workshop.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Link href={`/admin/workshops/${workshop._id}`}>
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
      </main>
    </div>
  );
}