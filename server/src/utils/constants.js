/**
 * Constantes globales pour l'application Hub
 */

// Statuts pour les projets de groupe
const PROJECT_STATUSES = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  PENDING_CHANGES: 'pending_changes',
  COMPLETED: 'completed'
};

// Statuts pour les workshops
const WORKSHOP_STATUSES = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  PENDING_CHANGES: 'pending_changes',
  COMPLETED: 'completed'
};

// Statuts pour les cycles simulés (même logique que Project)
const SIMULATED_STATUSES = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  PENDING_CHANGES: 'pending_changes',
  COMPLETED: 'completed'
};

// Statuts pour le système d'inventaire (Outils)
const TOOL_STATUS = {
  AVAILABLE: 'available',
  BORROWED: 'borrowed',
  MAINTENANCE: 'maintenance'
};

// Statuts pour le système de prêt (Emprunts)
const LOAN_STATUS = {
  BORROWED: 'borrowed',
  RETURNED: 'returned'
};

module.exports = {
  PROJECT_STATUSES,
  WORKSHOP_STATUSES,
  SIMULATED_STATUSES,
  TOOL_STATUS,
  LOAN_STATUS
};
