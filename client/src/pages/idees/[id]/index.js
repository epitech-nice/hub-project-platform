// pages/idees/[id]/index.js — fiche d'une idée
import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import AppHeader from '../../../components/layout/AppHeader';
import Footer from '../../../components/layout/Footer';
import Breadcrumb from '../../../components/ui/Breadcrumb';
import Button from '../../../components/ui/Button';
import Badge from '../../../components/ui/Badge';
import Modal from '../../../components/ui/Modal';
import Skeleton from '../../../components/ui/Skeleton';
import ErrorPage from '../../../components/ui/ErrorPage';
import AuthImage from '../../../components/ideas/AuthImage';
import VersionHistory from '../../../components/ideas/VersionHistory';
import LinkList, { PRIVATE_LINK_HELP } from '../../../components/ideas/LinkList';
import { MemberRows } from '../../../components/ideas/MemberManager';
import DeadlineNotice from '../../../components/ideas/DeadlineNotice';
import { useAuth } from '../../../context/AuthContext';
import { useApi } from '../../../hooks/useApi';
import {
  GROUP_MIN,
  ROLE_LABELS,
  errorText,
  formatDate,
  isIdeaLocked,
  withCreatorFlag,
} from '../../../lib/ideation';

function Section({ eyebrow, title, children, aside }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          {eyebrow && <p className="text-xs font-semibold uppercase tracking-wider text-text-dim">{eyebrow}</p>}
          <h2 className="text-lg font-bold tracking-tight text-text">{title}</h2>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

export default function IdeaDetail() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const { id } = router.query;
  const { get, post, delete: deleteRequest } = useApi();

  const [idea, setIdea] = useState(null);
  const [settings, setSettings] = useState({ deadlineDate: null });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [acting, setActing] = useState(null);
  const [confirmLeave, setConfirmLeave] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push('/');
  }, [isAuthenticated, authLoading, router]);

  useEffect(() => {
    if (isAuthenticated && id) fetchAll();
    // get n'est pas mémorisé : volontairement absent des dépendances
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, id]);

  const fetchAll = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [ideaRes, settingsRes] = await Promise.all([
        get(`/api/ideas/${encodeURIComponent(id)}`),
        get('/api/ideas/settings').catch(() => ({ data: { deadlineDate: null } })),
      ]);
      setIdea(ideaRes.data);
      setSettings(settingsRes.data || { deadlineDate: null });
    } catch (err) {
      setIdea(null);
      setLoadError({ status: err.status, message: errorText(err) });
    } finally {
      setLoading(false);
    }
  };

  const respond = async (action) => {
    setActing(action);
    setActionError(null);
    try {
      const res = await post(`/api/ideas/${idea._id}/invitation/${action}`);
      if (action === 'decline') {
        router.push('/idees/mes-idees');
        return;
      }
      setIdea(res.data);
    } catch (err) {
      setActionError(errorText(err));
    } finally {
      setActing(null);
    }
  };

  const leave = async (myUserId) => {
    setActing('leave');
    setActionError(null);
    try {
      await deleteRequest(`/api/ideas/${idea._id}/members/${myUserId}`);
      setConfirmLeave(false);
      router.push('/idees/mes-idees');
    } catch (err) {
      setConfirmLeave(false);
      setActionError(errorText(err));
    } finally {
      setActing(null);
    }
  };

  const shell = (content, title = 'Idée') => (
    <div className="min-h-screen flex flex-col bg-bg">
      <Head>
        <title>{`Hub Projets - ${title}`}</title>
      </Head>
      <AppHeader />
      <main className="flex-1 container mx-auto max-w-6xl px-4 py-8">{content}</main>
      <Footer />
    </div>
  );

  if (authLoading || (isAuthenticated && loading)) {
    return shell(
      <>
        <Skeleton variant="text" width="30%" className="mb-6" />
        <div className="mb-8 flex items-center gap-4">
          <Skeleton variant="rect" width={96} height={96} />
          <div className="flex-1 space-y-3">
            <Skeleton variant="text" width="60%" height={28} />
            <Skeleton variant="text" width="40%" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Skeleton variant="rect" height={260} className="lg:col-span-2" />
          <Skeleton variant="rect" height={260} />
        </div>
      </>
    );
  }

  if (!isAuthenticated) return null;

  if (loadError || !idea) {
    const notFound = !loadError || loadError.status === 404;
    return shell(
      <ErrorPage
        code={notFound ? '404' : 'Erreur'}
        title={notFound ? 'Idée introuvable' : "L'idée n'a pas pu être chargée"}
        sub={notFound ? "Cette idée n'existe pas, a été retirée ou n'est pas encore visible." : loadError.message}
        action={
          <Link href="/idees" passHref>
            <Button as="a" variant="outline">Retour au catalogue</Button>
          </Link>
        }
      />,
      'Idée introuvable'
    );
  }

  const role = idea.myRole;
  const canEdit = role === 'creator' || role === 'member';
  // Date limite passée, sauf déblocage staff de cette idée ; le serveur reste l'autorité
  const locked = isIdeaLocked(settings.deadlineDate, idea);
  const members = withCreatorFlag(idea);
  const accepted = members.filter((m) => m.status === 'accepted').length;
  const myEntry = members.find((m) => m.userId && m.status === 'accepted' && !m.isCreator);
  const hasDeck = Boolean(idea.deck && idea.deck.current);
  const logoVersion = idea.logo && idea.logo.current ? idea.logo.current.number : 0;
  const hasLogoVersions = idea.logo && idea.logo.versions && idea.logo.versions.length > 0;

  return shell(
    <>
      <Breadcrumb items={[{ label: 'Idéation', href: '/idees' }, { label: idea.title }]} />

      {/* En-tête */}
      <header className="mt-6 mb-8 flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-border">
          <AuthImage ideaId={idea._id} hasLogo={hasLogoVersions} title={idea.title} version={logoVersion} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {role && ROLE_LABELS[role] && <Badge variant="new" size="sm">{ROLE_LABELS[role]}</Badge>}
            {idea.incomplete && <Badge variant="changes" size="sm">Groupe incomplet</Badge>}
            {idea.hidden && <Badge variant="rejected" size="sm">Masquée</Badge>}
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-text break-words sm:text-3xl">{idea.title}</h1>
          <p className="mt-1 text-sm text-text-muted">
            Proposée par {idea.creator && idea.creator.name} · {formatDate(idea.createdAt)}
          </p>
          <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Hashtags">
            {(idea.hashtags || []).map((tag) => (
              <li key={tag}>
                <Link href={`/idees?tags=${encodeURIComponent(tag)}`}>
                  <a className="inline-block rounded-md border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs text-text-muted hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
                    #{tag}
                  </a>
                </Link>
              </li>
            ))}
          </ul>
        </div>
        {canEdit && (
          <div className="shrink-0">
            {locked ? (
              <Button variant="outline" disabled>Modifier</Button>
            ) : (
              <Link href={`/idees/${idea._id}/modifier`} passHref>
                <Button as="a">Modifier</Button>
              </Link>
            )}
          </div>
        )}
      </header>

      <DeadlineNotice deadlineDate={settings.deadlineDate} idea={idea} className="mb-6" />

      {/* Invitation en attente */}
      {role === 'pending' && (
        <div className="mb-6 flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm">
            <p className="font-semibold text-text">Vous êtes invité à rejoindre ce groupe.</p>
            <p className="text-text-muted">En acceptant, vous pourrez modifier l&apos;idée, déposer des fichiers et des liens.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="subtle" onClick={() => respond('decline')} loading={acting === 'decline'} disabled={Boolean(acting) || locked}>
              Refuser
            </Button>
            <Button onClick={() => respond('accept')} loading={acting === 'accept'} disabled={Boolean(acting) || locked}>
              Accepter
            </Button>
          </div>
        </div>
      )}

      {actionError && (
        <p role="alert" className="mb-6 rounded-lg border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">
          {actionError}
        </p>
      )}

      {canEdit && !hasDeck && (
        <p role="status" className="mb-6 rounded-lg border px-4 py-3 text-sm" style={{
          backgroundColor: 'rgb(var(--status-changes-bg))',
          borderColor: 'rgb(var(--status-changes-text) / 0.35)',
          color: 'rgb(var(--status-changes-text))',
        }}>
          Aucun deck déposé : l&apos;idée n&apos;apparaît pas dans le catalogue tant qu&apos;il manque.
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          <Section eyebrow="Pitch" title="Description">
            <p className="whitespace-pre-line break-words text-base leading-relaxed text-text">{idea.description}</p>
          </Section>

          <Section eyebrow="Semaine 1" title="Deck">
            <VersionHistory ideaId={idea._id} kind="deck" file={idea.deck} emptyText="Aucun deck déposé." />
          </Section>

          <Section eyebrow="Start-up Day" title="Documents du jour 2">
            <p className="mb-4 text-xs text-text-dim">{PRIVATE_LINK_HELP}</p>
            <LinkList ideaId={idea._id} links={idea.day2Links || []} />
          </Section>

          {hasLogoVersions && (
            <Section eyebrow="Identité" title="Logo">
              <VersionHistory ideaId={idea._id} kind="logo" file={idea.logo} />
            </Section>
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          <Section
            eyebrow="Groupe"
            title={`${accepted} membre${accepted > 1 ? 's' : ''}`}
            aside={idea.incomplete ? <Badge variant="changes" size="sm">Incomplet</Badge> : <Badge variant="approved" size="sm">Complet</Badge>}
          >
            <MemberRows members={members} />
            {idea.incomplete && (
              <p className="mt-3 text-xs text-text-dim">
                Groupe incomplet : moins de {GROUP_MIN} membres ont accepté.
              </p>
            )}
            {role === 'member' && myEntry && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-4"
                disabled={locked || Boolean(acting)}
                onClick={() => setConfirmLeave(true)}
              >
                Quitter le groupe
              </Button>
            )}
          </Section>

          <p className="text-xs text-text-dim">Dernière modification : {formatDate(idea.updatedAt, true)}</p>
        </aside>
      </div>

      <Modal
        open={confirmLeave}
        onClose={() => acting !== 'leave' && setConfirmLeave(false)}
        title="Quitter le groupe ?"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="subtle" onClick={() => setConfirmLeave(false)} disabled={acting === 'leave'}>Annuler</Button>
            <Button variant="danger" onClick={() => myEntry && leave(myEntry.userId)} loading={acting === 'leave'}>Quitter</Button>
          </div>
        }
      >
        <p className="text-sm text-text-muted">
          Vous ne pourrez plus modifier cette idée. Le créateur devra vous réinviter pour revenir.
        </p>
      </Modal>
    </>,
    idea.title
  );
}
