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
    let htmlContent = '';
    
    switch (newStatus) {
      case 'approved':
        subject = `Projet approuvé : ${project.name}`;
        htmlContent = `
          <h1>Projet approuvé</h1>
          <p>Félicitations ! Votre projet <strong>${project.name}</strong> a été approuvé.</p>
        `;
        break;
      
      case 'rejected':
        subject = `Projet refusé : ${project.name}`;
        htmlContent = `
          <h1>Projet refusé</h1>
          <p>Nous regrettons de vous informer que votre projet <strong>${project.name}</strong> a été refusé.</p>
        `;
        break;
      
      case 'pending_changes':
        subject = `Modifications requises : ${project.name}`;
        htmlContent = `
          <h1>Modifications requises</h1>
          <p>Des modifications sont requises pour votre projet <strong>${project.name}</strong>.</p>
        `;
        break;
      
      default:
        subject = `Mise à jour du projet : ${project.name}`;
        htmlContent = `
          <h1>Mise à jour du projet</h1>
          <p>Le statut de votre projet <strong>${project.name}</strong> a été mis à jour.</p>
        `;
    }
    
    // Ajouter les commentaires s'ils existent
    if (project.reviewedBy && project.reviewedBy.comments) {
      htmlContent += `
        <div style="background-color: #f5f5f5; padding: 15px; border-left: 4px solid #0066cc; margin: 20px 0;">
          <h3>Commentaires de l'évaluateur :</h3>
          <p>${project.reviewedBy.comments.replace(/\n/g, '<br>')}</p>
        </div>
      `;
    }
    
    // Ajouter un lien vers le tableau de bord
    htmlContent += `
      <p>Vous pouvez consulter les détails du projet sur <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard">votre tableau de bord</a>.</p>
      <p>Cordialement,<br>L'équipe Hub Projets</p>
    `;
    
    // Envoyer l'email via Resend
    console.log(`Envoi d'email à ${recipients.length} destinataires...`);
    
    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'Hub Projets <onboarding@resend.dev>',
      to: recipients,
      subject: subject,
      html: htmlContent,
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