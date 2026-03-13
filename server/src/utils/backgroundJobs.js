const emailService = require('../services/emailService');
const { sendExternalRequest } = require('../services/externalService');

/**
 * File d'attente asynchrone native à Node.js (sans base de données tierce).
 * Elle permet de décharger l'Event Loop principal des tâches longues (API externe, e-mails).
 * Les événements tournent en "fire and forget".
 * 
 * @param {string} jobName - Nom du service (ex: 'email', 'externalApi')
 * @param {Object} payload - Données relatives à la tâche
 */
const addJob = (jobName, payload) => {
  setImmediate(async () => {
    try {
      if (jobName === 'sendStatusEmail') {
        await emailService.sendStatusChangeEmail(payload.project, payload.status);
        console.log(`[Background Job] Email envoyé avec succès pour le projet ${payload.project._id}`);
      }

      if (jobName === 'sendExternalRequest') {
        const response = await sendExternalRequest(payload.project);
        
        // On pourrait ici mettre à jour le projet de manière asynchrone si désiré
        payload.project.externalRequestStatus = {
          sent: true,
          sentAt: Date.now(),
          response: response
        };
        await payload.project.save();
        console.log(`[Background Job] Requête Intra envoyée avec succès pour le projet ${payload.project._id}`);
      }
    } catch (error) {
       console.error(`[Background Job Error] Echec de la tâche '${jobName}': ${error.message}`);
       
       // Logique de 'retry' basique si nécessaire (hors scope MVP)
    }
  });
};

module.exports = { addJob };
