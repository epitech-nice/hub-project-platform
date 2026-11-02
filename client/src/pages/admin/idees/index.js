// pages/admin/idees/index.js — tableau de bord staff de la Piscine idéation
import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import AppHeader from '../../../components/layout/AppHeader';
import Footer from '../../../components/layout/Footer';
import PageHead from '../../../components/ui/PageHead';
import Breadcrumb from '../../../components/ui/Breadcrumb';
import Tabs from '../../../components/ui/Tabs';
import Skeleton from '../../../components/ui/Skeleton';
import SeasonControls from '../../../components/ideas/admin/SeasonControls';
import SuiviTab from '../../../components/ideas/admin/SuiviTab';
import { useAuth } from '../../../context/AuthContext';

export default function AdminIdeas() {
  const { isAuthenticated, isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  // Incrémenté après une purge : les onglets rechargent leurs données
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || !isAdmin)) router.push('/');
  }, [isAuthenticated, isAdmin, authLoading, router]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-bg">
        <AppHeader />
        <main className="flex-1 container mx-auto max-w-7xl px-4 py-8">
          <Skeleton variant="text" width="40%" height={32} className="mb-8" />
          <Skeleton variant="rect" height={320} />
        </main>
        <Footer />
      </div>
    );
  }

  if (!isAuthenticated || !isAdmin) return null;

  // Onglets : la tâche 14 ajoute « Sans projet » à cette liste
  const tabItems = [
    { id: 'suivi', label: 'Suivi', content: <SuiviTab refreshKey={refreshKey} /> },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <Head>
        <title>Hub Projets - Admin idéation</title>
      </Head>

      <AppHeader />

      <main className="flex-1 container mx-auto max-w-7xl px-4 py-8 min-w-0">
        <Breadcrumb
          items={[
            { label: 'Accueil', href: '/' },
            { label: 'Idéation', href: '/idees' },
            { label: 'Admin' },
          ]}
        />

        <PageHead
          title="Admin idéation"
          sub="Suivi des idées de la Piscine, modération et réglages de la saison."
        />

        <SeasonControls onPurged={() => setRefreshKey((k) => k + 1)} />

        <Tabs defaultValue="suivi" className="mt-8" items={tabItems} />
      </main>

      <Footer />
    </div>
  );
}
