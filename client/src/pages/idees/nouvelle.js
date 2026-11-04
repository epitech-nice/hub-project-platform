// pages/idees/nouvelle.js — soumission d'une idée (création puis dépôt du deck et du logo)
import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import AppHeader from '../../components/layout/AppHeader';
import Footer from '../../components/layout/Footer';
import PageHead from '../../components/ui/PageHead';
import Breadcrumb from '../../components/ui/Breadcrumb';
import Button from '../../components/ui/Button';
import Skeleton from '../../components/ui/Skeleton';
import IdeaFields, { checkIdeaFields } from '../../components/ideas/IdeaFields';
import IdeaFileField from '../../components/ideas/IdeaFileField';
import DeadlineNotice from '../../components/ideas/DeadlineNotice';
import { useAuth } from '../../context/AuthContext';
import { useApi } from '../../hooks/useApi';
import { checkFile, errorText, isDeadlinePassed } from '../../lib/ideation';

const uploadForm = (file) => {
  const form = new FormData();
  form.append('file', file);
  return form;
};

export default function NewIdea() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const { get, post } = useApi();

  const [fields, setFields] = useState({ title: '', description: '', hashtags: [] });
  const [deck, setDeck] = useState(null);
  const [logo, setLogo] = useState(null);
  const [settings, setSettings] = useState(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState(null);
  const [error, setError] = useState(null);
  // Idée créée mais deck ou logo non déposé : { id, deckFailed, message }
  const [partial, setPartial] = useState(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push('/');
  }, [isAuthenticated, authLoading, router]);

  useEffect(() => {
    if (isAuthenticated) fetchSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const fetchSettings = async () => {
    try {
      const res = await get('/api/ideas/settings');
      setSettings(res.data || { deadlineDate: null });
    } catch (err) {
      // Sans réglages, le serveur tranchera à l'envoi
      setSettings({ deadlineDate: null });
    }
  };

  const deadlinePassed = Boolean(settings && isDeadlinePassed(settings.deadlineDate));
  const fieldErrors = checkIdeaFields(fields);
  const deckError = deck ? checkFile(deck, 'deck') : 'Le deck est requis';
  const logoError = logo ? checkFile(logo, 'logo') : null;
  const canSubmit =
    Object.keys(fieldErrors).length === 0 && !deckError && !logoError && !submitting && !deadlinePassed && !partial;

  // Liste lisible de ce qui manque, pour expliquer le bouton inactif
  const missing = [
    fieldErrors.title && 'un titre',
    fieldErrors.description && (fields.description.trim() ? 'une description de 50 mots maximum' : 'une description'),
    fieldErrors.hashtags && `3 hashtags distincts (${new Set(fields.hashtags).size}/3)`,
    deckError && 'un deck PPTX ou PDF',
  ].filter(Boolean);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    let id;
    try {
      setStep('Création de l\'idée…');
      const res = await post('/api/ideas', {
        title: fields.title.trim(),
        description: fields.description.trim(),
        hashtags: fields.hashtags,
      });
      id = res.data && res.data._id;
    } catch (err) {
      setError(errorText(err, 'La création a échoué'));
      setSubmitting(false);
      setStep(null);
      return;
    }

    try {
      setStep('Envoi du deck…');
      await post(`/api/ideas/${id}/deck`, uploadForm(deck));
    } catch (err) {
      setPartial({ id, deckFailed: true, message: errorText(err, 'L\'envoi du deck a échoué') });
      setSubmitting(false);
      setStep(null);
      return;
    }

    if (logo) {
      try {
        setStep('Envoi du logo…');
        await post(`/api/ideas/${id}/logo`, uploadForm(logo));
      } catch (err) {
        setPartial({ id, deckFailed: false, message: errorText(err, 'L\'envoi du logo a échoué') });
        setSubmitting(false);
        setStep(null);
        return;
      }
    }

    router.push(`/idees/${id}`);
  };

  if (authLoading || (isAuthenticated && settings === undefined)) {
    return (
      <div className="min-h-screen flex flex-col bg-bg">
        <AppHeader />
        <main className="flex-1 container mx-auto max-w-3xl px-4 py-8">
          <Skeleton variant="text" width="50%" height={32} className="mb-6" />
          <Skeleton variant="rect" height={420} />
        </main>
        <Footer />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <Head>
        <title>Hub Projets - Soumettre une idée</title>
      </Head>

      <AppHeader />

      <main className="flex-1 container mx-auto max-w-3xl px-4 py-8">
        <Breadcrumb items={[{ label: 'Idéation', href: '/idees' }, { label: 'Soumettre une idée' }]} />

        <PageHead
          title="Soumettre une idée"
          sub="Titre, description courte, au moins 3 hashtags et votre deck. Vous inviterez votre groupe ensuite."
        />

        <DeadlineNotice deadlineDate={settings && settings.deadlineDate} className="mb-6" />

        {partial ? (
          <div
            role="alert"
            className="flex flex-col gap-4 rounded-xl border px-5 py-4"
            style={{
              backgroundColor: 'rgb(var(--status-changes-bg))',
              borderColor: 'rgb(var(--status-changes-text) / 0.35)',
              color: 'rgb(var(--status-changes-text))',
            }}
          >
            {partial.deckFailed ? (
              <div className="text-sm">
                <p className="font-semibold">Votre idée est créée, mais elle n&apos;est pas encore visible dans le catalogue.</p>
                <p className="mt-1">Le deck n&apos;a pas pu être envoyé : {partial.message}</p>
                <p className="mt-1">Déposez-le depuis la page de modification pour la rendre visible.</p>
              </div>
            ) : (
              <div className="text-sm">
                <p className="font-semibold">Votre idée et son deck sont enregistrés.</p>
                <p className="mt-1">Le logo n&apos;a pas pu être envoyé : {partial.message}</p>
                <p className="mt-1">Vous pouvez réessayer depuis la page de modification.</p>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Link href={`/idees/${partial.id}/modifier`} passHref>
                <Button as="a">Réessayer depuis la modification</Button>
              </Link>
              <Link href={`/idees/${partial.id}`} passHref>
                <Button as="a" variant="outline">Voir la fiche</Button>
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
            <section className="rounded-xl border border-border bg-surface p-5 sm:p-6">
              <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-text-dim">L&apos;idée</p>
              <IdeaFields value={fields} onChange={setFields} disabled={deadlinePassed || submitting} />
            </section>

            <section className="rounded-xl border border-border bg-surface p-5 sm:p-6">
              <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-text-dim">Fichiers</p>
              <div className="flex flex-col gap-5">
                <IdeaFileField
                  kind="deck"
                  label="Deck de présentation"
                  required
                  disabled={deadlinePassed}
                  onChange={setDeck}
                />
                <IdeaFileField
                  kind="logo"
                  label="Logo (facultatif)"
                  disabled={deadlinePassed}
                  onChange={setLogo}
                />
              </div>
            </section>

            {error && (
              <p role="alert" className="rounded-lg border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">
                {error}
              </p>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-text-dim" aria-live="polite">
                {submitting && step
                  ? step
                  : missing.length > 0 && !deadlinePassed
                  ? `Il manque : ${missing.join(', ')}.`
                  : ''}
              </p>
              <div className="flex gap-2">
                <Link href="/idees" passHref>
                  <Button as="a" variant="subtle">Annuler</Button>
                </Link>
                <Button type="submit" disabled={!canSubmit} loading={submitting}>
                  Soumettre l&apos;idée
                </Button>
              </div>
            </div>
          </form>
        )}
      </main>

      <Footer />
    </div>
  );
}
