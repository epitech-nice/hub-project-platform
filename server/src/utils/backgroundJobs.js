const emailService = require('../services/emailService');

/**
 * File d'attente asynchrone native à Node.js (sans base de données tierce).
 * Elle permet de décharger l'Event Loop principal des tâches longues (e-mails).
 * Les événements tournent en "fire and forget".
 *
 * @param {string} jobName - Nom du service (ex: 'sendStatusEmail')
 * @param {Object} payload - Données relatives à la tâche
 */
const addJob = (jobName, payload) => {
  setImmediate(async () => {
    try {
      if (jobName === 'sendStatusEmail') {
        await emailService.sendStatusChangeEmail(
          payload.project,
          payload.status,
          payload.isWorkshop ?? false,
          payload.isSimulated ?? false
        );
        console.log(`[Background Job] Email envoyé avec succès pour le projet ${payload.project._id}`);
      }
    } catch (error) {
       console.error(`[Background Job Error] Echec de la tâche '${jobName}': ${error.message}`);
       
       // Logique de 'retry' basique si nécessaire (hors scope MVP)
    }
  });
};

module.exports = { addJob };
