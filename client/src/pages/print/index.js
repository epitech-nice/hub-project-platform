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
import Modal from '../../components/ui/Modal';
import { useAuth } from '../../context/AuthContext';
import { useApi } from '../../hooks/useApi';

const STATUS_LABELS = {
  queued: "En attente",
  sent: "Envoyé à l'imprimante",
  printing: 'Impression en cours',
  completed: 'Terminé',
  failed: 'Échec',
  rejected: 'Refusé',
  cancelled: 'Annulé',
};

const STATUS_BADGE_VARIANTS = {
  queued: 'pending',
  sent: 'pending',
  printing: 'pending',
  completed: 'approved',
  failed: 'rejected',
  rejected: 'rejected',
  cancelled: 'neutral',
};

const CANCELLABLE_STATUSES = ['queued', 'sent', 'printing'];

const PRINTER_STATUS_LABELS = {
  idle: 'Disponible',
  printing: 'Occupée',
  awaiting_clearance: 'En attente de libération',
  offline: 'Hors ligne',
  error: 'En erreur',
  disabled: 'Désactivée',
};

const GATE_LABELS = ['Slot 1', 'Slot 2', 'Slot 3', 'Slot 4'];

export default function PrintPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const { get, post } = useApi();

  const [printers, setPrinters] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [selectedPrinterId, setSelectedPrinterId] = useState('');
  const [file, setFile] = useState(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [accessStatus, setAccessStatus] = useState(null);
  const [requestingAccess, setRequestingAccess] = useState(false);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [pendingUpload, setPendingUpload] = useState(null);
  const [selectedGate, setSelectedGate] = useState('');
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [confirming, setConfirming] = useState(false);

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
      const [printersRes, jobsRes, accessRes] = await Promise.all([
        get('/api/print/printers'),
        get('/api/print/jobs/me'),
        get('/api/print/whitelist/me'),
      ]);
      setPrinters(printersRes.data);
      setJobs(jobsRes.data);
      setAccessStatus(accessRes.data);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleRequestAccess = async () => {
    setRequestingAccess(true);
    try {
      await post('/api/print/access-requests', {});
      toast.success('Demande envoyée');
      await refresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRequestingAccess(false);
    }
  };

  const selectedPrinter = printers.find((p) => p._id === selectedPrinterId);
  const canSubmit = selectedPrinter?.status === 'idle';

  const handleAnalyze = async (e) => {
    e.preventDefault();
    if (!selectedPrinterId || !file) {
      toast.error('Choisissez une imprimante et un fichier .gcode');
      return;
    }

    const formData = new FormData();
    formData.append('printerId', selectedPrinterId);
    formData.append('file', file);

    setAnalyzing(true);
    try {
      const res = await post('/api/print/jobs/analyze', formData);
      setPendingUpload(res.data);
      setSelectedGate('');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const resetPendingUpload = () => {
    setPendingUpload(null);
    setSelectedGate('');
    setFile(null);
    setFileInputKey((k) => k + 1);
  };

  const confirmPendingUpload = async (body) => {
    if (!pendingUpload) return;
    setConfirming(true);
    try {
      await post(`/api/print/jobs/${pendingUpload.pendingUploadId}/confirm`, body);
      toast.success('Impression soumise');
      resetPendingUpload();
      setShowOverrideModal(false);
      await refresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setConfirming(false);
    }
  };

  const handleConfirm = () => {
    if (pendingUpload.mode === 'single') {
      if (selectedGate === '') {
        toast.error('Choisissez un slot');
        return;
      }
      confirmPendingUpload({ selectedGate: Number(selectedGate) });
      return;
    }
    confirmPendingUpload({});
  };

  const handleConfirmOverride = () => confirmPendingUpload({ overrideNoSpoolData: true });

  const handleCancelJob = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      // Un job 'queued' est annulé synchroniquement (200, déjà 'cancelled') ; un job
      // 'sent'/'printing' ne fait que demander l'annulation (202, toujours en cours).
      const wasQueued = cancelTarget.status === 'queued';
      await post(`/api/print/jobs/${cancelTarget._id}/cancel`, {});
      toast.success(wasQueued ? 'Impression annulée' : 'Annulation demandée');
      setCancelTarget(null);
      await refresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCancelling(false);
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

        {accessStatus?.authorized === false && (
          <Card className="mb-8 border-danger/40 bg-danger/10">
            <p className="text-danger font-medium">
              Vous n&apos;êtes pas autorisé à utiliser l&apos;impression 3D. Contactez un administrateur si vous
              pensez qu&apos;il s&apos;agit d&apos;une erreur.
            </p>
          </Card>
        )}

        {accessStatus?.authorized === null && (
          <Card className="mb-8">
            {accessStatus.hasPendingRequest ? (
              <p className="text-text-muted">
                Demande envoyée, en attente de validation par un administrateur.
              </p>
            ) : (
              <div className="flex items-center justify-between gap-4">
                <p className="text-text-muted">
                  Vous n&apos;êtes pas encore autorisé à utiliser l&apos;impression 3D.
                </p>
                <Button onClick={handleRequestAccess} loading={requestingAccess}>
                  Demander l&apos;accès
                </Button>
              </div>
            )}
          </Card>
        )}

        {accessStatus?.authorized === true && (
          <Card className="mb-8">
            {!pendingUpload ? (
              <form onSubmit={handleAnalyze} className="space-y-4">
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

                <Button type="submit" loading={analyzing} disabled={!canSubmit}>
                  Analyser le fichier
                </Button>

                {selectedPrinter && !canSubmit && (
                  <p className="text-sm text-danger">
                    Cette imprimante n&apos;est pas disponible (
                    {PRINTER_STATUS_LABELS[selectedPrinter.status] || selectedPrinter.status}).
                  </p>
                )}
              </form>
            ) : pendingUpload.mode === 'single' ? (
              <div className="space-y-4">
                <p className="text-sm text-text-muted">
                  Fichier mono-matériau — choisissez la bobine à utiliser.
                </p>

                {!pendingUpload.spoolSlotsUpdatedAt ? (
                  <div>
                    <p className="text-sm text-danger">
                      Données bobines indisponibles pour cette imprimante — impossible de savoir ce qui est
                      chargé dans chaque slot.
                    </p>
                    <Button
                      variant="danger"
                      size="sm"
                      className="mt-3"
                      onClick={() => setShowOverrideModal(true)}
                    >
                      Soumettre quand même
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Select value={selectedGate} onChange={(e) => setSelectedGate(e.target.value)}>
                      <option value="">— Choisir un slot —</option>
                      {pendingUpload.slots.map((slot) => (
                        <option key={slot.gate} value={slot.gate} disabled={slot.empty}>
                          {GATE_LABELS[slot.gate] || `Slot ${slot.gate + 1}`} —{' '}
                          {slot.empty ? 'Vide' : slot.material || 'Matière inconnue'}
                        </option>
                      ))}
                    </Select>
                    {pendingUpload.slots.length > 0 && pendingUpload.slots.every((s) => s.empty) && (
                      <p className="text-sm text-danger">
                        Toutes les bobines sont signalées vides — vérifiez physiquement l&apos;imprimante.
                      </p>
                    )}
                  </div>
                )}

                <div className="flex gap-3">
                  <Button variant="subtle" onClick={resetPendingUpload} disabled={confirming}>
                    Retour
                  </Button>
                  {pendingUpload.spoolSlotsUpdatedAt && (
                    <Button onClick={handleConfirm} loading={confirming} disabled={confirming}>
                      Confirmer et soumettre
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-text-muted">
                  Fichier multi-couleur — comparaison avec le contenu actuel des slots.
                </p>

                <div className="space-y-2">
                  {pendingUpload.expectedTools.map((tool) => {
                    const mismatch = pendingUpload.mismatches.find((m) => m.tool === tool.tool);
                    const unverifiable = !tool.material && !tool.color;
                    return (
                      <div
                        key={tool.tool}
                        className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
                      >
                        <span className="font-medium text-text">{tool.tool}</span>
                        <span className="text-text-muted">
                          Attendu : {tool.material || '?'}
                          {tool.color && (
                            <span
                              className="inline-block h-3 w-3 rounded-full align-middle ml-2 border border-border"
                              style={{ backgroundColor: `#${tool.color.replace('#', '')}` }}
                            />
                          )}
                        </span>
                        {unverifiable ? (
                          <Badge variant="neutral" size="sm">
                            Non vérifiable
                          </Badge>
                        ) : (
                          <Badge variant={mismatch ? 'rejected' : 'approved'} size="sm">
                            {mismatch ? `Chargé : ${mismatch.actualMaterial || 'inconnu'}` : 'OK'}
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="flex gap-3">
                  <Button variant="subtle" onClick={resetPendingUpload} disabled={confirming}>
                    Retour
                  </Button>
                  <Button onClick={handleConfirm} loading={confirming} disabled={confirming}>
                    Confirmer et soumettre
                  </Button>
                </div>
              </div>
            )}
          </Card>
        )}

        <h2 className="text-xl font-semibold text-text mb-4">Mes impressions</h2>

        {jobs.length === 0 ? (
          <EmptyState title="Aucune impression pour le moment" size="sm" />
        ) : (
          <div className="space-y-2">
            {jobs.map((job) => (
              <Card key={job._id} padding="compact" className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-text truncate">{job.fileName}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={STATUS_BADGE_VARIANTS[job.status] || 'neutral'}>
                      {STATUS_LABELS[job.status] || job.status}
                    </Badge>
                    {CANCELLABLE_STATUSES.includes(job.status) &&
                      (job.cancelRequestedAt ? (
                        <span className="text-xs text-text-muted">Annulation en cours...</span>
                      ) : (
                        <Button variant="danger" size="sm" onClick={() => setCancelTarget(job)}>
                          Annuler
                        </Button>
                      ))}
                  </div>
                </div>
                {job.status === 'failed' && job.errorMessage && (
                  <p className="text-sm text-danger break-words">{job.errorMessage}</p>
                )}
              </Card>
            ))}
          </div>
        )}

        <Modal
          open={!!cancelTarget}
          onClose={() => setCancelTarget(null)}
          title="Annuler cette impression ?"
          footer={
            <div className="flex justify-end gap-3">
              <Button variant="subtle" onClick={() => setCancelTarget(null)} disabled={cancelling}>
                Retour
              </Button>
              <Button variant="danger" onClick={handleCancelJob} loading={cancelling} disabled={cancelling}>
                Annuler l&apos;impression
              </Button>
            </div>
          }
        >
          <p className="text-sm text-text">
            Cette action est irréversible.{' '}
            {cancelTarget && ['sent', 'printing'].includes(cancelTarget.status)
              ? "L'impression est peut-être déjà en cours : elle s'arrêtera au prochain contact avec l'imprimante (jusqu'à 60 secondes), et le plateau devra être vérifié physiquement avant la prochaine impression."
              : "Le job n'a pas encore démarré, l'imprimante sera immédiatement libérée."}
          </p>
        </Modal>

        <Modal
          open={showOverrideModal}
          onClose={() => setShowOverrideModal(false)}
          title="Soumettre sans données bobines ?"
          footer={
            <div className="flex justify-end gap-3">
              <Button variant="subtle" onClick={() => setShowOverrideModal(false)} disabled={confirming}>
                Retour
              </Button>
              <Button variant="danger" onClick={handleConfirmOverride} loading={confirming} disabled={confirming}>
                Soumettre quand même
              </Button>
            </div>
          }
        >
          <p className="text-sm text-text">
            Aucune bobine ne sera sélectionnée automatiquement — le comportement dépendra entièrement du
            fichier gcode tel quel. Vérifiez physiquement l&apos;imprimante avant de continuer si vous n&apos;êtes
            pas sûr·e de ce qui est chargé.
          </p>
        </Modal>
      </main>

      <Footer />
    </div>
  );
}
