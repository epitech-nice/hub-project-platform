import { useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import AppHeader from '../components/layout/AppHeader';
import Footer from '../components/layout/Footer';
import PageHead from '../components/ui/PageHead';
import Skeleton from '../components/ui/Skeleton';
import WorkshopForm from '../components/forms/WorkshopForm';
import { useAuth } from '../context/AuthContext';

export default function SubmitWorkshop() {
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push('/');
    }
  }, [isAuthenticated, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-bg">
        <AppHeader />
        <main className="flex-1 container mx-auto px-4 py-8 max-w-3xl">
          <Skeleton variant="rect" height={500} />
        </main>
        <Footer />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  const backLink = (
    <button
      onClick={() => router.back()}
      className="text-sm text-text-muted hover:text-primary transition-colors duration-150"
    >
      &larr; Retour
    </button>
  );

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <Head>
        <title>Hub Projets - Soumettre un workshop</title>
      </Head>

      <AppHeader />

      <main className="flex-1 container mx-auto px-4 py-8">
        <PageHead title="Soumettre un workshop" back={backLink} />
        <div className="max-w-3xl mx-auto">
          <WorkshopForm />
        </div>
      </main>

      <Footer />
    </div>
  );
}
