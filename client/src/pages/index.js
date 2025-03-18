// pages/index.js
import React from "react";
import Head from "next/head";
import Link from "next/link";
import { useAuth } from "../context/AuthContext";
import Header from "../components/layout/Header";

export default function Home() {
  const { isAuthenticated } = useAuth();

  return (
    <div>
      <Head>
        <title>Hub Projets - Accueil</title>
        <meta
          name="description"
          content="Plateforme de gestion des projets Hub"
        />
      </Head>

      <Header />

      <main className="container mx-auto px-4 py-10">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl font-bold mb-6">
            Bienvenue sur la plateforme Hub Projets
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            Soumettez et gérez vos demandes de projets en quelques clics
          </p>

          {isAuthenticated ? (
            <div className="flex justify-center space-x-4">
              <Link href="/dashboard">
                <a className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700">
                  Accéder à mon tableau de bord
                </a>
              </Link>
              <Link href="/submit-project">
                <a className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700">
                  Soumettre un nouveau projet
                </a>
              </Link>
            </div>
          ) : (
            <a
              href={`${process.env.NEXT_PUBLIC_API_URL}/api/auth/microsoft`}
              className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700"
            >
              Connexion
            </a>
          )}
        </div>

        <div className="mt-16 grid md:grid-cols-3 gap-8">
          <div className="bg-white shadow-md rounded-lg p-6">
            <h3 className="text-xl font-bold mb-3">Soumettre un projet</h3>
            <p className="text-gray-600 mb-4">
              Remplissez un formulaire simple pour soumettre votre demande de
              projet Hub.
            </p>
          </div>

          <div className="bg-white shadow-md rounded-lg p-6">
            <h3 className="text-xl font-bold mb-3">Suivi en temps réel</h3>
            <p className="text-gray-600 mb-4">
              Suivez l'état de vos demandes et consultez les retours des
              administrateurs.
            </p>
          </div>

          <div className="bg-white shadow-md rounded-lg p-6">
            <h3 className="text-xl font-bold mb-3">Gestion simplifiée</h3>
            <p className="text-gray-600 mb-4">
              Une interface intuitive pour gérer toutes vos demandes de projets.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
