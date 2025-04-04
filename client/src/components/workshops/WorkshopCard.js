import React from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useApi } from "../../hooks/useApi";
import { toast } from 'react-toastify';

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

const WorkshopCard = ({ workshop, onDelete, isMain = true }) => {
  const isPendingOrPendingChanges = workshop.status === 'pending' || workshop.status === 'pending_changes';
  const router = useRouter();
  const { delete: deleteRequest } = useApi();

  const handleEdit = () => {
    router.push(`/workshops/edit/${workshop._id}`);
  };

  const handleDelete = async () => {
    if (
      window.confirm(
        "Êtes-vous sûr de vouloir supprimer ce workshop ? Cette action est irréversible."
      )
    ) {
      try {
        await deleteRequest(`/api/workshops/${workshop._id}`);
        if (onDelete) {
          onDelete(workshop._id);
        }
      } catch (error) {
        console.error("Erreur lors de la suppression du workshop:", error);
        toast.error("Une erreur est survenue lors de la suppression du workshop.");
      }
    }
  };

  return (
    <div className={`bg-white dark:bg-gray-800 shadow-md rounded-lg p-4 mb-4 border-l-4 ${isMain ? 'border-blue-500' : 'border-green-500'}`}>
      <div className="flex justify-between items-start mb-2">
        <div>
          <h3 className="text-xl font-bold dark:text-white">{workshop.title}</h3>
          {!isMain && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Vous êtes intervenant dans ce workshop</p>
          )}
        </div>
        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${statusColors[workshop.status]}`}>
          {statusLabels[workshop.status]}
        </span>
      </div>

      <p className="text-gray-600 dark:text-gray-300 mb-4 line-clamp-2">{workshop.details}</p>

      <div className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        <p>Intervenants: {workshop.instructorCount}</p>
        <p>Soumis le: {new Date(workshop.createdAt).toLocaleDateString()}</p>
      </div>

      <div className="flex justify-between">
        <Link href={`/workshops/${workshop._id}`}>
          <a className="bg-blue-600 dark:bg-blue-700 text-white px-4 py-2 rounded-md hover:bg-blue-700 dark:hover:bg-blue-800 text-sm">
            Voir les détails
          </a>
        </Link>
        
        {isMain && isPendingOrPendingChanges && (
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

export default WorkshopCard;