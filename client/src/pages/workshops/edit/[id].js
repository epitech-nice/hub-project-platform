import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Header from '../../../components/layout/Header';
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
    links: {
      github: '',
      presentation: '',
      other: ''
    }
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [workshop, setWorkshop] = useState(null);
  const [githubError, setGithubError] = useState('');
  
  useEffect(() => {
    // Rediriger si non authentifié
    if (!authLoading && !isAuthenticated) {
      router.push('/');
    }
  }, [isAuthenticated, authLoading, router]);
  
  useEffect(() => {
    const fetchWorkshop = async () => {
      if (isAuthenticated && id) {
        try {
          const response = await get(`/api/workshops/${id}`);
          const workshop = response.data;
          
          // Vérifier si le workshop est en attente ou en attente de modifications
          if (workshop.status !== 'pending' && workshop.status !== 'pending_changes') {
            toast.warning('Seuls les workshops en attente ou en attente de modifications peuvent être modifiés.');
            router.push('/workshops/dashboard');
            return;
          }
          
          setWorkshop(workshop);
          
          // Formater les données pour le formulaire
          setFormData({
            title: workshop.title,
            details: workshop.details,
            instructorCount: workshop.instructorCount,
            instructorEmails: workshop.instructorEmails ? workshop.instructorEmails.join(', ') : '',
            links: {
              github: workshop.links.github || '',
              presentation: workshop.links.presentation || '',
              other: workshop.links.other ? workshop.links.other.join(', ') : ''
            }
          });
        } catch (error) {
          console.error('Erreur lors de la récupération du workshop:', error);
          toast.error('Erreur lors de la récupération du workshop. Redirection vers le tableau de bord.');
          router.push('/workshops/dashboard');
        }
      }
    };
    
    fetchWorkshop();
  }, [isAuthenticated, id, router]);
  
  // Fonction pour valider uniquement le lien GitHub personnel
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

      // Formater les données pour l'envoi
      const formattedData = {
        ...formData,
        instructorEmails: formData.instructorCount > 1 ? formData.instructorEmails.split(',').map(email => email.trim()) : [],
        links: {
          ...formData.links,
          other: formData.links.other ? formData.links.other.split(',').map(link => link.trim()) : []
        }
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
  
  if (authLoading || apiLoading || !workshop) {
    return <div className="text-center py-10 dark:text-white">Chargement...</div>;
  }
  
  return (
    <div className="min-h-screen dark:bg-gray-900">
      <Head>
        <title>Hub Projets - Modifier le workshop</title>
      </Head>
      
      <Header />
      
      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <button
            onClick={() => router.back()}
            className="text-blue-600 dark:text-blue-400 hover:underline flex items-center"
          >
            &larr; Retour
          </button>
        </div>
        
        <h1 className="text-3xl font-bold mb-6 dark:text-white">Modifier le workshop</h1>
        
        <div className="max-w-3xl mx-auto">
          <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-6">
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
                  {isSubmitting ? 'Mise à jour en cours...' : 'Mettre à jour le workshop'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}