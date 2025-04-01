import React from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useApi } from "../../hooks/useApi";

const statusColors = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-800/20 dark:text-yellow-300',
  pending_changes: 'bg-orange-100 text-orange-800 dark:bg-orange-800/20 dark:text-orange-300',
  approved: 'bg-green-100 text-green-800 dark:bg-green-800/20 dark:text-green-300',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-800/20 dark:text-red-300',
  completed: 'bg-purple-100 text-purple-800 dark:bg-purple-800/20 dark:text-purple-300'
};

const statusLabels = {
  pending: 'En attente',
  pending_changes: 'Modifications requises',
  approved: 'Approuvé',
  rejected: 'Refusé',
  completed: 'Terminé'
};

const ProjectCard = ({ project, onDelete, isCreator = true }) => {
  const isPendingOrPendingChanges = project.status === 'pending' || project.status === 'pending_changes';
  const router = useRouter();
  const { delete: deleteRequest } = useApi();

  const handleEdit = () => {
    router.push(`/projects/edit/${project._id}`);
  };

  const handleDelete = async () => {
    if (
      window.confirm(
        "Êtes-vous sûr de vouloir supprimer ce projet ? Cette action est irréversible."
      )
    ) {
      try {
        await deleteRequest(`/api/projects/${project._id}`);
        if (onDelete) {
          onDelete(project._id);
        }
      } catch (error) {
        console.error("Erreur lors de la suppression du projet:", error);
        alert("Une erreur est survenue lors de la suppression du projet.");
      }
    }
  };

  return (
    <div className={`bg-white dark:bg-gray-800 shadow-md rounded-lg p-4 mb-4 border-l-4 ${isCreator ? 'border-blue-500' : 'border-green-500'}`}>
      <div className="flex justify-between items-start mb-2">
        <div>
          <h3 className="text-xl font-bold dark:text-white">{project.name}</h3>
          {!isCreator && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Vous êtes membre de ce projet</p>
          )}
        </div>
        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${statusColors[project.status]}`}>
          {statusLabels[project.status]}
        </span>
      </div>

      <p className="text-gray-600 dark:text-gray-300 mb-4 line-clamp-2">{project.description}</p>

      <div className="flex flex-wrap gap-2 mb-4">
        {project.technologies.map((tech, index) => (
          <span
            key={index}
            className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-md text-xs text-gray-700 dark:text-gray-300"
          >
            {tech}
          </span>
        ))}
      </div>

      <div className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        <p>Étudiants impliqués: {project.studentCount}</p>
        <p>Soumis le: {new Date(project.createdAt).toLocaleDateString()}</p>
      </div>

      <div className="flex justify-between">
        <Link href={`/projects/${project._id}`}>
          <a className="bg-blue-600 dark:bg-blue-700 text-white px-4 py-2 rounded-md hover:bg-blue-700 dark:hover:bg-blue-800 text-sm">
            Voir les détails
          </a>
        </Link>
        
        {isCreator && isPendingOrPendingChanges && (
          <div className="flex space-x-2">
            <button
              onClick={handleEdit}
              className="bg-gray-600 dark:bg-gray-700 text-white px-4 py-2 rounded-md hover:bg-gray-700 dark:hover:bg-gray-600 text-sm"
            >
              Modifier
            </button>
            <button
              onClick={handleDelete}
              className="bg-red-600 dark:bg-red-700 text-white px-4 py-2 rounded-md hover:bg-red-700 dark:hover:bg-red-600 text-sm"
            >
              Supprimer
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectCard;