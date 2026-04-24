import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import AppHeader from '../../../components/layout/AppHeader';
import Footer from '../../../components/layout/Footer';
import PageHead from '../../../components/ui/PageHead';
import Card from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import Textarea from '../../../components/ui/Textarea';
import FormField from '../../../components/ui/FormField';
import FormActions from '../../../components/ui/FormActions';
import Skeleton from '../../../components/ui/Skeleton';
import { useAuth } from '../../../context/AuthContext';
import { useApi } from '../../../hooks/useApi';
import { toast } from 'react-toastify';

export default function EditWorkshop() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const { id } = router.query;
  const { get, put, loading: apiLoading } = useApi();

  const [formData, setFormData] = useState({
    title: '',
    details: '',
    instructorCount: 1,
    instructorEmails: '',
    links: { github: '', presentation: '', other: '' },
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [workshop, setWorkshop] = useState(null);
  const [githubError, setGithubError] = useState('');

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/');
    }
  }, [isAuthenticated, authLoading, router]);

  useEffect(() => {
    const fetchWorkshop = async () => {
      if (isAuthenticated && id) {
        try {
          const response = await get(`/api/workshops/${id}`);
          const data = response.data;

          if (data.status !== 'pending' && data.status !== 'pending_changes') {
            toast.warning('Seuls les workshops en attente ou en attente de modifications peuvent être modifiés.');
            router.push('/workshops/dashboard');
            return;
          }

          setWorkshop(data);
          setFormData({
            title: data.title,
            details: data.details,
            instructorCount: data.instructorCount,
            instructorEmails: data.instructorEmails ? data.instructorEmails.join(', ') : '',
            links: {
              github: data.links.github || '',
              presentation: data.links.presentation || '',
              other: data.links.other ? data.links.other.join(', ') : '',
            },
          });
        } catch (err) {
          console.error('Erreur lors de la récupération du workshop:', err);
          toast.error('Erreur lors de la récupération du workshop. Redirection vers le tableau de bord.');
          router.push('/workshops/dashboard');
        }
      }
    };

    fetchWorkshop();
  }, [isAuthenticated, id, router]);

  const validateGithubUrl = async (url) => {
    if (!url) {
      setGithubError('Ce champ est obligatoire');
      return false;
    }
    const githubRegex = /^https:\/\/github\.com\/[\w-]+\/[\w-]+\/?$/;
    if (!githubRegex.test(url)) {
      setGithubError('URL GitHub invalide (ex: https://github.com/username/repo)');
      return false;
    }
    try {
      const repoUrl = url.replace('https://github.com/', 'https://api.github.com/repos/');
      const response = await fetch(repoUrl);
      if (response.status === 200) {
        setGithubError('');
        return true;
      } else if (response.status === 404) {
        setGithubError("Ce dépôt n'existe pas ou est privé");
        return false;
      } else {
        setGithubError('Erreur lors de la vérification du dépôt');
        return false;
      }
    } catch (err) {
      console.error('Erreur lors de la vérification du dépôt GitHub:', err);
      setGithubError('Erreur de connexion lors de la vérification');
      return false;
    }
  };

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (formData.links.github) validateGithubUrl(formData.links.github);
    }, 800);
    return () => clearTimeout(timeoutId);
  }, [formData.links.github]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name.includes('.')) {
      const [parent, child] = name.split('.');
      setFormData({ ...formData, [parent]: { ...formData[parent], [child]: value } });
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const isGithubValid = await validateGithubUrl(formData.links.github);
      if (!isGithubValid) {
        throw new Error('Veuillez corriger les erreurs dans le lien GitHub');
      }
      if (!formData.links.presentation) {
        throw new Error('Le lien vers la présentation est obligatoire');
      }
      if (formData.instructorCount > 1 && !formData.instructorEmails.trim()) {
        throw new Error('Veuillez indiquer les adresses e-mail des intervenants lorsque le workshop implique plusieurs personnes');
      }

      const formattedData = {
        ...formData,
        instructorEmails: formData.instructorCount > 1
          ? formData.instructorEmails.split(',').map((e) => e.trim())
          : [],
        links: {
          ...formData.links,
          other: formData.links.other
            ? formData.links.other.split(',').map((l) => l.trim())
            : [],
        },
      };

      await put(`/api/workshops/${id}`, formattedData);
      toast.success('Workshop mis à jour avec succès !');
      router.push('/workshops/dashboard');
    } catch (err) {
      setError(err.message || 'Une erreur est survenue lors de la mise à jour du workshop');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading || (apiLoading && !workshop)) {
    return (
      <div className="min-h-screen flex flex-col bg-bg">
        <AppHeader />
        <main className="flex-1 container mx-auto px-4 py-8 max-w-3xl">
          <Skeleton variant="text" width="40%" height={32} className="mb-6" />
          <Skeleton variant="rect" height={500} />
        </main>
        <Footer />
      </div>
    );
  }

  if (!workshop) return null;

  const backLink = (
    <button
      onClick={() => router.back()}
      className="text-sm text-text-muted hover:text-primary transition-colors duration-150"
    >
      &larr; Retour
    </button>
  );

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <Head>
        <title>Hub Projets - Modifier le workshop</title>
      </Head>

      <AppHeader />

      <main className="flex-1 container mx-auto px-4 py-8">
        <PageHead title="Modifier le workshop" back={backLink} />

        <div className="max-w-3xl mx-auto">
          <Card>
            {error && (
              <div className="mb-4 rounded-md border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <FormField label="Titre du workshop" required>
                <Input
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleChange}
                  required
                />
              </FormField>

              <FormField label="Détails du workshop" required>
                <Textarea
                  name="details"
                  value={formData.details}
                  onChange={handleChange}
                  rows={4}
                  required
                />
              </FormField>

              <FormField label="Nombre d'intervenants" required>
                <Input
                  type="number"
                  name="instructorCount"
                  value={formData.instructorCount}
                  onChange={handleChange}
                  min="1"
                  required
                />
              </FormField>

              {formData.instructorCount > 1 && (
                <FormField
                  label="Adresses e-mail des intervenants (séparées par des virgules)"
                  required
                  hint={`Indiquez les adresses e-mail des ${formData.instructorCount - 1} autres intervenants impliqués dans ce workshop.`}
                >
                  <Input
                    type="text"
                    name="instructorEmails"
                    value={formData.instructorEmails}
                    onChange={handleChange}
                    placeholder="intervenant1@email.com, intervenant2@email.com, ..."
                    required
                  />
                </FormField>
              )}

              <FormField
                label="Lien GitHub de référence"
                required
                error={githubError || undefined}
                hint="Le lien vers le dépôt GitHub de référence (doit être public)"
              >
                <Input
                  type="url"
                  name="links.github"
                  value={formData.links.github}
                  onChange={handleChange}
                  placeholder="https://github.com/username/repo"
                  error={!!githubError}
                  required
                />
              </FormField>

              <FormField
                label="Lien présentation PowerPoint"
                required
                hint="Le lien vers votre présentation PowerPoint ou équivalent"
              >
                <Input
                  type="url"
                  name="links.presentation"
                  value={formData.links.presentation}
                  onChange={handleChange}
                  placeholder="https://example.com/presentation"
                  required
                />
              </FormField>

              <FormField label="Autres liens (séparés par des virgules)">
                <Input
                  type="text"
                  name="links.other"
                  value={formData.links.other}
                  onChange={handleChange}
                  placeholder="https://example.com, https://another-site.com"
                />
              </FormField>

              <FormActions>
                <Button
                  type="submit"
                  variant="primary"
                  loading={isSubmitting}
                  disabled={isSubmitting || !!githubError}
                >
                  Mettre à jour le workshop
                </Button>
              </FormActions>
            </form>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
}
