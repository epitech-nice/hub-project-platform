const { Resend } = require('resend');

// Initialiser Resend avec votre clé API
const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Envoie un email de notification lors d'un changement de statut de projet ou workshop
 * @param {Object} item - Le projet ou workshop dont le statut a changé
 * @param {String} newStatus - Le nouveau statut du projet/workshop
 * @param {Boolean} isWorkshop - Indique s'il s'agit d'un workshop (true) ou d'un projet (false)
 * @returns {Promise} - Résultat de l'envoi d'email
 */
exports.sendStatusChangeEmail = async (item, newStatus, isWorkshop = false, isSimulated = false) => {
  try {
    // Déterminer le type d'élément
    const itemType = isSimulated ? 'simulated' : isWorkshop ? 'workshop' : 'project';

    // Préparer la liste des destinataires selon le type d'élément
    let recipients = [];

    if (isSimulated) {
      // Pour un enrollment Simulated : destinataire = l'étudiant
      if (item.student && item.student.email) {
        recipients.push(item.student.email);
      }
    } else if (isWorkshop) {
      // Pour un workshop, inclure tous les emails liés

      // Ajouter les instructeurs
      if (item.instructors && item.instructors.length > 0) {
        recipients.push(...item.instructors.map(instructor => instructor.email));
      }

      // Ajouter les emails des instructeurs stockés séparément
      if (item.instructorEmails && item.instructorEmails.length > 0) {
        recipients.push(...item.instructorEmails);
      }

      // Ajouter le soumetteur s'il n'est pas déjà inclus
      if (item.submittedBy && item.submittedBy.email && !recipients.includes(item.submittedBy.email)) {
        recipients.push(item.submittedBy.email);
      }
    } else {
      // Pour un projet, inclure tous les emails liés

      // Ajouter les membres
      if (item.members && item.members.length > 0) {
        recipients.push(...item.members.map(member => member.email));
      }

      // Ajouter les emails des étudiants stockés séparément
      if (item.studentEmails && item.studentEmails.length > 0) {
        recipients.push(...item.studentEmails);
      }

      // Ajouter le soumetteur s'il n'est pas déjà inclus
      if (item.submittedBy && item.submittedBy.email && !recipients.includes(item.submittedBy.email)) {
        recipients.push(item.submittedBy.email);
      }
    }
    
    // Éliminer les doublons et les valeurs vides
    recipients = [...new Set(recipients.filter(email => email && email.trim() !== ''))];
    
    
    // Si pas de destinataires, ne rien faire
    if (!recipients.length) {
      console.log(`Aucun destinataire pour l'email (${itemType}), envoi annulé`);
      return { success: false, reason: 'No recipients' };
    }

    // Nom affiché dans l'email selon le type
    const itemLabel = isSimulated
      ? `${item.simulatedProject.title} — Cycle n°${item.cycleNumber}`
      : isWorkshop
      ? item.title
      : item.name;

    // Définir l'objet et le contenu en fonction du nouveau statut
    let subject = '';
    let statusColor = '';
    let statusEmoji = '';
    let statusMessage = '';

    switch (newStatus) {
      case 'approved':
        subject = `✅ ${isSimulated ? 'Cycle Simulated' : isWorkshop ? 'Workshop' : 'Projet'} approuvé : ${itemLabel}`;
        statusColor = '#4CAF50';
        statusEmoji = '✅';
        statusMessage = `Votre ${isSimulated ? 'cycle Simulated' : isWorkshop ? 'workshop' : 'projet'} a été approuvé !`;
        break;

      case 'rejected':
        subject = `⛔ ${isSimulated ? 'Cycle Simulated' : isWorkshop ? 'Workshop' : 'Projet'} non retenu : ${itemLabel}`;
        statusColor = '#ab1409';
        statusEmoji = '⛔';
        statusMessage = `Votre ${isSimulated ? 'cycle Simulated' : isWorkshop ? 'workshop' : 'projet'} n'a pas été retenu`;
        break;

      case 'pending_changes':
        subject = `🔄 Modifications demandées : ${itemLabel}`;
        statusColor = '#FF9800';
        statusEmoji = '🔄';
        statusMessage = `Des modifications sont requises pour votre ${isSimulated ? 'cycle Simulated' : isWorkshop ? 'workshop' : 'projet'}`;
        break;

      case 'completed':
        subject = `🏆 ${isWorkshop ? 'Workshop' : 'Projet'} terminé : ${itemLabel}`;
        statusColor = '#9C27B0';
        statusEmoji = '🏆';
        statusMessage = `Votre ${isWorkshop ? 'workshop' : 'projet'} est maintenant terminé !`;
        break;

      default:
        subject = `📝 Mise à jour : ${itemLabel}`;
        statusColor = '#2196F3';
        statusEmoji = '📝';
        statusMessage = `Le statut de votre ${isSimulated ? 'cycle Simulated' : isWorkshop ? 'workshop' : 'projet'} a été mis à jour`;
    }
    
    // Adresse physique pour conformité légale
    const physicalAddress = `
      <tr>
        <td style="padding: 20px; text-align: center; color: #888; font-size: 12px; border-top: 1px solid #eee;">
          {EPITECH} Nice<br>
          131 Boulevard René Cassin<br>
          06200 Nice, France
        </td>
      </tr>
    `;
    
    // Formatage des commentaires
    let commentsSection = '';
    if (item.reviewedBy && item.reviewedBy.comments) {
      commentsSection = `
        <tr>
          <td style="padding: 20px; background-color: #f8f9fa; border-left: 4px solid ${statusColor};">
            <p style="font-weight: bold; margin-top: 0;">Commentaires de l'évaluateur :</p>
            <p style="white-space: pre-line; margin-bottom: 0;">${item.reviewedBy.comments.replace(/\n/g, '<br>')}</p>
          </td>
        </tr>
      `;
    }

    // Information spécifique au type d'élément
    let itemSpecificDetails = '';
    if (isSimulated) {
      itemSpecificDetails = `
        <p><strong>Projet :</strong> ${item.simulatedProject.title}</p>
        <p><strong>Cycle n° :</strong> ${item.cycleNumber}${item.isDoubleCycle ? ' (double cycle)' : ''}</p>
        <p><strong>GitHub Project :</strong> ${item.githubProjectLink || 'Non renseigné'}</p>
        ${newStatus === 'approved' && item.credits !== null ? `<p><strong>Crédits obtenus :</strong> ${item.credits}</p>` : ''}
        ${item.defenseDate ? `<p><strong>Date de présentation :</strong> ${new Date(item.defenseDate).toLocaleDateString('fr-FR')}</p>` : ''}
      `;
    } else if (isWorkshop) {
      itemSpecificDetails = `
        <p><strong>Titre :</strong> ${item.title}</p>
        <p><strong>Description :</strong> ${item.details}</p>
        <p><strong>Nombre d'intervenants :</strong> ${item.instructorCount}</p>
        ${item.links && item.links.github ? `<p><strong>GitHub :</strong> ${item.links.github}</p>` : ''}
        ${item.links && item.links.presentation ? `<p><strong>Présentation :</strong> ${item.links.presentation}</p>` : ''}
      `;
    } else {
      itemSpecificDetails = `
        <p><strong>Nom :</strong> ${item.name}</p>
        <p><strong>Description :</strong> ${item.description}</p>
        <p><strong>Technologies :</strong> ${item.technologies.join(', ')}</p>
        <p><strong>Nombre d'étudiants :</strong> ${item.studentCount}</p>
        <p><strong>Nombre de crédits :</strong> ${item.credits || 'Non défini'}</p>
      `;
    }
    
    // Créer le contenu HTML complet de l'email
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${subject}</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; border-collapse: collapse;">
            <!-- En-tête -->
            <tr>
              <td style="background-color: ${statusColor}; padding: 20px; text-align: center; color: white;">
                <h1 style="margin: 0; font-size: 24px;">${statusEmoji} ${statusMessage}</h1>
              </td>
            </tr>
            
            <!-- Contenu principal -->
            <tr>
              <td style="padding: 20px;">
                <p>Bonjour,</p>
                <p>Le statut de <strong>${itemLabel}</strong> a été mis à jour.</p>
                <p>
                  <span style="display: inline-block; padding: 8px 16px; background-color: ${statusColor}; color: white; border-radius: 4px; font-weight: bold;">
                    ${statusEmoji} ${newStatus === 'approved' ? 'Approuvé' : newStatus === 'rejected' ? 'Non retenu' : newStatus === 'pending_changes' ? 'Modifications requises' : 'Mis à jour'}
                  </span>
                </p>
              </td>
            </tr>
            
            <!-- Commentaires de l'évaluateur (si présents) -->
            ${commentsSection}
            
            <!-- Informations spécifiques -->
            <tr>
              <td style="padding: 20px;">
                <h2 style="margin-top: 0; color: #444; border-bottom: 1px solid #eee; padding-bottom: 10px;">Détails du ${isSimulated ? 'cycle Simulated' : isWorkshop ? 'workshop' : 'projet'}</h2>
                ${itemSpecificDetails}
                <p style="margin-top: 25px;">
                  <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/${isWorkshop ? 'workshops/' : ''}dashboard" style="display: inline-block; padding: 10px 20px; background-color: #2196F3; color: white; text-decoration: none; border-radius: 4px; font-weight: bold;">
                    Voir les détails
                  </a>
                </p>
              </td>
            </tr>
            
            <!-- Message de désabonnement -->
            <tr>
              <td style="padding: 20px; font-size: 14px; color: #666; background-color: #f8f9fa;">
                <p>Cet email vous a été envoyé car vous êtes impliqué dans ce ${isWorkshop ? 'workshop' : 'projet'}. Si vous recevez cet email dans vos courriers indésirables, veuillez le marquer comme "Non indésirable" ou ajouter notre adresse à vos contacts.</p>
                <p style="margin-bottom: 0;">
                  <a href="mailto:unsubscribe@${process.env.EMAIL_DOMAIN || 'votredomaine.com'}?subject=Unsubscribe&body=Please%20unsubscribe%20me%20from%20${isWorkshop ? 'workshop' : 'project'}%20notifications" style="color: #2196F3; text-decoration: none;">
                    Se désabonner des notifications
                  </a>
                </p>
              </td>
            </tr>
            
            <!-- Adresse physique et informations légales -->
            ${physicalAddress}
          </table>
        </body>
      </html>
    `;
    
    // Créer une version texte simple pour les clients qui ne supportent pas HTML
    const statusLabel = newStatus === 'approved' ? 'Approuvé' : newStatus === 'rejected' ? 'Non retenu' : newStatus === 'pending_changes' ? 'Modifications requises' : 'Mis à jour';
    const textContent = `
${statusMessage}

Bonjour,

Le statut de "${itemLabel}" a été mis à jour.

Statut: ${statusLabel}

${item.reviewedBy && item.reviewedBy.comments ? `Commentaires de l'évaluateur :\n${item.reviewedBy.comments}\n` : ''}
${isSimulated ? `
Détails du cycle Simulated:
- Projet: ${item.simulatedProject.title}
- Cycle n°: ${item.cycleNumber}${item.isDoubleCycle ? ' (double cycle)' : ''}
- GitHub Project: ${item.githubProjectLink || 'Non renseigné'}
${newStatus === 'approved' && item.credits !== null ? `- Crédits obtenus: ${item.credits}` : ''}` : isWorkshop ?
`Détails du workshop:
- Titre: ${item.title}
- Description: ${item.details}
- Nombre d'intervenants: ${item.instructorCount}` :
`Détails du projet:
- Nom: ${item.name}
- Description: ${item.description}
- Technologies: ${item.technologies.join(', ')}
- Nombre d'étudiant(s): ${item.studentCount}
- Nombre de crédit(s) : ${item.credits || 'Non défini'}`}

Pour voir les détails, visitez: ${process.env.FRONTEND_URL || 'http://localhost:3000'}/${isSimulated ? 'simulated' : isWorkshop ? 'workshops/dashboard' : 'dashboard'}

---
Cet email vous a été envoyé car vous êtes impliqué dans ce ${isSimulated ? 'projet Simulated' : isWorkshop ? 'workshop' : 'projet'}.
Pour vous désabonner, contactez-nous à unsubscribe@${process.env.EMAIL_DOMAIN || 'votredomaine.com'}.

{EPITECH} Nice
131 Boulevard René Cassin
06200 Nice, France
    `.trim();
    
    // Envoyer l'email via Resend avec des en-têtes supplémentaires
    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'Hub Projets <notifications@votredomaine.com>',
      to: recipients,
      subject: subject,
      html: htmlContent,
      text: textContent,
      headers: {
        'List-Unsubscribe': `<mailto:unsubscribe@${process.env.EMAIL_DOMAIN || 'votredomaine.com'}?subject=Unsubscribe>`,
        'Precedence': 'bulk'
      },
      tags: [
        {
          name: 'category',
          value: isSimulated ? 'simulated_notification' : isWorkshop ? 'workshop_notification' : 'project_notification'
        },
        {
          name: 'status',
          value: newStatus
        }
      ]
    });
    
    if (error) {
      console.error('Erreur Resend:', error);
      throw error;
    }
    
    console.log(`Email envoyé avec succès pour le ${isWorkshop ? 'workshop' : 'projet'}, ID:`, data.id);
    return { success: true, messageId: data.id };
  } catch (error) {
    console.error(`Erreur lors de l'envoi de l'email:`, error);
    throw error;
  }
};