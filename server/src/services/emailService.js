const { Resend } = require('resend');

// Initialiser Resend avec votre clé API
const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Envoie un email de notification lors d'un changement de statut de projet
 * @param {Object} project - Le projet dont le statut a changé
 * @param {String} newStatus - Le nouveau statut du projet
 * @returns {Promise} - Résultat de l'envoi d'email
 */
exports.sendStatusChangeEmail = async (project, newStatus) => {
  try {
    // Préparer la liste des destinataires (créateur + membres)
    const recipients = project.members.map(member => member.email);
    
    // Si pas de destinataires, ne rien faire
    if (!recipients.length) {
      console.log('Aucun destinataire pour l\'email, envoi annulé');
      return { success: false, reason: 'No recipients' };
    }
    
    // Définir l'objet et le contenu en fonction du nouveau statut
    let subject = '';
    let statusColor = '';
    let statusEmoji = '';
    let statusMessage = '';
    
    switch (newStatus) {
      case 'approved':
        subject = `✅ Projet approuvé : ${project.name}`;
        statusColor = '#4CAF50'; // Vert
        statusEmoji = '✅';
        statusMessage = 'Votre projet a été approuvé !';
        break;
      
      case 'rejected':
        subject = `⛔ Projet non retenu : ${project.name}`;
        statusColor = '#ab1409 '; // Rouge
        statusEmoji = '⛔';
        statusMessage = 'Votre projet n\'a pas été retenu';
        break;
      
      case 'pending_changes':
        subject = `🔄 Modifications demandées : ${project.name}`;
        statusColor = '#FF9800'; // Orange
        statusEmoji = '🔄';
        statusMessage = 'Des modifications sont requises pour votre projet';
        break;
      
      case 'completed':
        subject = `🏆 Projet terminé : ${project.name}`;
        statusColor = '#9C27B0'; // Violet
        statusEmoji = '🏆';
        statusMessage = 'Votre projet est maintenant terminé !';
        break;

      default:
        subject = `📝 Mise à jour du projet : ${project.name}`;
        statusColor = '#2196F3'; // Bleu
        statusEmoji = '📝';
        statusMessage = 'Le statut de votre projet a été mis à jour';
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
    if (project.reviewedBy && project.reviewedBy.comments) {
      commentsSection = `
        <tr>
          <td style="padding: 20px; background-color: #f8f9fa; border-left: 4px solid ${statusColor};">
            <p style="font-weight: bold; margin-top: 0;">Commentaires de l'évaluateur :</p>
            <p style="white-space: pre-line; margin-bottom: 0;">${project.reviewedBy.comments.replace(/\n/g, '<br>')}</p>
          </td>
        </tr>
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
                <p>Le statut du projet <strong>${project.name}</strong> a été mis à jour.</p>
                <p>
                  <span style="display: inline-block; padding: 8px 16px; background-color: ${statusColor}; color: white; border-radius: 4px; font-weight: bold;">
                    ${statusEmoji} ${newStatus === 'approved' ? 'Approuvé' : newStatus === 'rejected' ? 'Non retenu' : newStatus === 'pending_changes' ? 'Modifications requises' : 'Mis à jour'}
                  </span>
                </p>
              </td>
            </tr>
            
            <!-- Commentaires de l'évaluateur (si présents) -->
            ${commentsSection}
            
            <!-- Informations du projet -->
            <tr>
              <td style="padding: 20px;">
                <h2 style="margin-top: 0; color: #444; border-bottom: 1px solid #eee; padding-bottom: 10px;">Détails du projet</h2>
                <p><strong>Nom :</strong> ${project.name}</p>
                <p><strong>Description :</strong> ${project.description}</p>
                <p><strong>Technologies :</strong> ${project.technologies.join(', ')}</p>
                <p><strong>Nombre d'étudiants :</strong> ${project.studentCount}</p>
                <p><strong>Nombre de crédits :</strong> ${project.credits}</p>
                <p style="margin-top: 25px;">
                  <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard" style="display: inline-block; padding: 10px 20px; background-color: #2196F3; color: white; text-decoration: none; border-radius: 4px; font-weight: bold;">
                    Voir les détails du projet
                  </a>
                </p>
              </td>
            </tr>
            
            <!-- Message de désabonnement -->
            <tr>
              <td style="padding: 20px; font-size: 14px; color: #666; background-color: #f8f9fa;">
                <p>Cet email vous a été envoyé car vous êtes impliqué dans ce projet. Si vous recevez cet email dans vos courriers indésirables, veuillez le marquer comme "Non indésirable" ou ajouter notre adresse à vos contacts.</p>
                <p style="margin-bottom: 0;">
                  <a href="mailto:unsubscribe@${process.env.EMAIL_DOMAIN || 'votredomaine.com'}?subject=Unsubscribe&body=Please%20unsubscribe%20me%20from%20project%20notifications" style="color: #2196F3; text-decoration: none;">
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
    const textContent = `
${statusMessage}

Bonjour,

Le statut du projet "${project.name}" a été mis à jour.

Statut: ${newStatus === 'approved' ? 'Approuvé' : newStatus === 'rejected' ? 'Non retenu' : newStatus === 'pending_changes' ? 'Modifications requises' : 'Mis à jour'}

${project.reviewedBy && project.reviewedBy.comments ? `\nCommentaires de l'évaluateur :\n${project.reviewedBy.comments}\n` : ''}

Détails du projet:
- Nom: ${project.name}
- Description: ${project.description}
- Technologies: ${project.technologies.join(', ')}
- Nombre d'étudiant(s): ${project.studentCount}
- Nombre de crédit(s) : ${project.credits}

Pour voir les détails du projet, visitez: ${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard

---
Cet email vous a été envoyé car vous êtes impliqué dans ce projet.
Pour vous désabonner, contactez-nous à unsubscribe@${process.env.EMAIL_DOMAIN || 'votredomaine.com'}.

{EPITECH} Nice<br>
131 Boulevard René Cassin<br>
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
          value: 'project_notification'
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
    
    console.log('Email envoyé avec succès, ID:', data.id);
    return { success: true, messageId: data.id };
  } catch (error) {
    console.error('Erreur lors de l\'envoi de l\'email:', error);
    throw error;
  }
};