import React, { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import AppHeader from "../components/layout/AppHeader";
import Footer from "../components/layout/Footer";
import ProjectCard from "../components/patterns/ProjectCard";
import Button from "../components/ui/Button";
import Skeleton from "../components/ui/Skeleton";
import BentoGrid from "../components/ui/BentoGrid";
import BentoCard from "../components/ui/BentoCard";
import FilterChips from "../components/ui/FilterChips";
import EmptyState from "../components/ui/EmptyState";
import { useAuth } from "../context/AuthContext";
import { useApi } from "../hooks/useApi";

export default function Dashboard() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const { get, loading: apiLoading } = useApi();
  const [projects, setProjects] = useState([]);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
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
    return (
      <div className="flex justify-center py-16">
        <Skeleton variant="rect" width={320} height={48} />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const handleProjectDelete = (projectId) => {
    setProjects(projects.filter((project) => project._id !== projectId));
  };

  const firstName = user?.name?.split(" ")[0] ?? "étudiant";

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <Head>
        <title>Hub Projets - Tableau de bord</title>
      </Head>

      <AppHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="border-b border-border bg-surface">
          <div className="container mx-auto px-4 py-8 max-w-container">
            <p className="text-text-muted text-sm mb-1">Tableau de bord</p>
            <h1 className="text-2xl font-bold tracking-tight text-text">
              Bonjour, {firstName}
            </h1>
          </div>
        </section>

        {/* Bento navigation */}
        <section className="container mx-auto px-4 py-8 max-w-container">
          <BentoGrid cols={3} gap="md">
            <BentoCard span="wide" variant="highlight" as="a" href="/dashboard">
              <p className="text-xs font-medium text-primary/70 uppercase tracking-wide mb-1">
                Mes projets
              </p>
              <p className="text-2xl font-bold text-text">
                {projects.length}
                <span className="text-base font-normal text-text-muted ml-1">
                  projet{projects.length !== 1 ? "s" : ""} soumis
                </span>
              </p>
            </BentoCard>

            <BentoCard as="a" href="/submit-project">
              <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1">
                Soumettre
              </p>
              <p className="text-sm text-text-dim">Nouveau projet</p>
            </BentoCard>

            <BentoCard as="a" href="/workshops/dashboard">
              <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1">
                Workshops
              </p>
              <p className="text-sm text-text-dim">Mes ateliers</p>
            </BentoCard>

            <BentoCard span="wide" variant="highlight" as="a" href="/simulated">
              <p className="text-xs font-medium text-primary/70 uppercase tracking-wide mb-1">
                Simulated
              </p>
              <p className="text-sm text-text-muted">Travail professionnel simulé</p>
            </BentoCard>

            <BentoCard as="a" href="/inventory">
              <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1">
                Inventaire
              </p>
              <p className="text-sm text-text-dim">Matériel disponible</p>
            </BentoCard>
          </BentoGrid>
        </section>

        {/* Projects list */}
        <section className="container mx-auto px-4 pb-12 max-w-container">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-text">Mes projets</h2>
            <Link href="/submit-project">
              <Button variant="primary" size="sm" as="a">
                Soumettre un projet
              </Button>
            </Link>
          </div>

          <FilterChips
            className="mb-6"
            options={[
              { value: "all", label: "Tous" },
              { value: "pending", label: "En attente" },
              { value: "pending_changes", label: "Modifs requises" },
              { value: "approved", label: "Approuvés" },
              { value: "rejected", label: "Refusés" },
              { value: "completed", label: "Terminés" },
            ]}
            value={filter}
            onChange={setFilter}
          />

          {apiLoading ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} variant="rect" height={180} />
              ))}
            </div>
          ) : filteredProjects.length === 0 ? (
            <EmptyState
              title="Aucun projet à afficher"
              sub={
                filter === "all"
                  ? "Vous n'avez pas encore soumis de projet."
                  : "Aucun projet avec ce statut."
              }
              action={
                filter === "all" ? (
                  <Link href="/submit-project">
                    <Button variant="primary" as="a">
                      Soumettre mon premier projet
                    </Button>
                  </Link>
                ) : null
              }
            />
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
        </section>
      </main>

      <Footer />
    </div>
  );
}
