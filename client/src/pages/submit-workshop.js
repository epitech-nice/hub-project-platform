// pages/submit-workshop.js
import React, { useEffect } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import Header from "../components/layout/Header";
import WorkshopForm from "../components/forms/WorkshopForm";
import { useAuth } from "../context/AuthContext";

export default function SubmitWorkshop() {
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Rediriger si non authentifié
    if (!loading && !isAuthenticated) {
      router.push("/");
    }
  }, [isAuthenticated, loading, router]);

  if (loading) {
    return <div className="text-center py-10 dark:text-white">Chargement...</div>;
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen dark:bg-gray-900">
      <Head>
        <title>Hub Projets - Soumettre un workshop</title>
        <meta
          name="description"
          content="Soumettez un nouveau workshop pour la pédagogie"
        />
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

        <h1 className="text-3xl font-bold mb-6 dark:text-white">Soumettre un workshop</h1>
        
        <div className="max-w-3xl mx-auto">
          <WorkshopForm />
        </div>
      </main>
    </div>
  );
}