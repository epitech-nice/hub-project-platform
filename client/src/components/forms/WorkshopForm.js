import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useApi } from '../../hooks/useApi';
import { toast } from 'react-toastify';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import FormField from '../ui/FormField';
import FormActions from '../ui/FormActions';

const WorkshopForm = () => {
  const router = useRouter();
  const { post } = useApi();
  const [formData, setFormData] = useState({
    title: '',
    details: '',
    instructorCount: 1,
    instructorEmails: '',
    links: { github: '', presentation: '', other: '' },
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [githubError, setGithubError] = useState('');

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

      await post('/api/workshops', formattedData);
      toast.success('Workshop soumis avec succès !');
      router.push('/workshops/dashboard');
    } catch (err) {
      setError(err.message || 'Une erreur est survenue lors de la soumission du workshop');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <h2 className="text-2xl font-bold text-text mb-6">Soumettre un nouveau workshop</h2>

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
            Soumettre le workshop
          </Button>
        </FormActions>
      </form>
    </Card>
  );
};

export default WorkshopForm;
