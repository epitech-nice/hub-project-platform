import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useApi } from '../../hooks/useApi';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import FormField from '../ui/FormField';
import FormActions from '../ui/FormActions';

const ProjectForm = () => {
  const router = useRouter();
  const { post, get } = useApi();
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
  const [githubError, setGithubError] = useState('');

  const validateGithubUrl = async (url) => {
    if (!url) {
      setGithubError('Ce champ est obligatoire');
      return false;
    }
    try {
      const data = await get('/api/projects/validate-github', { url });
      if (data.valid) {
        setGithubError('');
        return true;
      } else {
        setGithubError(data.message || "Ce dépôt n'existe pas ou est privé");
        return false;
      }
    } catch (err) {
      setGithubError(err.message || 'Erreur lors de la vérification du dépôt');
      return false;
    }
  };

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (formData.links.github) validateGithubUrl(formData.links.github);
    }, 1500);
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

      await post('/api/projects', formattedData);
      router.push('/dashboard');
    } catch (err) {
      setError(err.message || 'Une erreur est survenue lors de la soumission du projet');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <h2 className="text-2xl font-bold text-text mb-6">Soumettre un nouveau projet</h2>

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
          label="Lien GitHub personnel"
          required
          error={githubError || undefined}
          hint="Le lien vers votre dépôt GitHub personnel (doit être public)"
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
          label="Lien GitHub project"
          required
          hint="Le lien vers le Github Project"
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
            Soumettre le projet
          </Button>
        </FormActions>
      </form>
    </Card>
  );
};

export default ProjectForm;
