// pages/print/printers/[id]/confirm-clearance.js
import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { toast } from 'react-toastify';
import AppHeader from '../../../../components/layout/AppHeader';
import Footer from '../../../../components/layout/Footer';
import Card from '../../../../components/ui/Card';
import Button from '../../../../components/ui/Button';
import Skeleton from '../../../../components/ui/Skeleton';
import { useAuth } from '../../../../context/AuthContext';
import { useApi } from '../../../../hooks/useApi';

export default function ConfirmClearancePage() {
  const router = useRouter();
  const { id } = router.query;
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { get, post, loading: apiLoading } = useApi();

  const [printerName, setPrinterName] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (!id || !isAuthenticated) return;
    get('/api/print/printers')
      .then((res) => {
        const printer = res.data.find((p) => p._id === id);
        setPrinterName(printer ? printer.name : '');
      })
      .catch((err) => toast.error(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isAuthenticated]);

  const handleConfirm = async () => {
    try {
      await post(`/api/print/printers/${id}/confirm-clearance`, {});
      setConfirmed(true);
      toast.success("Merci, l'imprimante est de nouveau disponible.");
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-bg">
        <AppHeader />
        <main className="flex-1 container mx-auto px-4 py-8 max-w-md">
          <Skeleton variant="rect" height={220} className="mt-10" />
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <Head>
        <title>Hub Projets - Libération imprimante</title>
      </Head>

      <AppHeader />

      <main className="flex-1 container mx-auto px-4 py-8 max-w-md">
        <Card className="mt-10 text-center">
          {!isAuthenticated ? (
            <>
              <p className="text-text-muted mb-4">
                Connectez-vous pour confirmer la libération de cette imprimante.
              </p>
              <a
                href={`${process.env.NEXT_PUBLIC_API_URL}/api/auth/microsoft?redirectTo=${encodeURIComponent(router.asPath)}`}
                className="inline-block bg-blue-600 text-white px-4 py-2 rounded-lg"
              >
                Se connecter
              </a>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-text mb-4">{printerName || 'Imprimante'}</h1>

              {confirmed ? (
                <p className="font-medium" style={{ color: 'rgb(var(--status-approved-text))' }}>
                  Libération confirmée, merci.
                </p>
              ) : (
                <>
                  <p className="mb-6 font-medium text-text">
                    Vous certifiez que le plateau d&apos;impression est vide. Toute fausse déclaration engage
                    votre responsabilité et pourra entraîner une suspension d&apos;accès aux imprimantes.
                  </p>
                  <Button onClick={handleConfirm} loading={apiLoading} className="w-full justify-center">
                    Je confirme, le plateau est vide
                  </Button>
                </>
              )}
            </>
          )}
        </Card>
      </main>

      <Footer />
    </div>
  );
}
