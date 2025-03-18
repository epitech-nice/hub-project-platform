// components/forms/ProjectForm.js
import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { useApi } from '../../hooks/useApi';

const ProjectForm = () => {
  const router = useRouter();
  const { post } = useApi();
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    objectives: '',
    technologies: '',
    studentCount: 1,
    studentEmails: '',
    links: {
      github: '',
      docs: '',
      other: ''
    }
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

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
      // Validation des emails si studentCount > 1
      if (formData.studentCount > 1 && !formData.studentEmails.trim()) {
        throw new Error('Veuillez indiquer les adresses e-mail des étudiants lorsque le projet implique plusieurs personnes');
      }

      // Transformer les technologies en array
      const formattedData = {
        ...formData,
        technologies: formData.technologies.split(',').map(tech => tech.trim()),
        links: {
          ...formData.links,
          other: formData.links.other ? formData.links.other.split(',').map(link => link.trim()) : []
        }
      };

      // Si studentCount > 1, formater les emails en array
      if (formData.studentCount > 1) {
        formattedData.studentEmails = formData.studentEmails.split(',').map(email => email.trim());
      }

      await post('/api/projects', formattedData);
      router.push('/dashboard');
    } catch (err) {
      setError(err.message || 'Une erreur est survenue lors de la soumission du projet');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white shadow-md rounded-lg p-6">
      <h2 className="text-2xl font-bold mb-6">Soumettre un nouveau projet</h2>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}
      
      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label className="block text-gray-700 font-bold mb-2" htmlFor="name">
            Nom du projet *
          </label>
          <input
            type="text"
            id="name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            className="w-full px-3 py-2 border rounded-lg"
            required
          />
        </div>
        
        <div className="mb-4">
          <label className="block text-gray-700 font-bold mb-2" htmlFor="description">
            Description détaillée *
          </label>
          <textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={handleChange}
            className="w-full px-3 py-2 border rounded-lg"
            rows="4"
            required
          />
        </div>
        
        <div className="mb-4">
          <label className="block text-gray-700 font-bold mb-2" htmlFor="objectives">
            Objectifs *
          </label>
          <textarea
            id="objectives"
            name="objectives"
            value={formData.objectives}
            onChange={handleChange}
            className="w-full px-3 py-2 border rounded-lg"
            rows="3"
            required
          />
        </div>
        
        <div className="mb-4">
          <label className="block text-gray-700 font-bold mb-2" htmlFor="technologies">
            Technologies utilisées * (séparées par des virgules)
          </label>
          <input
            type="text"
            id="technologies"
            name="technologies"
            value={formData.technologies}
            onChange={handleChange}
            className="w-full px-3 py-2 border rounded-lg"
            placeholder="React, Node.js, MongoDB, etc."
            required
          />
        </div>
        
        <div className="mb-4">
          <label className="block text-gray-700 font-bold mb-2" htmlFor="studentCount">
            Nombre d'étudiants impliqués *
          </label>
          <input
            type="number"
            id="studentCount"
            name="studentCount"
            value={formData.studentCount}
            onChange={handleChange}
            className="w-full px-3 py-2 border rounded-lg"
            min="1"
            required
          />
        </div>
        
        {/* Champ conditionnel pour les emails des étudiants */}
        {formData.studentCount > 1 && (
          <div className="mb-4">
            <label className="block text-gray-700 font-bold mb-2" htmlFor="studentEmails">
              Adresses e-mail des team mates * (séparées par des virgules)
            </label>
            <input
              type="text"
              id="studentEmails"
              name="studentEmails"
              value={formData.studentEmails}
              onChange={handleChange}
              className="w-full px-3 py-2 border rounded-lg"
              placeholder="etudiant1@email.com, etudiant2@email.com, ..."
              required
            />
            <p className="text-sm text-gray-500 mt-1">
              Indiquez les adresses e-mail des autres étudiants impliqués dans ce projet.
            </p>
          </div>
        )}
        
        <div className="mb-4">
          <label className="block text-gray-700 font-bold mb-2" htmlFor="links.github">
            Lien GitHub
          </label>
          <input
            type="url"
            id="links.github"
            name="links.github"
            value={formData.links.github}
            onChange={handleChange}
            className="w-full px-3 py-2 border rounded-lg"
            placeholder="https://github.com/username/repo"
          />
        </div>
        
        <div className="mb-4">
          <label className="block text-gray-700 font-bold mb-2" htmlFor="links.docs">
            Lien vers la documentation
          </label>
          <input
            type="url"
            id="links.docs"
            name="links.docs"
            value={formData.links.docs}
            onChange={handleChange}
            className="w-full px-3 py-2 border rounded-lg"
            placeholder="https://docs.google.com/..."
          />
        </div>
        
        <div className="mb-6">
          <label className="block text-gray-700 font-bold mb-2" htmlFor="links.other">
            Autres liens (séparés par des virgules)
          </label>
          <input
            type="text"
            id="links.other"
            name="links.other"
            value={formData.links.other}
            onChange={handleChange}
            className="w-full px-3 py-2 border rounded-lg"
            placeholder="https://example.com, https://another-site.com"
          />
        </div>
        
        <div className="flex justify-end">
          <button
            type="submit"
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Soumission en cours...' : 'Soumettre le projet'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ProjectForm;