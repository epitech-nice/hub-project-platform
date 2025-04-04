import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useApi } from '../../hooks/useApi';
import { toast } from 'react-toastify';

const WorkshopForm = () => {
  const router = useRouter();
  const { post } = useApi();
  const [formData, setFormData] = useState({
    title: '',
    details: '',
    instructorCount: 1,
    instructorEmails: '',
    links: {
      github: '',
      presentation: '',
      other: ''
    }
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [githubError, setGithubError] = useState('');
  
  // Fonction pour valider uniquement le lien GitHub de référence
  const validateGithubUrl = async (url) => {
    if (!url) {
      setGithubError('Ce champ est obligatoire');
      return false;
    }
    
    // Vérifier si l'URL ressemble à un lien GitHub
    const githubRegex = /^https:\/\/github\.com\/[\w-]+\/[\w-]+\/?$/;
    if (!githubRegex.test(url)) {
      setGithubError('URL GitHub invalide (ex: https://github.com/username/repo)');
      return false;
    }
    
    try {
      // Vérifier si le dépôt est public en essayant d'y accéder via l'API GitHub
      const repoUrl = url.replace('https://github.com/', 'https://api.github.com/repos/');
      const response = await fetch(repoUrl);
      
      if (response.status === 200) {
        setGithubError('');
        return true;
      } else if (response.status === 404) {
        setGithubError('Ce dépôt n\'existe pas ou est privé');
        return false;
      } else {
        setGithubError('Erreur lors de la vérification du dépôt');
        return false;
      }
    } catch (error) {
      console.error('Erreur lors de la vérification du dépôt GitHub:', error);
      setGithubError('Erreur de connexion lors de la vérification');
      return false;
    }
  };

  // Valider le lien GitHub lorsqu'il change
  useEffect(() => {
    const validateRepoGithub = async () => {
      if (formData.links.github) {
        await validateGithubUrl(formData.links.github);
      }
    };
    
    const timeoutId = setTimeout(validateRepoGithub, 800); // Délai pour éviter trop de requêtes
    return () => clearTimeout(timeoutId);
  }, [formData.links.github]);
  
  const handleChange = (e) => {
    const { name, value } = e.target;
    
    if (name.includes('.')) {
      const [parent, child] = name.split('.');
      setFormData({
        ...formData,
        [parent]: {
          ...formData[parent],
          [child]: value
        }
      });
    } else {
      setFormData({
        ...formData,
        [name]: value
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      // Valider le lien GitHub avant de soumettre
      const isGithubValid = await validateGithubUrl(formData.links.github);
      
      if (!isGithubValid) {
        throw new Error('Veuillez corriger les erreurs dans le lien GitHub');
      }
      
      // Vérification des champs obligatoires
      if (!formData.links.presentation) {
        throw new Error('Le lien vers la présentation est obligatoire');
      }
      
      // Validation des emails si instructorCount > 1
      if (formData.instructorCount > 1 && !formData.instructorEmails.trim()) {
        throw new Error('Veuillez indiquer les adresses e-mail des intervenants lorsque le workshop implique plusieurs personnes');
      }

      // Transformer les données pour l'envoi
      const formattedData = {
        ...formData,
        instructorEmails: formData.instructorCount > 1 ? formData.instructorEmails.split(',').map(email => email.trim()) : [],
        links: {
          ...formData.links,
          other: formData.links.other ? formData.links.other.split(',').map(link => link.trim()) : []
        }
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
    <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-6">
      <h2 className="text-2xl font-bold mb-6 dark:text-white">Soumettre un nouveau workshop</h2>
      
      {error && (
        <div className="bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}
      
      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label className="block text-gray-700 dark:text-gray-300 font-bold mb-2" htmlFor="title">
            Titre du workshop *
          </label>
          <input
            type="text"
            id="title"
            name="title"
            value={formData.title}
            onChange={handleChange}
            className="w-full px-3 py-2 border dark:border-gray-700 dark:bg-gray-700 dark:text-white rounded-lg"
            required
          />
        </div>
        
        <div className="mb-4">
          <label className="block text-gray-700 dark:text-gray-300 font-bold mb-2" htmlFor="details">
            Détails du workshop *
          </label>
          <textarea
            id="details"
            name="details"
            value={formData.details}
            onChange={handleChange}
            className="w-full px-3 py-2 border dark:border-gray-700 dark:bg-gray-700 dark:text-white rounded-lg"
            rows="4"
            required
          />
        </div>
        
        <div className="mb-4">
          <label className="block text-gray-700 dark:text-gray-300 font-bold mb-2" htmlFor="instructorCount">
            Nombre d'intervenants *
          </label>
          <input
            type="number"
            id="instructorCount"
            name="instructorCount"
            value={formData.instructorCount}
            onChange={handleChange}
            className="w-full px-3 py-2 border dark:border-gray-700 dark:bg-gray-700 dark:text-white rounded-lg"
            min="1"
            required
          />
        </div>
        
        {/* Champ conditionnel pour les emails des intervenants */}
        {formData.instructorCount > 1 && (
          <div className="mb-4">
            <label className="block text-gray-700 dark:text-gray-300 font-bold mb-2" htmlFor="instructorEmails">
              Adresses e-mail des intervenants * (séparées par des virgules)
            </label>
            <input
              type="text"
              id="instructorEmails"
              name="instructorEmails"
              value={formData.instructorEmails}
              onChange={handleChange}
              className="w-full px-3 py-2 border dark:border-gray-700 dark:bg-gray-700 dark:text-white rounded-lg"
              placeholder="intervenant1@email.com, intervenant2@email.com, ..."
              required
            />
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Indiquez les adresses e-mail des {formData.instructorCount - 1} autres intervenants impliqués dans ce workshop.
            </p>
          </div>
        )}
        
        <div className="mb-4">
          <label className="block text-gray-700 dark:text-gray-300 font-bold mb-2" htmlFor="links.github">
            Lien GitHub de référence *
          </label>
          <input
            type="url"
            id="links.github"
            name="links.github"
            value={formData.links.github}
            onChange={handleChange}
            className={`w-full px-3 py-2 border dark:border-gray-700 dark:bg-gray-700 dark:text-white rounded-lg ${githubError ? 'border-red-500 dark:border-red-800' : ''}`}
            placeholder="https://github.com/username/repo"
            required
          />
          {githubError && (
            <p className="text-red-500 dark:text-red-400 text-sm mt-1">{githubError}</p>
          )}
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Le lien vers le dépôt GitHub de référence (doit être public)
          </p>
        </div>
        
        <div className="mb-4">
          <label className="block text-gray-700 dark:text-gray-300 font-bold mb-2" htmlFor="links.presentation">
            Lien présentation PowerPoint *
          </label>
          <input
            type="url"
            id="links.presentation"
            name="links.presentation"
            value={formData.links.presentation}
            onChange={handleChange}
            className="w-full px-3 py-2 border dark:border-gray-700 dark:bg-gray-700 dark:text-white rounded-lg"
            placeholder="https://example.com/presentation"
            required
          />
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Le lien vers votre présentation PowerPoint ou équivalent
          </p>
        </div>
        
        <div className="mb-6">
          <label className="block text-gray-700 dark:text-gray-300 font-bold mb-2" htmlFor="links.other">
            Autres liens (séparés par des virgules)
          </label>
          <input
            type="text"
            id="links.other"
            name="links.other"
            value={formData.links.other}
            onChange={handleChange}
            className="w-full px-3 py-2 border dark:border-gray-700 dark:bg-gray-700 dark:text-white rounded-lg"
            placeholder="https://example.com, https://another-site.com"
          />
        </div>
        
        <div className="flex justify-end">
          <button
            type="submit"
            className="bg-blue-600 dark:bg-blue-700 text-white px-6 py-2 rounded-lg hover:bg-blue-700 dark:hover:bg-blue-800 disabled:opacity-50"
            disabled={isSubmitting || githubError}
          >
            {isSubmitting ? 'Soumission en cours...' : 'Soumettre le workshop'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default WorkshopForm;