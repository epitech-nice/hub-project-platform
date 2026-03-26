const { check, validationResult } = require('express-validator');

// Validateur pour la création et la mise à jour des projets
exports.projectValidationRules = () => {
  return [
    check('name')
      .trim()
      .notEmpty().withMessage('Le nom du projet est requis')
      .isLength({ max: 100 }).withMessage('Le nom du projet ne doit pas dépasser 100 caractères'),

    check('description')
      .trim()
      .notEmpty().withMessage('La description est requise'),

    check('objectives')
      .trim()
      .notEmpty().withMessage('Les objectifs sont requis'),

    // validation basique des URLs GitHub
    check('links.github')
      .matches(/^https:\/\/github\.com\/[\w-]+\/[\w-]+.*$/)
      .withMessage('Le lien GitHub personnel doit être une URL GitHub valide'),

    check('links.projectGithub')
      .matches(/^https:\/\/github\.com\/[\w-]+\/[\w-]+.*$/)
      .withMessage('Le lien GitHub project doit être une URL GitHub valide'),

    // Si des emails étudiants sont fournis, vérifier qu'ils sont valides
    check('studentEmails')
      .optional()
      .isArray().withMessage('Les emails étudiants doivent être un tableau')
      .custom((emails) => {
        if (!emails) return true;
        for (const email of emails) {
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            throw new Error(`L'email ${email} est invalide`);
          }
        }
        return true;
      })
  ];
};

// Middleware de validation générique pour intercepter les erreurs
exports.validate = (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) {
    return next();
  }

  const extractedErrors = errors.array().map(err => ({
    field: err.param,
    message: err.msg
  }));

  // Message lisible résumant toutes les erreurs de validation
  const readableMessage = extractedErrors
    .map(e => e.message)
    .join(' | ');

  return res.status(400).json({
    success: false,
    message: readableMessage,
    errors: extractedErrors
  });
};

// Validateur pour la création et la mise à jour des Workshops
exports.workshopValidationRules = () => {
  return [
    check('title')
      .optional({ nullable: true, checkFalsy: true }) // optional car réutilisé pour PUT
      .trim()
      .notEmpty().withMessage('Le titre du workshop est requis')
      .isLength({ max: 100 }).withMessage('Le titre ne doit pas dépasser 100 caractères'),

    check('description')
      .optional({ nullable: true, checkFalsy: true })
      .trim()
      .notEmpty().withMessage('La description est requise'),

    check('maxParticipants')
      .optional({ nullable: true, checkFalsy: true })
      .isInt({ min: 1 }).withMessage('Le nombre maximum de participants doit être un entier positif'),

    check('date')
      .optional({ nullable: true, checkFalsy: true })
      .isISO8601().withMessage('La date doit être au format valide ISO 8601'),

    check('location')
      .optional({ nullable: true, checkFalsy: true })
      .trim()
      .notEmpty().withMessage('Le lieu (location) est requis')
  ];
};

// Validateur pour la création et la mise à jour des outils (inventaire)
exports.toolValidationRules = () => {
  return [
    check('name')
      .trim()
      .notEmpty().withMessage("Le nom de l'outil est requis")
      .isLength({ max: 100 }).withMessage('Le nom ne peut pas dépasser 100 caractères'),

    check('description')
      .optional({ nullable: true, checkFalsy: true })
      .trim()
      .isLength({ max: 500 }).withMessage('La description ne peut pas dépasser 500 caractères'),

    check('tags')
      .optional()
      .isArray().withMessage('Les tags doivent être un tableau')
      .custom((tags) => {
        if (!Array.isArray(tags)) return true;
        for (const tag of tags) {
          if (typeof tag !== 'string' || !tag.trim()) {
            throw new Error('Chaque tag doit être une chaîne de caractères non vide');
          }
        }
        return true;
      }),

    check('rfid')
      .optional({ nullable: true, checkFalsy: true })
      .trim()
      .matches(/^[A-Za-z0-9\-_]+$/).withMessage('Le code RFID ne doit contenir que des caractères alphanumériques, tirets ou underscores'),

    check('quantity')
      .optional({ nullable: true, checkFalsy: true })
      .isInt({ min: 0 }).withMessage('La quantité doit être un entier positif ou nul'),

    check('borrowedCount')
      .optional({ nullable: true, checkFalsy: true })
      .isInt({ min: 0 }).withMessage('La quantité empruntée doit être un entier positif ou nul'),

    check('status')
      .optional({ nullable: true, checkFalsy: true })
      .isIn(['available', 'borrowed', 'maintenance'])
      .withMessage("Statut invalide. Valeurs acceptées : available, borrowed, maintenance"),
  ];
};

// Validateur pour l'import RFID en lot
exports.bulkImportValidationRules = () => {
  return [
    check('rfids')
      .isArray({ min: 1 }).withMessage('Un tableau de codes RFID est requis')
      .custom((rfids) => {
        if (!Array.isArray(rfids)) return true;
        for (const rfid of rfids) {
          if (typeof rfid !== 'string' || !rfid.trim()) {
            throw new Error('Chaque code RFID doit être une chaîne non vide');
          }
        }
        return true;
      }),
  ];
};

// Validateur pour les Enrollments Simulated
exports.simulatedEnrollValidationRules = () => {
  return [
    check('projectId')
      .trim()
      .notEmpty().withMessage('Le projectId est requis'),

    check('githubProjectLink')
      .trim()
      .notEmpty().withMessage('Le lien GitHub Project est requis')
      .matches(/^https:\/\/github\.com\/.*$/)
      .withMessage('Le lien GitHub doit être une URL GitHub valide (projet ou repository)')
  ];
};
