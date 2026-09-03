// pages/admin/print/index.js
import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import axios from 'axios';
import { toast } from 'react-toastify';
import AppHeader from '../../../components/layout/AppHeader';
import Footer from '../../../components/layout/Footer';
import PageHead from '../../../components/ui/PageHead';
import Card from '../../../components/ui/Card';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';
import Select from '../../../components/ui/Select';
import Input from '../../../components/ui/Input';
import FormField from '../../../components/ui/FormField';
import EmptyState from '../../../components/ui/EmptyState';
import Skeleton from '../../../components/ui/Skeleton';
import Modal from '../../../components/ui/Modal';
import { useAuth } from '../../../context/AuthContext';
import { useApi } from '../../../hooks/useApi';

const PRINTER_STATUS_LABELS = {
  idle: 'Disponible',
  printing: 'Occupée',
  awaiting_clearance: 'En attente de libération',
  offline: 'Hors ligne',
  error: 'En erreur',
  disabled: 'Désactivée',
};

const PRINTER_STATUS_BADGE_VARIANTS = {
  idle: 'approved',
  printing: 'pending',
  awaiting_clearance: 'changes',
  offline: 'neutral',
  error: 'rejected',
  disabled: 'neutral',
};

const JOB_STATUS_LABELS = {
  queued: 'En attente',
  sent: "Envoyé à l'imprimante",
  printing: 'Impression en cours',
  completed: 'Terminé',
  failed: 'Échec',
  rejected: 'Refusé',
};

const JOB_STATUS_BADGE_VARIANTS = {
  queued: 'pending',
  sent: 'pending',
  printing: 'pending',
  completed: 'approved',
  failed: 'rejected',
  rejected: 'rejected',
};

const REJECTION_REASON_LABELS = {
  not_authorized: 'Email non autorisé',
  printer_busy: 'Imprimante occupée',
  printer_offline: 'Imprimante hors ligne',
  printer_error: 'Imprimante en erreur',
  printer_disabled: 'Imprimante désactivée',
};

