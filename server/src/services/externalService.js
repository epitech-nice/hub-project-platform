// services/externalService.js
const axios = require('axios');

exports.sendExternalRequest = async (project) => {
  try {
    // Format des données à envoyer au service externe
    const payload = {
      projectId: project._id,
      name: project.name,
      description: project.description,
      objectives: project.objectives,
      technologies: project.technologies,
      studentCount: project.studentCount,
      submittedBy: {
        name: project.submittedBy.name,
        email: project.submittedBy.email
      },
      approvedBy: {
        name: project.reviewedBy.name,
        comments: project.reviewedBy.comments
      },
      approvedAt: new Date()
    };

    // Envoyer la requête au service externe
    const response = await axios.post(process.env.EXTERNAL_API_URL, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.EXTERNAL_API_KEY}`
      }
    });

    return response.data;
  } catch (error) {
    console.error('Erreur lors de l\'envoi de la requête externe:', error);
    throw error;
  }
};
