import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import AppHeader from '../../../components/layout/AppHeader';
import Footer from '../../../components/layout/Footer';
import Card from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import Badge from '../../../components/ui/Badge';
import Input from '../../../components/ui/Input';
import FormField from '../../../components/ui/FormField';
import Skeleton from '../../../components/ui/Skeleton';
import { useAuth } from '../../../context/AuthContext';
import { useApi } from '../../../hooks/useApi';

export default function ScanPage() {
  const router = useRouter();
  const { id } = router.query;
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { get, post, loading: apiLoading } = useApi();

  const [tool, setTool] = useState(null);
  const [error, setError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [showReportForm, setShowReportForm]   = useState(false);
  const [reportCategory, setReportCategory]   = useState('');
  const [reportMessage, setReportMessage]     = useState('');
  const [reportLoading, setReportLoading]     = useState(false);
  const [reportSuccess, setReportSuccess]     = useState('');
  const [reportError, setReportError]         = useState('');

  // Redirect to Microsoft auth, storing current path in localStorage so we
  // can return here after login regardless of OAuth state round-trip reliability.
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      const returnPath = router.asPath;
      localStorage.setItem('postLoginRedirect', returnPath);
      window.location.href = `${process.env.NEXT_PUBLIC_API_URL}/api/auth/microsoft`;
    }
  }, [isAuthenticated, authLoading]);

  useEffect(() => {
    if (isAuthenticated && id) fetchToolData(id);
  }, [isAuthenticated, id]);

  const fetchToolData = async (toolId) => {
    try {
      const res = await get(`/api/tools/${toolId}`);
      setTool(res.data);
    } catch (err) {
      setError('Outil introuvable ou erreur de chargement.');
    }
  };

  const handleBorrow = async () => {
    setError('');
    setActionSuccess('');
    try {
      await post(`/api/tools/${id}/borrow`, { quantity });
      setActionSuccess(`${quantity} exemplaire(s) emprunté(s) avec succès !`);
      fetchToolData(id);
      setQuantity(1);
    } catch (err) {
      setError(err.message || "Erreur lors de l'emprunt");
    }
  };

  const handleReturn = async () => {
    setError('');
    setActionSuccess('');
    try {
      await post(`/api/tools/${id}/return`, { quantity });
      setActionSuccess(`${quantity} exemplaire(s) rendu(s) avec succès !`);
      fetchToolData(id);
      setQuantity(1);
    } catch (err) {
      setError(err.message || 'Erreur lors du retour');
    }
  };

  const handleReport = async () => {
    if (!reportCategory) return;
    setReportLoading(true);
    setReportError('');
    try {
      const body = { category: reportCategory };
      if (reportMessage.trim()) body.message = reportMessage.trim();
      await post(`/api/tools/${id}/report`, body);
      setReportSuccess('Signalement envoyé, merci !');
      setShowReportForm(false);
      setReportCategory('');
      setReportMessage('');
    } catch (err) {
      setReportError(err.message || 'Erreur lors du signalement');
    } finally {
      setReportLoading(false);
    }
  };

  if (authLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col bg-bg">
        <AppHeader />
        <main className="flex-1 container mx-auto px-4 py-8 max-w-lg text-center text-text-muted">
          Redirection vers l'authentification...
        </main>
        <Footer />
      </div>
    );
  }

  if (apiLoading && !tool && !error) {
    return (
      <div className="min-h-screen flex flex-col bg-bg">
        <AppHeader />
        <main className="flex-1 container mx-auto px-4 py-8 max-w-lg">
          <Skeleton variant="rect" height={400} className="mt-10" />
        </main>
        <Footer />
      </div>
    );
  }

  if (error && !tool) {
    return (
      <div className="min-h-screen flex flex-col bg-bg">
        <AppHeader />
        <main className="flex-1 container mx-auto px-4 py-8 max-w-lg">
          <p className="text-center text-danger">{error}</p>
        </main>
        <Footer />
      </div>
    );
  }

  if (!tool) return null;

  const availableQuantity = tool.quantity - tool.borrowedCount;
  const isMaintenance = tool.status === 'maintenance';

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <Head>
        <title>Scan - {tool.name}</title>
      </Head>
      <AppHeader />

      <main className="flex-1 container mx-auto px-4 py-8 max-w-lg">
        <Card className="mt-10">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-text">{tool.name}</h1>
            {tool.tags && tool.tags.length > 0 && (
              <div className="flex justify-center flex-wrap gap-2 mt-3">
                {tool.tags.map((tag) => (
                  <Badge key={tag} variant="neutral" size="sm">{tag}</Badge>
                ))}
              </div>
            )}
          </div>

          <p className="text-text-muted text-center mb-6">{tool.description}</p>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-surface-2 rounded-lg p-4 text-center">
              <span className="block text-sm text-text-muted mb-1">Stock disponible</span>
              <span className="block text-2xl font-bold text-text">{availableQuantity}</span>
            </div>
            <div className="bg-surface-2 rounded-lg p-4 text-center">
              <span className="block text-sm text-text-muted mb-1">Limite / utilisateur</span>
              <span className="block text-2xl font-bold text-text">{tool.maxBorrowPerUser || '∞'}</span>
            </div>
            {tool.currentUserBorrowCount > 0 && (
              <div
                className="col-span-2 rounded-lg p-4 text-center border"
                style={{
                  backgroundColor: 'rgb(var(--primary-ghost))',
                  borderColor: 'rgb(var(--primary-border))',
                }}
              >
                <span className="block text-sm font-semibold mb-1 text-primary">Votre emprunt actuel</span>
                <span className="block text-3xl font-extrabold text-primary">{tool.currentUserBorrowCount}</span>
                {tool.maxBorrowPerUser && (
                  <span className="block text-xs text-primary opacity-75 mt-2">
                    Capacité d'emprunt restante : {tool.maxBorrowPerUser - tool.currentUserBorrowCount}
                  </span>
                )}
              </div>
            )}
          </div>

          {error && (
            <div className="mb-4 rounded-md border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger text-center">
              {error}
            </div>
          )}
          {actionSuccess && (
            <div
              className="mb-4 rounded-md border px-4 py-3 text-sm text-center"
              style={{
                backgroundColor: 'rgb(var(--status-approved-bg))',
                borderColor: 'rgb(var(--status-approved-text))',
                color: 'rgb(var(--status-approved-text))',
              }}
            >
              {actionSuccess}
            </div>
          )}

          {isMaintenance ? (
            <div className="rounded-md border border-danger/40 bg-danger/10 p-4 text-center text-danger">
              Cet outil est en maintenance et ne peut pas être emprunté.
            </div>
          ) : (
            <div className="space-y-4">
              <FormField label="Quantité">
                <Input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 1)}
                />
              </FormField>

              <div className="flex gap-4 pt-2">
                <Button
                  variant="primary"
                  className="flex-1 justify-center"
                  onClick={handleBorrow}
                  disabled={availableQuantity === 0}
                >
                  Emprunter
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 justify-center"
                  onClick={handleReturn}
                >
                  Rendre
                </Button>
              </div>
            </div>
          )}

          {/* ── Signalement de problème ──────────────────────────── */}
          <div className="mt-6 pt-4 border-t border-border">
            {reportSuccess && (
              <div
                className="mb-3 rounded-md border px-4 py-3 text-sm text-center"
                style={{
                  backgroundColor: 'rgb(var(--status-approved-bg))',
                  borderColor: 'rgb(var(--status-approved-text))',
                  color: 'rgb(var(--status-approved-text))',
                }}
              >
                {reportSuccess}
              </div>
            )}

            {!showReportForm && !reportSuccess && (
              <button
                type="button"
                onClick={() => { setShowReportForm(true); setReportError(''); }}
                className="w-full text-sm text-text-muted hover:text-danger transition-colors text-center py-2"
              >
                Signaler un problème
              </button>
            )}

            {showReportForm && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-text">Signaler un problème</p>

                <select
                  value={reportCategory}
                  onChange={(e) => setReportCategory(e.target.value)}
                  className="w-full border border-border rounded-md px-3 py-2 text-sm bg-surface text-text focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="" disabled>Choisir une catégorie...</option>
                  <option value="broken">Cassé / Endommagé</option>
                  <option value="missing">Manquant / Introuvable</option>
                  <option value="incomplete">Incomplet — pièces manquantes</option>
                  <option value="defective">Défectueux — fonctionne mais problème</option>
                  <option value="other">Autre</option>
                </select>

                <div>
                  <textarea
                    value={reportMessage}
                    onChange={(e) => setReportMessage(e.target.value.slice(0, 100))}
                    placeholder="Détails supplémentaires (optionnel)..."
                    rows={2}
                    maxLength={100}
                    className="w-full border border-border rounded-md px-3 py-2 text-sm bg-surface text-text resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <p className="text-xs text-text-dim text-right mt-0.5">{reportMessage.length}/100</p>
                </div>

                {reportError && (
                  <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
                    {reportError}
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleReport}
                    disabled={!reportCategory || reportLoading}
                    className="flex-1 py-2 px-4 rounded-md text-sm font-medium bg-danger text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-danger/90 transition-colors"
                  >
                    {reportLoading ? 'Envoi...' : 'Envoyer'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowReportForm(false); setReportCategory(''); setReportMessage(''); setReportError(''); }}
                    className="flex-1 py-2 px-4 rounded-md text-sm font-medium border border-border text-text-muted hover:text-text transition-colors"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}
          </div>
        </Card>
      </main>

      <Footer />
    </div>
  );
}