export default function AdminPrintPage() {
  const { isAuthenticated, isAdmin, token, loading: authLoading } = useAuth();
  const router = useRouter();
  const { get, post, patch, loading: apiLoading } = useApi();

  const [printers, setPrinters] = useState([]);
  const [whitelist, setWhitelist] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [accessRequests, setAccessRequests] = useState([]);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  // ── Printers ──
  const [newPrinterName, setNewPrinterName] = useState('');
  const [newPrinterModel, setNewPrinterModel] = useState('kobra3');
  const [createdKey, setCreatedKey] = useState(null); // { apiKey, printerName } — shown once, never persisted or refetched
  const [qrModal, setQrModal] = useState(null); // { printerId, printerName, imageUrl }

  // ── Whitelist ──
  const [newEmail, setNewEmail] = useState('');
  const [newEmailNote, setNewEmailNote] = useState('');

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || !isAdmin)) {
      router.push('/');
    }
  }, [isAuthenticated, isAdmin, authLoading, router]);

  useEffect(() => {
    if (isAuthenticated && isAdmin) {
      refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, isAdmin]);

  // Revoke the QR object URL when the modal closes, so we don't leak blob URLs.
  useEffect(() => {
    return () => {
      if (qrModal?.imageUrl) URL.revokeObjectURL(qrModal.imageUrl);
    };
  }, [qrModal]);

  const refresh = async () => {
    try {
      const [printersRes, whitelistRes, jobsRes, accessRequestsRes] = await Promise.all([
        get('/api/print/printers'),
        get('/api/print/whitelist'),
        get('/api/print/jobs'),
        get('/api/print/access-requests'),
      ]);
      setPrinters(printersRes.data);
      setWhitelist(whitelistRes.data);
      setJobs(jobsRes.data);
      setAccessRequests(accessRequestsRes.data);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setHasLoadedOnce(true);
    }
  };

  // ── Printers ──

  const handleCreatePrinter = async (e) => {
    e.preventDefault();
    if (!newPrinterName.trim()) {
      toast.error('Le nom est requis');
      return;
    }
    try {
      const res = await post('/api/print/printers', {
        name: newPrinterName.trim(),
        model: newPrinterModel,
      });
      setCreatedKey({ apiKey: res.data.apiKey, printerName: res.data.printer.name });
      setNewPrinterName('');
      await refresh();
      toast.success('Imprimante créée');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleToggleDisabled = async (printer) => {
    const disabling = printer.status !== 'disabled';
    const note = window.prompt(
      disabling ? `Raison de la désactivation de "${printer.name}" ?` : `Note de réactivation de "${printer.name}" ?`
    );
    if (!note || !note.trim()) return;
    try {
      await patch(`/api/print/printers/${printer._id}/disabled`, { disabled: disabling, note: note.trim() });
      await refresh();
      toast.success(disabling ? 'Imprimante désactivée' : 'Imprimante réactivée');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleRegenerateKey = async (printer) => {
    if (
      !window.confirm(
        `Régénérer la clé API de "${printer.name}" ? L'ancienne clé cessera de fonctionner immédiatement — l'imprimante devra être reconfigurée.`
      )
    ) {
      return;
    }
    try {
      const res = await post(`/api/print/printers/${printer._id}/regenerate-key`, {});
      setCreatedKey({ apiKey: res.data.apiKey, printerName: printer.name });
      toast.success('Nouvelle clé générée');
    } catch (err) {
      toast.error(err.message);
    }
  };

  // The QR endpoint is admin-authenticated and returns a raw PNG, so it can't be a plain <a href>
  // (no Authorization header) or a frontend route (none exists — Task 7 only built the backend
  // endpoint). Fetch it as a blob with the bearer token and show it in a modal instead.
  const handleViewQr = async (printer) => {
    try {
      const res = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/api/print/printers/${printer._id}/qr`,
        { headers: { Authorization: `Bearer ${token}` }, responseType: 'blob' }
      );
      const imageUrl = URL.createObjectURL(res.data);
      setQrModal({ printerId: printer._id, printerName: printer.name, imageUrl });
    } catch (err) {
      toast.error('Impossible de charger le QR code');
    }
  };

  const closeQrModal = () => {
    if (qrModal?.imageUrl) URL.revokeObjectURL(qrModal.imageUrl);
    setQrModal(null);
  };

  // ── Whitelist ──

  const handleWhitelistSubmit = async (e) => {
    e.preventDefault();
    if (!newEmail.trim() || !newEmailNote.trim()) {
      toast.error('Email et note sont requis');
      return;
    }
    try {
      await post('/api/print/whitelist', {
        email: newEmail.trim(),
        authorized: true,
        note: newEmailNote.trim(),
      });
      setNewEmail('');
      setNewEmailNote('');
      await refresh();
      toast.success('Email autorisé');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleRevoke = async (entry) => {
    const note = window.prompt(`Raison de la révocation de ${entry.email} ?`);
    if (!note || !note.trim()) return;
    try {
      await post('/api/print/whitelist', { email: entry.email, authorized: false, note: note.trim() });
      await refresh();
      toast.success('Accès révoqué');
    } catch (err) {
      toast.error(err.message);
    }
  };

  // ── Job log ──

  const printerNameById = Object.fromEntries(printers.map((p) => [p._id, p.name]));

  if (authLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-bg">
        <AppHeader />
        <main className="flex-1 container mx-auto px-4 py-8 max-w-5xl">
          <Skeleton variant="rect" height={400} />
        </main>
        <Footer />
      </div>
    );
  }

  if (!isAuthenticated || !isAdmin) return null;

  const showSkeleton = apiLoading && !hasLoadedOnce;

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <Head>
        <title>Hub Projets - Admin Impression 3D</title>
      </Head>

      <AppHeader />

      <main className="flex-1 container mx-auto px-4 py-8 max-w-5xl">
        <PageHead
          title="Administration — Impression 3D"
          sub="Imprimantes, liste blanche des étudiants autorisés et journal des impressions."
        />

        {/* ── Imprimantes ── */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-text mb-4">Imprimantes</h2>

          <Card className="mb-4">
            <form onSubmit={handleCreatePrinter} className="flex flex-col sm:flex-row gap-3 sm:items-end">
              <div className="flex-1">
                <FormField label="Nom" required>
                  <Input
                    value={newPrinterName}
                    onChange={(e) => setNewPrinterName(e.target.value)}
                    placeholder="Ex: Kobra 3 - Atelier A"
                  />
                </FormField>
              </div>
              <div className="sm:w-48">
                <FormField label="Modèle">
                  <Select value={newPrinterModel} onChange={(e) => setNewPrinterModel(e.target.value)}>
                    <option value="kobra3">Kobra 3</option>
                    <option value="kobra3max">Kobra 3 Max</option>
                  </Select>
                </FormField>
              </div>
              <Button type="submit" loading={apiLoading}>
                Ajouter
              </Button>
            </form>
          </Card>

          {createdKey && (
            <div
              className="rounded-lg border p-4 mb-4 text-sm flex items-start justify-between gap-4"
              style={{
                backgroundColor: 'rgb(var(--status-changes-bg))',
                color: 'rgb(var(--status-changes-text))',
                borderColor: 'rgba(var(--status-changes-text) / 0.3)',
              }}
            >
              <div>
                <p className="font-semibold mb-1">
                  Clé API de « {createdKey.printerName} » — à noter maintenant, elle ne sera plus jamais affichée :
                </p>
                <code className="block bg-black/10 rounded px-2 py-1 mt-1 break-all">{createdKey.apiKey}</code>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setCreatedKey(null)}>
                Fermer
              </Button>
            </div>
          )}

          {showSkeleton ? (
            <div className="grid gap-3">
              <Skeleton variant="rect" height={72} />
              <Skeleton variant="rect" height={72} />
            </div>
          ) : printers.length === 0 ? (
            <EmptyState title="Aucune imprimante" sub="Ajoutez-en une via le formulaire ci-dessus." size="sm" />
          ) : (
            <div className="grid gap-3">
              {printers.map((printer) => (
                <Card key={printer._id} padding="compact">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-text">{printer.name}</p>
                        <Badge variant={PRINTER_STATUS_BADGE_VARIANTS[printer.status] || 'neutral'} size="sm">
                          {PRINTER_STATUS_LABELS[printer.status] || printer.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-text-muted mt-0.5">
                        {printer.model === 'kobra3max' ? 'Kobra 3 Max' : 'Kobra 3'}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 shrink-0">
                      <Button variant="outline" size="sm" onClick={() => handleViewQr(printer)}>
                        QR code
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleRegenerateKey(printer)}>
                        Régénérer la clé
                      </Button>
                      <Button
                        variant={printer.status === 'disabled' ? 'primary' : 'danger'}
                        size="sm"
                        onClick={() => handleToggleDisabled(printer)}
                      >
                        {printer.status === 'disabled' ? 'Réactiver' : 'Désactiver'}
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* ── Demandes d'accès en attente ── */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-text mb-4">Demandes d&apos;accès en attente</h2>

          {showSkeleton ? (
            <Skeleton variant="rect" height={80} />
          ) : accessRequests.length === 0 ? (
            <EmptyState title="Aucune demande en attente" size="sm" />
          ) : (
            <Card padding="none">
              <div className="divide-y divide-border">
                {accessRequests.map((req) => (
                  <div key={req._id} className="flex items-center justify-between gap-4 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text truncate">
                        {req.student.name} ({req.student.email})
                      </p>
                      <p className="text-xs text-text-muted">
                        {new Date(req.requestedAt).toLocaleString('fr-FR')}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setNewEmail(req.student.email)}
                    >
                      Traiter
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </section>

        {/* ── Whitelist ── */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-text mb-4">Liste blanche</h2>

          <Card className="mb-4">
            <form onSubmit={handleWhitelistSubmit} className="flex flex-col sm:flex-row gap-3 sm:items-end">
              <div className="flex-1">
                <FormField label="Email" required hint=" ">
                  <Input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="etudiant@epitech.eu"
                  />
                </FormField>
              </div>
              <div className="flex-1">
                <FormField label="Note" required hint="Justification obligatoire, conservée dans l'historique.">
                  <Input
                    value={newEmailNote}
                    onChange={(e) => setNewEmailNote(e.target.value)}
                    placeholder="Ex: Autorisé pour le projet X"
                  />
                </FormField>
              </div>
              <Button type="submit" loading={apiLoading}>
                Autoriser
              </Button>
            </form>
          </Card>

          {showSkeleton ? (
            <Skeleton variant="rect" height={120} />
          ) : whitelist.length === 0 ? (
            <EmptyState title="Aucune entrée" sub="Autorisez un email via le formulaire ci-dessus." size="sm" />
          ) : (
            <Card padding="none">
              <div className="divide-y divide-border">
                {whitelist.map((entry) => (
                  <div key={entry._id} className="flex items-center justify-between gap-4 px-4 py-3">
                    <span className="text-sm text-text truncate">{entry.email}</span>
                    <div className="flex items-center gap-3 shrink-0">
                      <Badge variant={entry.authorized ? 'approved' : 'rejected'} size="sm">
                        {entry.authorized ? 'Autorisé' : 'Refusé'}
                      </Badge>
                      {entry.authorized && (
                        <Button variant="outline" size="sm" onClick={() => handleRevoke(entry)}>
                          Révoquer
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </section>

        {/* ── Journal des impressions ── */}
        <section>
          <h2 className="text-xl font-semibold text-text mb-4">Journal des impressions</h2>

          {showSkeleton ? (
            <div className="grid gap-2">
              <Skeleton variant="rect" height={56} />
              <Skeleton variant="rect" height={56} />
              <Skeleton variant="rect" height={56} />
            </div>
          ) : jobs.length === 0 ? (
            <EmptyState title="Aucune impression soumise" size="sm" />
          ) : (
            <Card padding="none">
              <div className="divide-y divide-border">
                {jobs.map((job) => (
                  <div key={job._id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text truncate">{job.fileName}</p>
                      <p className="text-xs text-text-muted">
                        {job.student.name} ({job.student.email}) — {printerNameById[job.printer] || 'Imprimante supprimée'}
                        {' — '}
                        {new Date(job.submittedAt).toLocaleString('fr-FR')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={JOB_STATUS_BADGE_VARIANTS[job.status] || 'neutral'} size="sm">
                        {JOB_STATUS_LABELS[job.status] || job.status}
                      </Badge>
                      {job.rejectionReason && (
                        <span className="text-xs text-text-muted">
                          ({REJECTION_REASON_LABELS[job.rejectionReason] || job.rejectionReason})
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </section>
      </main>

      <Modal open={!!qrModal} onClose={closeQrModal} title={qrModal?.printerName || 'QR code'}>
        {qrModal && (
          <div className="text-center">
            <img src={qrModal.imageUrl} alt={`QR code — ${qrModal.printerName}`} className="mx-auto rounded-lg border border-border" />
            <p className="text-xs text-text-muted mt-3">
              À imprimer et coller sur l&apos;imprimante — scanné pour confirmer la libération du plateau.
            </p>
            {qrModal?.printerId && (
              <Link href={`/admin/print/printers/${qrModal.printerId}/qr`}>
                <a className="inline-block mt-4 text-sm font-medium text-primary hover:underline">
                  Ouvrir la page à imprimer
                </a>
              </Link>
            )}
          </div>
        )}
      </Modal>

      <Footer />
    </div>
  );
}
