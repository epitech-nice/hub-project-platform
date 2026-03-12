// pages/simulated/mes-projets.js
import React, { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import Header from "../../components/layout/Header";
import { useAuth } from "../../context/AuthContext";
import { useApi } from "../../hooks/useApi";

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

export default function MesProjetsSimulated() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const { get, loading: apiLoading } = useApi();

  const [enrollments, setEnrollments] = useState([]);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push("/");
  }, [isAuthenticated, authLoading, router]);

  useEffect(() => {
    if (isAuthenticated) fetchEnrollments();
  }, [isAuthenticated]);

  const fetchEnrollments = async () => {
    try {
      const res = await get("/api/simulated/my-history");
      setEnrollments(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  const filtered =
    filter === "all" ? enrollments : enrollments.filter((e) => e.status === filter);

  if (authLoading) {
    return <div className="text-center py-10 dark:text-white">Chargement...</div>;
  }

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen dark:bg-gray-900">
      <Head>
        <title>Hub Projets - Mes projets Simulated</title>
      </Head>

      <Header />

      <main className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold dark:text-white">Mes projets Simulated</h1>
          <Link href="/simulated">
            <a className="bg-blue-600 dark:bg-blue-700 text-white px-4 py-2 rounded-lg hover:bg-blue-700 dark:hover:bg-blue-800 text-sm">
              Choisir un projet
            </a>
          </Link>
        </div>

        {/* Filtres */}
        <div className="flex space-x-3 overflow-x-auto pb-2 mb-6">
          {[
            { key: "all", label: "Tous" },
            { key: "pending", label: "En attente" },
            { key: "pending_changes", label: "Modifs requises" },
            { key: "approved", label: "Approuvés" },
            { key: "completed", label: "Terminés" },
            { key: "rejected", label: "Refusés" },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-4 py-2 rounded-md whitespace-nowrap text-sm ${
                filter === key
                  ? key === "all"
                    ? "bg-blue-600 text-white dark:bg-blue-700"
                    : key === "pending"
                    ? "bg-yellow-500 text-white"
                    : key === "pending_changes"
                    ? "bg-orange-500 text-white"
                    : key === "approved"
                    ? "bg-green-600 text-white"
                    : key === "completed"
                    ? "bg-purple-600 text-white"
                    : "bg-red-600 text-white"
                  : "bg-gray-200 dark:bg-gray-700 dark:text-gray-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {apiLoading ? (
          <div className="text-center py-10 dark:text-white">Chargement...</div>
        ) : filtered.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-8 text-center">
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              {filter === "all"
                ? "Vous n'avez encore participé à aucun projet Simulated."
                : "Aucun projet dans cette catégorie."}
            </p>
            {filter === "all" && (
              <Link href="/simulated">
                <a className="bg-blue-600 dark:bg-blue-700 text-white px-4 py-2 rounded-md hover:bg-blue-700 dark:hover:bg-blue-800 inline-block">
                  Choisir mon premier projet
                </a>
              </Link>
            )}
          </div>
        ) : (
          <div className="grid gap-4">
            {filtered.map((enrollment) => (
              <Link
                key={enrollment._id}
                href={`/simulated/${enrollment.simulatedProject.projectId}`}
              >
                <a className="block bg-white dark:bg-gray-800 shadow-md rounded-lg p-5 hover:shadow-lg transition-shadow">
                  <div className="flex justify-between items-start gap-4 flex-wrap">
                    <div className="min-w-0">
                      <h2 className="text-lg font-semibold dark:text-white truncate">
                        {enrollment.simulatedProject.title}
                      </h2>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                        Cycle n°{enrollment.cycleNumber}
                        {enrollment.isDoubleCycle && (
                          <span className="ml-2 text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 px-1.5 py-0.5 rounded-full">
                            Double cycle
                          </span>
                        )}
                        {enrollment.startDate && enrollment.defenseDate && (
                          <span className="ml-2">
                            · du {new Date(enrollment.startDate).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" })} au {new Date(enrollment.defenseDate).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                          </span>
                        )}
                      </p>
                      {enrollment.submissionDeadline && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                          Deadline dépôt : {new Date(enrollment.submissionDeadline).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                        </p>
                      )}
                      {enrollment.githubProjectLink && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 truncate max-w-md">
                          {enrollment.githubProjectLink}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {enrollment.status === "completed" && enrollment.totalCredits > 0 && (
                        <span className="text-sm font-semibold text-green-700 dark:text-green-400">
                          {enrollment.totalCredits} crédit{enrollment.totalCredits !== 1 ? "s" : ""} au total
                        </span>
                      )}
                      {enrollment.status !== "completed" && enrollment.totalCredits > 0 && (
                        <span className="text-sm font-medium text-green-700 dark:text-green-400">
                          {enrollment.totalCredits} crédit{enrollment.totalCredits !== 1 ? "s" : ""}
                        </span>
                      )}
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          statusColors[enrollment.status]
                        }`}
                      >
                        {statusLabels[enrollment.status]}
                      </span>
                    </div>
                  </div>

                  {/* Commentaire admin si applicable */}
                  {enrollment.reviewedBy?.comments && enrollment.status === "pending_changes" && (
                    <div className="mt-3 p-3 bg-orange-50 dark:bg-orange-900/20 border-l-4 border-orange-400 rounded text-sm text-orange-700 dark:text-orange-400">
                      {enrollment.reviewedBy.comments}
                    </div>
                  )}
                </a>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
