// pages/workshops/dashboard.js
import { useEffect, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import AppHeader from "../../components/layout/AppHeader";
import Footer from "../../components/layout/Footer";
import WorkshopCard from "../../components/workshops/WorkshopCard";
import PageHead from "../../components/ui/PageHead";
import FilterChips from "../../components/ui/FilterChips";
import EmptyState from "../../components/ui/EmptyState";
import Skeleton from "../../components/ui/Skeleton";
import Button from "../../components/ui/Button";
import { useAuth } from "../../context/AuthContext";
import { useApi } from "../../hooks/useApi";

const FILTER_OPTIONS = [
  { value: 'all',             label: 'Tous' },
  { value: 'pending',         label: 'En attente' },
  { value: 'pending_changes', label: 'Modifs requises' },
  { value: 'approved',        label: 'Approuvés' },
  { value: 'rejected',        label: 'Refusés' },
  { value: 'completed',       label: 'Terminés' },
];

export default function WorkshopsDashboard() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const { get, loading: apiLoading } = useApi();
  const [workshops, setWorkshops] = useState([]);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
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
    return (
      <div className="min-h-screen flex flex-col bg-bg">
        <AppHeader />
        <main className="flex-1 container mx-auto px-4 py-8 max-w-7xl">
          <Skeleton variant="text" width="30%" height={32} className="mb-6" />
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => <Skeleton key={i} variant="rect" height={160} />)}
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  const handleWorkshopDelete = (workshopId) => {
    setWorkshops(workshops.filter((w) => w._id !== workshopId));
  };

  const emptySubMessage =
    filter === "all"
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
        }.`;

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <Head>
        <title>Hub Projets - Workshops</title>
      </Head>

      <AppHeader />

      <main className="flex-1 container mx-auto px-4 py-8 max-w-7xl">
        <PageHead
          title="Mes workshops"
          actions={
            <Button variant="primary" as="a" href="/submit-workshop">
              Soumettre un nouveau workshop
            </Button>
          }
        />

        <FilterChips
          className="mb-6"
          options={FILTER_OPTIONS}
          value={filter}
          onChange={setFilter}
        />

        {apiLoading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} variant="rect" height={160} />)}
          </div>
        ) : filteredWorkshops.length === 0 ? (
          <EmptyState
            title="Aucun workshop à afficher"
            sub={emptySubMessage}
            action={
              filter === "all" ? (
                <Button variant="primary" as="a" href="/submit-workshop">
                  Soumettre mon premier workshop
                </Button>
              ) : undefined
            }
          />
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

      <Footer />
    </div>
  );
}
