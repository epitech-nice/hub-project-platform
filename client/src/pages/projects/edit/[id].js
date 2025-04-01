import React, { useEffect, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import Header from "../../../components/layout/Header";
import { useAuth } from "../../../context/AuthContext";
import { useApi } from "../../../hooks/useApi";

export default function EditProject() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const { id } = router.query;
  const { get, put, loading: apiLoading } = useApi();

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    objectives: "",
    technologies: "",
    studentCount: 1,
    studentEmails: "",
    links: {
      github: "",
      projectGithub: "",
      other: "",
    },
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [project, setProject] = useState(null);
  const [githubError, setGithubError] = useState("");

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
          const project = response.data;

          // Vérifier si le projet est en attente ou en attente de modifications
          if (
            project.status !== "pending" &&
            project.status !== "pending_changes"
          ) {
            alert(
              "Seuls les projets en attente ou en attente de modifications peuvent être modifiés."
            );
            router.push("/dashboard");
            return;
          }

          setProject(project);

          // Formater les données pour le formulaire
          setFormData({
            name: project.name,
            description: project.description,
            objectives: project.objectives,
            technologies: project.technologies.join(", "),
            studentCount: project.studentCount,
            studentEmails: project.studentEmails
              ? project.studentEmails.join(", ")
              : "",
            links: {
              github: project.links.github || "",
              projectGithub: project.links.projectGithub || "",
              other: project.links.other ? project.links.other.join(", ") : "",
            },
          });
        } catch (error) {
          console.error("Erreur lors de la récupération du projet:", error);
          alert(
            "Erreur lors de la récupération du projet. Redirection vers le tableau de bord."
          );
          router.push("/dashboard");
        }
      }
    };

    fetchProject();
  }, [isAuthenticated, id, router]);

  // Fonction pour valider uniquement le lien GitHub personnel
  const validateGithubUrl = async (url) => {
    if (!url) {
      setGithubError("Ce champ est obligatoire");
      return false;
    }

    // Vérifier si l'URL ressemble à un lien GitHub
    const githubRegex = /^https:\/\/github\.com\/[\w-]+\/[\w-]+\/?$/;
    if (!githubRegex.test(url)) {
      setGithubError(
        "URL GitHub invalide (ex: https://github.com/username/repo)"
      );
      return false;
    }

    try {
      // Vérifier si le dépôt est public en essayant d'y accéder via l'API GitHub
      const repoUrl = url.replace(
        "https://github.com/",
        "https://api.github.com/repos/"
      );
      const response = await fetch(repoUrl);

      if (response.status === 200) {
        setGithubError("");
        return true;
      } else if (response.status === 404) {
        setGithubError("Ce dépôt n'existe pas ou est privé");
        return false;
      } else {
        setGithubError("Erreur lors de la vérification du dépôt");
        return false;
      }
    } catch (error) {
      console.error("Erreur lors de la vérification du dépôt GitHub:", error);
      setGithubError("Erreur de connexion lors de la vérification");
      return false;
    }
  };

  // Valider le lien GitHub personnel lorsqu'il change
  useEffect(() => {
    const validatePersonalGithub = async () => {
      if (formData.links.github) {
        await validateGithubUrl(formData.links.github);
      }
    };

    const timeoutId = setTimeout(validatePersonalGithub, 800); // Délai pour éviter trop de requêtes
    return () => clearTimeout(timeoutId);
  }, [formData.links.github]);

  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name.includes(".")) {
      const [parent, child] = name.split(".");
      setFormData({
        ...formData,
        [parent]: {
          ...formData[parent],
          [child]: value,
        },
      });
    } else {
      setFormData({
        ...formData,
        [name]: value,
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");

    try {
      // Valider le lien GitHub personnel avant de soumettre
      const isGithubValid = await validateGithubUrl(formData.links.github);

      if (!isGithubValid) {
        throw new Error(
          "Veuillez corriger les erreurs dans le lien GitHub personnel"
        );
      }

      // Vérification des champs obligatoires
      if (!formData.links.projectGithub) {
        throw new Error("Le lien GitHub du projet est obligatoire");
      }

      // Validation des emails si studentCount > 1
      if (formData.studentCount > 1 && !formData.studentEmails.trim()) {
        throw new Error(
          "Veuillez indiquer les adresses e-mail des étudiants lorsque le projet implique plusieurs personnes"
        );
      }

      // Transformer les technologies en array
      const formattedData = {
        ...formData,
        technologies: formData.technologies
          .split(",")
          .map((tech) => tech.trim()),
        studentEmails:
          formData.studentCount > 1
            ? formData.studentEmails.split(",").map((email) => email.trim())
            : [],
        links: {
          ...formData.links,
          other: formData.links.other
            ? formData.links.other.split(",").map((link) => link.trim())
            : [],
        },
      };

      await put(`/api/projects/${id}`, formattedData);
      alert("Projet mis à jour avec succès !");
      router.push("/dashboard");
    } catch (err) {
      setError(
        err.message ||
          "Une erreur est survenue lors de la mise à jour du projet"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading || apiLoading || !project) {
    return (
      <div className="text-center py-10 dark:text-white">Chargement...</div>
    );
  }

  return (
    <div className="min-h-screen dark:bg-gray-900">
      <Head>
        <title>Hub Projets - Modifier le projet</title>
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

        <h1 className="text-3xl font-bold mb-6 dark:text-white">
          Modifier le projet
        </h1>

        <div className="max-w-3xl mx-auto">
          <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-6">
            {error && (
              <div className="bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded mb-4">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label
                  className="block text-gray-700 dark:text-gray-300 font-bold mb-2"
                  htmlFor="name"
                >
                  Nom du projet *
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border dark:border-gray-700 dark:bg-gray-700 dark:text-white rounded-lg"
                  required
                />
              </div>

              <div className="mb-4">
                <label
                  className="block text-gray-700 dark:text-gray-300 font-bold mb-2"
                  htmlFor="description"
                >
                  Description détaillée *
                </label>
                <textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border dark:border-gray-700 dark:bg-gray-700 dark:text-white rounded-lg"
                  rows="4"
                  required
                />
              </div>

              <div className="mb-4">
                <label
                  className="block text-gray-700 dark:text-gray-300 font-bold mb-2"
                  htmlFor="objectives"
                >
                  Objectifs *
                </label>
                <textarea
                  id="objectives"
                  name="objectives"
                  value={formData.objectives}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border dark:border-gray-700 dark:bg-gray-700 dark:text-white rounded-lg"
                  rows="3"
                  required
                />
              </div>

              <div className="mb-4">
                <label
                  className="block text-gray-700 dark:text-gray-300 font-bold mb-2"
                  htmlFor="technologies"
                >
                  Technologies utilisées * (séparées par des virgules)
                </label>
                <input
                  type="text"
                  id="technologies"
                  name="technologies"
                  value={formData.technologies}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border dark:border-gray-700 dark:bg-gray-700 dark:text-white rounded-lg"
                  placeholder="React, Node.js, MongoDB, etc."
                  required
                />
              </div>

              <div className="mb-4">
                <label
                  className="block text-gray-700 dark:text-gray-300 font-bold mb-2"
                  htmlFor="studentCount"
                >
                  Nombre d'étudiants impliqués *
                </label>
                <input
                  type="number"
                  id="studentCount"
                  name="studentCount"
                  value={formData.studentCount}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border dark:border-gray-700 dark:bg-gray-700 dark:text-white rounded-lg"
                  min="1"
                  required
                />
              </div>

              {/* Champ conditionnel pour les emails des étudiants */}
              {formData.studentCount > 1 && (
                <div className="mb-4">
                  <label
                    className="block text-gray-700 dark:text-gray-300 font-bold mb-2"
                    htmlFor="studentEmails"
                  >
                    Adresses e-mail des étudiants * (séparées par des virgules)
                  </label>
                  <input
                    type="text"
                    id="studentEmails"
                    name="studentEmails"
                    value={formData.studentEmails}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border dark:border-gray-700 dark:bg-gray-700 dark:text-white rounded-lg"
                    placeholder="etudiant1@email.com, etudiant2@email.com, ..."
                    required
                  />
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Indiquez les adresses e-mail des {formData.studentCount - 1}{" "}
                    autres étudiants impliqués dans ce projet.
                  </p>
                </div>
              )}

              <div className="mb-4">
                <label
                  className="block text-gray-700 dark:text-gray-300 font-bold mb-2"
                  htmlFor="links.github"
                >
                  Lien repo GitHub *
                </label>
                <input
                  type="url"
                  id="links.github"
                  name="links.github"
                  value={formData.links.github}
                  onChange={handleChange}
                  className={`w-full px-3 py-2 border dark:border-gray-700 dark:bg-gray-700 dark:text-white rounded-lg ${
                    githubError ? "border-red-500 dark:border-red-800" : ""
                  }`}
                  placeholder="https://github.com/username/repo"
                  required
                />
                {githubError && (
                  <p className="text-red-500 dark:text-red-400 text-sm mt-1">
                    {githubError}
                  </p>
                )}
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Le lien vers le repo GitHub (doit être public)
                </p>
              </div>

              <div className="mb-4">
                <label
                  className="block text-gray-700 dark:text-gray-300 font-bold mb-2"
                  htmlFor="links.projectGithub"
                >
                  Lien GitHub Project *
                </label>
                <input
                  type="url"
                  id="links.projectGithub"
                  name="links.projectGithub"
                  value={formData.links.projectGithub}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border dark:border-gray-700 dark:bg-gray-700 dark:text-white rounded-lg"
                  placeholder="https://github.com/organization/project"
                  required
                />
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Le lien vers le GitHub Project
                </p>
              </div>

              <div className="mb-6">
                <label
                  className="block text-gray-700 dark:text-gray-300 font-bold mb-2"
                  htmlFor="links.other"
                >
                  Autres liens (séparés par des virgules)
                </label>
                <input
                  type="text"
                  id="links.other"
                  name="links.other"
                  value={formData.links.other}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border dark:border-gray-700 dark:bg-gray-700 dark:text-white rounded-lg"
                  placeholder="https://example.com, https://another-site.com"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="bg-blue-600 dark:bg-blue-700 text-white px-6 py-2 rounded-lg hover:bg-blue-700 dark:hover:bg-blue-800 disabled:opacity-50"
                  disabled={isSubmitting || githubError}
                >
                  {isSubmitting
                    ? "Mise à jour en cours..."
                    : "Mettre à jour le projet"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}