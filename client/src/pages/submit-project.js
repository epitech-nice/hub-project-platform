import { useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import AppHeader from '../components/layout/AppHeader';
import Footer from '../components/layout/Footer';
import Skeleton from '../components/ui/Skeleton';
import ProjectForm from '../components/forms/ProjectForm';
import { useAuth } from '../context/AuthContext';

export default function SubmitProject() {
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

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <Head>
        <title>Hub Projets - Soumettre un projet</title>
      </Head>

      <AppHeader />

      <main className="flex-1 container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-text mb-6">Soumettre un nouveau projet</h1>
        <div className="max-w-3xl mx-auto">
          <ProjectForm />
        </div>
      </main>

      <Footer />
    </div>
  );
}
