// pages/print/index.js
import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { toast } from 'react-toastify';
import AppHeader from '../../components/layout/AppHeader';
import Footer from '../../components/layout/Footer';
import PageHead from '../../components/ui/PageHead';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Select from '../../components/ui/Select';
import FileInput from '../../components/ui/FileInput';
import EmptyState from '../../components/ui/EmptyState';
import Skeleton from '../../components/ui/Skeleton';
import { useAuth } from '../../context/AuthContext';
import { useApi } from '../../hooks/useApi';

const STATUS_LABELS = {
  queued: "En attente",
  sent: "Envoyé à l'imprimante",
  printing: 'Impression en cours',
  completed: 'Terminé',
  failed: 'Échec',
  rejected: 'Refusé',
};

const STATUS_BADGE_VARIANTS = {
  queued: 'pending',
  sent: 'pending',
  printing: 'pending',
  completed: 'approved',
  failed: 'rejected',
  rejected: 'rejected',
};

const PRINTER_STATUS_LABELS = {
  idle: 'Disponible',
  printing: 'Occupée',
  awaiting_clearance: 'En attente de libération',
  offline: 'Hors ligne',
  error: 'En erreur',
  disabled: 'Désactivée',
};

export default function PrintPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const { get, post, loading: apiLoading } = useApi();

  const [printers, setPrinters] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [selectedPrinterId, setSelectedPrinterId] = useState('');
  const [file, setFile] = useState(null);
  const [fileInputKey, setFileInputKey] = useState(0);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push('/');
  }, [isAuthenticated, authLoading, router]);

  useEffect(() => {
    if (isAuthenticated) {
      refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const refresh = async () => {
    try {
      const [printersRes, jobsRes] = await Promise.all([
        get('/api/print/printers'),
        get('/api/print/jobs/me'),
      ]);
      setPrinters(printersRes.data);
      setJobs(jobsRes.data);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const selectedPrinter = printers.find((p) => p._id === selectedPrinterId);
  const canSubmit = selectedPrinter?.status === 'idle';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedPrinterId || !file) {
      toast.error('Choisissez une imprimante et un fichier .gcode');
      return;
    }

    const formData = new FormData();
    formData.append('printerId', selectedPrinterId);
    formData.append('file', file);

    try {
      await post('/api/print/jobs', formData);
      toast.success('Impression soumise');
      setFile(null);
      setFileInputKey((k) => k + 1);
      await refresh();
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-bg">
        <AppHeader />
        <main className="flex-1 container mx-auto px-4 py-8 max-w-3xl">
          <Skeleton variant="rect" height={400} />
        </main>
        <Footer />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <Head>
        <title>Hub Projets - Impression 3D</title>
      </Head>

      <AppHeader />

      <main className="flex-1 container mx-auto px-4 py-8 max-w-3xl">
        <PageHead
          title="Impression 3D"
          sub="Soumettez un fichier .gcode à imprimer sur une imprimante disponible."
        />

        <Card className="mb-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block mb-2 font-medium text-text">Imprimante</label>
              <Select
                value={selectedPrinterId}
                onChange={(e) => setSelectedPrinterId(e.target.value)}
              >
                <option value="">— Choisir —</option>
                {printers.map((p) => (
                  <option key={p._id} value={p._id} disabled={p.status !== 'idle'}>
                    {p.name} — {PRINTER_STATUS_LABELS[p.status] || p.status}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="block mb-2 font-medium text-text">Fichier .gcode</label>
              <FileInput key={fileInputKey} accept=".gcode" onChange={setFile} />
            </div>

            <Button type="submit" loading={apiLoading} disabled={!canSubmit}>
              Soumettre l&apos;impression
            </Button>

            {selectedPrinter && !canSubmit && (
              <p className="text-sm text-danger">
                Cette imprimante n&apos;est pas disponible (
                {PRINTER_STATUS_LABELS[selectedPrinter.status] || selectedPrinter.status}).
              </p>
            )}
          </form>
        </Card>

        <h2 className="text-xl font-semibold text-text mb-4">Mes impressions</h2>

        {jobs.length === 0 ? (
          <EmptyState title="Aucune impression pour le moment" size="sm" />
        ) : (
          <div className="space-y-2">
            {jobs.map((job) => (
              <Card key={job._id} padding="compact" className="flex items-center justify-between gap-4">
                <span className="text-text truncate">{job.fileName}</span>
                <Badge variant={STATUS_BADGE_VARIANTS[job.status] || 'neutral'}>
                  {STATUS_LABELS[job.status] || job.status}
                </Badge>
              </Card>
            ))}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
