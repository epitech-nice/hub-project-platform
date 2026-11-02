// pages/idees/[id]/modifier.js — modification d'une idée par les membres acceptés
import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { toast } from 'react-toastify';
import AppHeader from '../../../components/layout/AppHeader';
import Footer from '../../../components/layout/Footer';
import Breadcrumb from '../../../components/ui/Breadcrumb';
import PageHead from '../../../components/ui/PageHead';
import Button from '../../../components/ui/Button';
import Skeleton from '../../../components/ui/Skeleton';
import ErrorPage from '../../../components/ui/ErrorPage';
import IdeaFields, { checkIdeaFields } from '../../../components/ideas/IdeaFields';
import IdeaFileField from '../../../components/ideas/IdeaFileField';
import VersionHistory from '../../../components/ideas/VersionHistory';
import LinkList from '../../../components/ideas/LinkList';
import MemberManager, { MemberRows } from '../../../components/ideas/MemberManager';
import DeadlineNotice from '../../../components/ideas/DeadlineNotice';
import { useAuth } from '../../../context/AuthContext';
import { useApi } from '../../../hooks/useApi';
import { checkFile, errorText, isIdeaLocked, withCreatorFlag } from '../../../lib/ideation';

function Section({ id, eyebrow, title, sub, children }) {
  return (
    <section aria-labelledby={id} className="rounded-xl border border-border bg-surface p-5 sm:p-6">
      <div className="mb-5">
        {eyebrow && <p className="text-xs font-semibold uppercase tracking-wider text-text-dim">{eyebrow}</p>}
        <h2 id={id} className="text-lg font-bold tracking-tight text-text">{title}</h2>
        {sub && <p className="mt-1 text-sm text-text-muted">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

// Dépôt d'une nouvelle version (logo ou deck) avec historique
function FileVersionPanel({ idea, kind, label, disabled, onUpdated }) {
  const { post } = useApi();
  const [file, setFile] = useState(null);
  const [resetKey, setResetKey] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const fileError = file ? checkFile(file, kind) : null;

  const upload = async () => {
    if (!file || fileError) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await post(`/api/ideas/${idea._id}/${kind}`, form);
      onUpdated(res.data);
      setFile(null);
      setResetKey((k) => k + 1);
      toast.success(kind === 'deck' ? 'Nouvelle version du deck déposée' : 'Nouveau logo déposé');
    } catch (err) {
      setError(errorText(err, 'L\'envoi a échoué'));
    } finally {
      setUploading(false);
    }
  };

  const hasVersion = Boolean(idea[kind] && idea[kind].current);

  return (
    <div className="flex flex-col gap-4">
      <VersionHistory
        ideaId={idea._id}
        kind={kind}
        file={idea[kind]}
        emptyText={kind === 'deck' ? 'Aucun deck déposé : l\'idée est invisible dans le catalogue.' : 'Aucun logo : le visuel par défaut est affiché.'}
      />
      <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-4">
        <IdeaFileField
          kind={kind}
          label={hasVersion ? `Remplacer ${label}` : `Déposer ${label}`}
          disabled={disabled}
          onChange={setFile}
          resetKey={resetKey}
        />
        {kind === 'logo' && (
          <p className="text-xs text-text-dim">Un logo SVG est conservé mais remplacé par le visuel par défaut à l&apos;affichage.</p>
        )}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div>
          <Button size="sm" onClick={upload} loading={uploading} disabled={disabled || !file || Boolean(fileError)}>
            {hasVersion ? 'Déposer la nouvelle version' : 'Déposer'}
          </Button>
        </div>
      </div>
    </div>
  );
}

const sameFields = (a, b) =>
  a.title.trim() === b.title.trim() &&
  a.description.trim() === b.description.trim() &&
  a.hashtags.join(',') === b.hashtags.join(',');

const fieldsOf = (idea) => ({
  title: idea.title || '',
  description: idea.description || '',
  hashtags: idea.hashtags || [],
});

export default function EditIdea() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const { id } = router.query;
  const { get, put } = useApi();

  const [idea, setIdea] = useState(null);
  const [settings, setSettings] = useState({ deadlineDate: null });
  const [fields, setFields] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

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
      setFields(fieldsOf(ideaRes.data));
      setSettings(settingsRes.data || { deadlineDate: null });
    } catch (err) {
      setIdea(null);
      setLoadError({ status: err.status, message: errorText(err) });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      const res = await put(`/api/ideas/${idea._id}`, {
        title: fields.title.trim(),
        description: fields.description.trim(),
        hashtags: fields.hashtags,
      });
      setIdea(res.data);
      setFields(fieldsOf(res.data));
      toast.success('Modifications enregistrées');
    } catch (err) {
      setSaveError(errorText(err, 'L\'enregistrement a échoué'));
    } finally {
      setSaving(false);
    }
  };

  const shell = (content, title = 'Modifier une idée') => (
    <div className="min-h-screen flex flex-col bg-bg">
      <Head>
        <title>{`Hub Projets - ${title}`}</title>
      </Head>
      <AppHeader />
      <main className="flex-1 container mx-auto max-w-4xl px-4 py-8">{content}</main>
      <Footer />
    </div>
  );

  if (authLoading || (isAuthenticated && loading)) {
    return shell(
      <>
        <Skeleton variant="text" width="40%" height={32} className="mb-6" />
        <div className="space-y-6">
          {[1, 2, 3].map((i) => <Skeleton key={i} variant="rect" height={220} />)}
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
        sub={notFound ? "Cette idée n'existe pas ou n'est pas visible." : loadError.message}
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
  if (role !== 'creator' && role !== 'member') {
    return shell(
      <ErrorPage
        code="403"
        title="Modification réservée au groupe"
        sub="Seuls les membres qui ont accepté l'invitation peuvent modifier cette idée."
        action={
          <Link href={`/idees/${idea._id}`} passHref>
            <Button as="a" variant="outline">Voir la fiche</Button>
          </Link>
        }
      />,
      'Accès refusé'
    );
  }

  // Date limite passée, sauf déblocage staff de cette idée ; le serveur reste l'autorité
  const locked = isIdeaLocked(settings.deadlineDate, idea);
  const fieldErrors = checkIdeaFields(fields);
  const unchanged = sameFields(fields, fieldsOf(idea));
  const canSave = !locked && !saving && !unchanged && Object.keys(fieldErrors).length === 0;

  return shell(
    <>
      <Breadcrumb
        items={[
          { label: 'Idéation', href: '/idees' },
          { label: idea.title, href: `/idees/${idea._id}` },
          { label: 'Modifier' },
        ]}
      />

      <PageHead
        title="Modifier l'idée"
        sub={idea.title}
        actions={
          <Link href={`/idees/${idea._id}`} passHref>
            <Button as="a" variant="outline">Voir la fiche</Button>
          </Link>
        }
      />

      <DeadlineNotice deadlineDate={settings.deadlineDate} idea={idea} className="mb-6" />

      <div className="flex flex-col gap-6">
        <Section id="sec-infos" eyebrow="L'idée" title="Informations">
          <form onSubmit={handleSave} noValidate className="flex flex-col gap-5">
            <IdeaFields value={fields} onChange={setFields} disabled={locked || saving} showErrors={!unchanged} />
            {saveError && <p role="alert" className="text-sm text-danger">{saveError}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={!canSave} loading={saving}>Enregistrer</Button>
              {!unchanged && !saving && (
                <Button variant="subtle" onClick={() => setFields(fieldsOf(idea))}>Annuler les changements</Button>
              )}
            </div>
          </form>
        </Section>

        <Section
          id="sec-deck"
          eyebrow="Semaine 1"
          title="Deck"
          sub="Chaque dépôt ajoute une version ; les précédentes restent téléchargeables."
        >
          <FileVersionPanel idea={idea} kind="deck" label="le deck" disabled={locked} onUpdated={setIdea} />
        </Section>

        <Section id="sec-logo" eyebrow="Identité" title="Logo">
          <FileVersionPanel idea={idea} kind="logo" label="le logo" disabled={locked} onUpdated={setIdea} />
        </Section>

        <Section
          id="sec-links"
          eyebrow="Start-up Day"
          title="Documents du jour 2"
          sub="Ajoutez des liens vers vos documents (Drive, OneDrive, Canva, Notion, Figma, GitHub…)."
        >
          <LinkList
            ideaId={idea._id}
            links={idea.day2Links || []}
            editable
            disabled={locked}
            onUpdated={setIdea}
          />
        </Section>

        <Section
          id="sec-group"
          eyebrow="Groupe"
          title="Membres"
          sub={role === 'creator' ? 'Invitez de 2 à 5 étudiants (6 membres maximum, vous compris).' : 'Seul le créateur de l\'idée invite et retire des membres.'}
        >
          {role === 'creator' ? (
            <MemberManager idea={idea} disabled={locked} onUpdated={setIdea} />
          ) : (
            <MemberRows members={withCreatorFlag(idea)} />
          )}
        </Section>
      </div>
    </>,
    `Modifier ${idea.title}`
  );
}
