// pages/simulated/mes-projets.js
import { useEffect, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import AppHeader from "../../components/layout/AppHeader";
import Footer from "../../components/layout/Footer";
import PageHead from "../../components/ui/PageHead";
import FilterChips from "../../components/ui/FilterChips";
import EmptyState from "../../components/ui/EmptyState";
import Skeleton from "../../components/ui/Skeleton";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import Card from "../../components/ui/Card";
import StatusBadge from "../../components/domain/StatusBadge";
import { useAuth } from "../../context/AuthContext";
import { useApi } from "../../hooks/useApi";

const FILTER_OPTIONS = [
  { value: 'all',             label: 'Tous' },
  { value: 'pending',         label: 'En attente' },
  { value: 'pending_changes', label: 'Modifs requises' },
  { value: 'approved',        label: 'Approuvés' },
  { value: 'completed',       label: 'Terminés' },
  { value: 'rejected',        label: 'Refusés' },
];

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
    return (
      <div className="min-h-screen flex flex-col bg-bg">
        <AppHeader />
        <main className="flex-1 container mx-auto px-4 py-8 max-w-7xl">
          <Skeleton variant="text" width="40%" height={32} className="mb-6" />
          <div className="grid gap-4">
            {[1, 2, 3].map((i) => <Skeleton key={i} variant="rect" height={80} />)}
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  const emptySubMessage =
    filter === "all"
      ? "Vous n'avez encore participé à aucun projet Simulated."
      : "Aucun projet dans cette catégorie.";

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <Head>
        <title>Hub Projets - Mes projets Simulated</title>
      </Head>

      <AppHeader />

      <main className="flex-1 container mx-auto px-4 py-8 max-w-7xl">
        <PageHead
          title="Mes projets Simulated"
          actions={
            <Button variant="primary" as="a" href="/simulated">
              Choisir un projet
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
          <div className="grid gap-4">
            {[1, 2, 3].map((i) => <Skeleton key={i} variant="rect" height={80} />)}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title="Aucun projet"
            sub={emptySubMessage}
            action={
              filter === "all" ? (
                <Button variant="primary" as="a" href="/simulated">
                  Choisir mon premier projet
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid gap-4">
            {filtered.map((enrollment) => (
              <Card
                key={enrollment._id}
                interactive
                onClick={() => router.push(`/simulated/${enrollment.simulatedProject.projectId}`)}
              >
                <div className="flex justify-between items-start gap-4 flex-wrap">
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-text truncate">
                      {enrollment.simulatedProject.title}
                    </h2>
                    <p className="text-sm text-text-muted mt-0.5">
                      Cycle n°{enrollment.cycleNumber}
                      {enrollment.isDoubleCycle && (
                        <Badge variant="neutral" size="sm" className="ml-2">Double cycle</Badge>
                      )}
                      {enrollment.startDate && enrollment.defenseDate && (
                        <span className="ml-2">
                          · du {new Date(enrollment.startDate).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" })} au {new Date(enrollment.defenseDate).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                        </span>
                      )}
                    </p>
                    {enrollment.submissionDeadline && (
                      <p className="text-xs text-text-dim mt-0.5">
                        Deadline dépôt : {new Date(enrollment.submissionDeadline).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                      </p>
                    )}
                    {enrollment.githubProjectLink && (
                      <p className="text-xs text-text-dim mt-1 truncate max-w-md">
                        {enrollment.githubProjectLink}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {enrollment.totalCredits > 0 && (
                      <span
                        className="text-sm font-semibold"
                        style={{ color: 'rgb(var(--status-approved-text))' }}
                      >
                        {enrollment.totalCredits} crédit{enrollment.totalCredits !== 1 ? "s" : ""}
                        {enrollment.status === "completed" && " au total"}
                      </span>
                    )}
                    <StatusBadge status={enrollment.status} />
                  </div>
                </div>

                {enrollment.reviewedBy?.comments && enrollment.status === "pending_changes" && (
                  <div
                    className="mt-3 p-3 border-l-4 rounded text-sm"
                    style={{
                      backgroundColor: 'rgb(var(--status-changes-bg))',
                      borderLeftColor: 'rgb(var(--status-changes-text))',
                      color: 'rgb(var(--status-changes-text))',
                    }}
                  >
                    {enrollment.reviewedBy.comments}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
