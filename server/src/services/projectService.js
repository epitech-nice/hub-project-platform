/**
 * Formats a list of completed projects into a CSV string,
 * aggregating credits and project counts by student email.
 *
 * @param {Array} projects - List of lean Mongoose project documents
 * @returns {string} - The formatted CSV content
 */
exports.formatCompletedProjectsForCSV = (projects) => {
  // Créer un objet pour agréger les crédits par email
  const emailCreditsMap = {};

  // Parcourir tous les projets et leurs emails d'étudiants
  projects.forEach((project) => {
    const projectCredits = project.credits || 0;
    let emails = [];

    // Si studentCount est 1, utiliser l'email de submittedBy
    if (project.studentCount === 1) {
      if (project.submittedBy && project.submittedBy.email) {
        emails = [project.submittedBy.email];
      }
    } else {
      // Sinon, utiliser studentEmails
      emails = project.studentEmails || [];
    }

    emails.forEach((email) => {
      if (email && email.trim()) {
        const normalizedEmail = email.trim().toLowerCase();
        if (!emailCreditsMap[normalizedEmail]) {
          emailCreditsMap[normalizedEmail] = {
            originalEmail: email.trim(),
            totalCredits: 0,
            projectCount: 0,
          };
        }
        emailCreditsMap[normalizedEmail].totalCredits += projectCredits;
        if (projectCredits > 0) {
          emailCreditsMap[normalizedEmail].projectCount += 1;
        }
      }
    });
  });

  // Générer les lignes CSV
  const csvHeader = "login;grade;credits;number project\n";
  const csvRows = Object.values(emailCreditsMap)
    .map(({ originalEmail, totalCredits, projectCount }) => {
      const grade = totalCredits > 0 ? "Acquis" : "-";
      return `${originalEmail};${grade};${totalCredits};${projectCount}`;
    })
    .join("\n");

  return csvHeader + csvRows;
};
