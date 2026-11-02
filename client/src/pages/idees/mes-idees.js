// pages/idees/mes-idees.js — mes idées (avec mon rôle) et mes invitations en attente
import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { toast } from 'react-toastify';
import AppHeader from '../../components/layout/AppHeader';
import Footer from '../../components/layout/Footer';
import PageHead from '../../components/ui/PageHead';
import Breadcrumb from '../../components/ui/Breadcrumb';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import BentoGrid from '../../components/ui/BentoGrid';
import EmptyState from '../../components/ui/EmptyState';
import Skeleton from '../../components/ui/Skeleton';
import IdeaCard from '../../components/ideas/IdeaCard';
import DeadlineNotice from '../../components/ideas/DeadlineNotice';
import { useAuth } from '../../context/AuthContext';
import { useApi } from '../../hooks/useApi';
import { ROLE_LABELS, errorText, formatDate, isDeadlinePassed } from '../../lib/ideation';

export default function MyIdeas() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const { get, post } = useApi();

  const [ideas, setIdeas] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [settings, setSettings] = useState({ deadlineDate: null });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [acting, setActing] = useState(null);
  const [actionError, setActionError] = useState(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push('/');
  }, [isAuthenticated, authLoading, router]);

  useEffect(() => {
    if (isAuthenticated) fetchAll();
    // get n'est pas mémorisé : volontairement absent des dépendances
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const fetchAll = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [meRes, settingsRes] = await Promise.all([
        get('/api/ideas/me'),
        get('/api/ideas/settings').catch(() => ({ data: { deadlineDate: null } })),
      ]);
      const data = meRes.data || {};
      setIdeas(Array.isArray(data.ideas) ? data.ideas : []);
      setInvitations(Array.isArray(data.invitations) ? data.invitations : []);
      setSettings(settingsRes.data || { deadlineDate: null });
    } catch (err) {
      setLoadError(errorText(err, 'Impossible de charger vos idées'));
    } finally {
      setLoading(false);
    }
  };

  const respond = async (invitation, action) => {
    setActing(`${invitation.ideaId}-${action}`);
    setActionError(null);
    try {
      await post(`/api/ideas/${invitation.ideaId}/invitation/${action}`);
      toast.success(action === 'accept' ? `Vous avez rejoint « ${invitation.title} »` : 'Invitation refusée');
      await fetchAll();
    } catch (err) {
      setActionError(errorText(err));
    } finally {
      setActing(null);
    }
  };

  const goNew = (e) => {
    e.preventDefault();
    router.push('/idees/nouvelle');
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-bg">
        <AppHeader />
        <main className="flex-1 container mx-auto max-w-7xl px-4 py-8">
          <Skeleton variant="text" width="40%" height={32} className="mb-8" />
          <BentoGrid>
            {[1, 2, 3].map((i) => <Skeleton key={i} variant="rect" height={300} />)}
          </BentoGrid>
        </main>
        <Footer />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  const locked = isDeadlinePassed(settings.deadlineDate);

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <Head>
        <title>Hub Projets - Mes idées</title>
      </Head>

      <AppHeader />

      <main className="flex-1 container mx-auto max-w-7xl px-4 py-8">
        <Breadcrumb items={[{ label: 'Idéation', href: '/idees' }, { label: 'Mes idées' }]} />

        <PageHead
          title="Mes idées"
          sub="Les idées dont vous êtes créateur ou membre, et les invitations reçues."
          actions={!locked && <Button as="a" href="/idees/nouvelle" onClick={goNew}>Soumettre une idée</Button>}
        />

        <DeadlineNotice deadlineDate={settings.deadlineDate} className="mb-6" />

        {loadError ? (
          <EmptyState
            title="Vos idées n'ont pas pu être chargées"
            sub={loadError}
            action={<Button variant="outline" onClick={fetchAll}>Réessayer</Button>}
          />
        ) : (
          <div className="flex flex-col gap-10">
            <section aria-labelledby="invitations-title">
              <div className="mb-4 flex items-center gap-2">
                <h2 id="invitations-title" className="text-lg font-bold tracking-tight text-text">Invitations</h2>
                {!loading && invitations.length > 0 && <Badge variant="new" size="sm">{invitations.length}</Badge>}
              </div>

              {actionError && (
                <p role="alert" className="mb-4 rounded-lg border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">
                  {actionError}
                </p>
              )}

              {loading ? (
                <Skeleton variant="rect" height={72} />
              ) : invitations.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border px-4 py-5 text-sm text-text-muted">
                  Aucune invitation en attente.
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {invitations.map((inv) => (
                    <li
                      key={inv.ideaId}
                      className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <Link href={`/idees/${inv.ideaId}`}>
                          <a className="break-words text-base font-semibold text-text hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded">
                            {inv.title}
                          </a>
                        </Link>
                        <p className="text-sm text-text-muted">
                          Invitation de {inv.invitedBy}
                          {inv.invitedAt ? `, le ${formatDate(inv.invitedAt)}` : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button
                          variant="subtle"
                          size="sm"
                          onClick={() => respond(inv, 'decline')}
                          loading={acting === `${inv.ideaId}-decline`}
                          disabled={Boolean(acting) || locked}
                          aria-label={`Refuser l'invitation pour ${inv.title}`}
                        >
                          Refuser
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => respond(inv, 'accept')}
                          loading={acting === `${inv.ideaId}-accept`}
                          disabled={Boolean(acting) || locked}
                          aria-label={`Accepter l'invitation pour ${inv.title}`}
                        >
                          Accepter
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="my-ideas-title">
              <h2 id="my-ideas-title" className="mb-4 text-lg font-bold tracking-tight text-text">Mes groupes</h2>
              {loading ? (
                <BentoGrid>
                  {[1, 2, 3].map((i) => <Skeleton key={i} variant="rect" height={300} />)}
                </BentoGrid>
              ) : ideas.length === 0 ? (
                <EmptyState
                  title="Aucune idée pour l'instant"
                  sub="Soumettez votre idée ou acceptez une invitation pour rejoindre un groupe."
                  action={!locked && <Button as="a" href="/idees/nouvelle" onClick={goNew}>Soumettre une idée</Button>}
                />
              ) : (
                <BentoGrid>
                  {ideas.map((idea) => (
                    <IdeaCard
                      key={idea._id}
                      idea={idea}
                      badges={
                        <>
                          <Badge variant={idea.role === 'creator' ? 'new' : 'neutral'} size="sm">
                            {ROLE_LABELS[idea.role] || 'Membre'}
                          </Badge>
                          {!idea.hasDeck && <Badge variant="rejected" size="sm">Deck manquant : invisible</Badge>}
                        </>
                      }
                    />
                  ))}
                </BentoGrid>
              )}
            </section>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
