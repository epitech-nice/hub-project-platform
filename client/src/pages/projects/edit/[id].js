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

export default function EditProject() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const { id } = router.query;
  const { get, put, loading: apiLoading } = useApi();

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    objectives: '',
    technologies: '',
    studentCount: 1,
    studentEmails: '',
    links: { github: '', projectGithub: '', other: '' },
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [project, setProject] = useState(null);
  const [githubError, setGithubError] = useState('');

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/');
    }
  }, [isAuthenticated, authLoading, router]);

  useEffect(() => {
    const fetchProject = async () => {
      if (isAuthenticated && id) {
        try {
          const response = await get(`/api/projects/${id}`);
          const data = response.data;

          if (data.status !== 'pending' && data.status !== 'pending_changes') {
            toast.warning('Seuls les projets en attente ou en attente de modifications peuvent être modifiés.');
            router.push('/dashboard');
            return;
          }

          setProject(data);
          setFormData({
            name: data.name,
            description: data.description,
            objectives: data.objectives,
            technologies: data.technologies.join(', '),
            studentCount: data.studentCount,
            studentEmails: data.studentEmails ? data.studentEmails.join(', ') : '',
            links: {
              github: data.links.github || '',
              projectGithub: data.links.projectGithub || '',
              other: data.links.other ? data.links.other.join(', ') : '',
            },
          });
        } catch (err) {
          console.error('Erreur lors de la récupération du projet:', err);
          toast.error('Erreur lors de la récupération du projet. Redirection vers le tableau de bord.');
          router.push('/dashboard');
        }
      }
    };

    fetchProject();
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
        throw new Error('Veuillez corriger les erreurs dans le lien GitHub personnel');
      }
      if (!formData.links.projectGithub) {
        throw new Error('Le lien GitHub project est obligatoire');
      }
      if (formData.studentCount > 1 && !formData.studentEmails.trim()) {
        throw new Error('Veuillez indiquer les adresses e-mail des étudiants lorsque le projet implique plusieurs personnes');
      }

      const formattedData = {
        ...formData,
        technologies: formData.technologies.split(',').map((t) => t.trim()),
        studentEmails: formData.studentCount > 1
          ? formData.studentEmails.split(',').map((e) => e.trim())
          : [],
        links: {
          ...formData.links,
          other: formData.links.other
            ? formData.links.other.split(',').map((l) => l.trim())
            : [],
        },
      };

      await put(`/api/projects/${id}`, formattedData);
      toast.success('Projet mis à jour avec succès !');
      router.push('/dashboard');
    } catch (err) {
      setError(err.message || 'Une erreur est survenue lors de la mise à jour du projet');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading || (apiLoading && !project)) {
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

  if (!project) return null;

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
        <title>Hub Projets - Modifier le projet</title>
      </Head>

      <AppHeader />

      <main className="flex-1 container mx-auto px-4 py-8">
        <PageHead title="Modifier le projet" back={backLink} />

        <div className="max-w-3xl mx-auto">
          <Card>
            {error && (
              <div className="mb-4 rounded-md border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <FormField label="Nom du projet" required>
                <Input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                />
              </FormField>

              <FormField label="Description détaillée" required>
                <Textarea
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  rows={4}
                  required
                />
              </FormField>

              <FormField label="Objectifs" required>
                <Textarea
                  name="objectives"
                  value={formData.objectives}
                  onChange={handleChange}
                  rows={3}
                  required
                />
              </FormField>

              <FormField label="Technologies utilisées (séparées par des virgules)" required>
                <Input
                  type="text"
                  name="technologies"
                  value={formData.technologies}
                  onChange={handleChange}
                  placeholder="React, Node.js, MongoDB, etc."
                  required
                />
              </FormField>

              <FormField label="Nombre d'étudiants impliqués" required>
                <Input
                  type="number"
                  name="studentCount"
                  value={formData.studentCount}
                  onChange={handleChange}
                  min="1"
                  required
                />
              </FormField>

              {formData.studentCount > 1 && (
                <FormField
                  label="Adresses e-mail des étudiants (séparées par des virgules)"
                  required
                  hint={`Indiquez les adresses e-mail des ${formData.studentCount - 1} autres étudiants impliqués dans ce projet.`}
                >
                  <Input
                    type="text"
                    name="studentEmails"
                    value={formData.studentEmails}
                    onChange={handleChange}
                    placeholder="etudiant1@email.com, etudiant2@email.com, ..."
                    required
                  />
                </FormField>
              )}

              <FormField
                label="Lien repo GitHub"
                required
                error={githubError || undefined}
                hint="Le lien vers le repo GitHub (doit être public)"
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
                label="Lien GitHub Project"
                required
                hint="Le lien vers le GitHub Project"
              >
                <Input
                  type="url"
                  name="links.projectGithub"
                  value={formData.links.projectGithub}
                  onChange={handleChange}
                  placeholder="https://github.com/organization/project"
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
                  Mettre à jour le projet
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
