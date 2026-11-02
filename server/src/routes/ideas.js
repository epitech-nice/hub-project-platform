// routes/ideas.js
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  loadIdea,
  requireAcceptedMember,
  requireWritable,
} = require('../middleware/ideaAccess');
const ideaUpload = require('../middleware/ideaUpload');
const ideaController = require('../controllers/ideation/ideaController');
const fileController = require('../controllers/ideation/fileController');
const linkController = require('../controllers/ideation/linkController');

// Toutes les routes exigent une authentification
router.use(authenticateToken);

// Routes statiques : à déclarer AVANT les routes paramétrées (/:id)
// (les tâches suivantes ajoutent /admin..., /admin/export, etc. dans ce bloc)
router.get('/settings', ideaController.getSettings);
router.get('/hashtags', ideaController.suggestHashtags);
router.get('/me', ideaController.getMine);

router.get('/', ideaController.listIdeas);
router.post('/', ideaController.createIdea);

// Routes paramétrées
router.get('/:id', loadIdea, ideaController.getIdea);
router.put('/:id', loadIdea, requireAcceptedMember, requireWritable, ideaController.updateIdea);

// Le dossier de stockage vient toujours de l'_id en minuscules, jamais de l'URL brute
const canonicalId = (req, res, next) => {
  req.params.id = req.idea._id.toString();
  next();
};

// Fichiers versionnés : l'upload ne démarre qu'après les contrôles d'accès (R2), rien n'est écrit sinon
router.post('/:id/logo', loadIdea, requireAcceptedMember, requireWritable, canonicalId, ideaUpload('logo'), fileController.uploadLogo);
router.post('/:id/deck', loadIdea, requireAcceptedMember, requireWritable, canonicalId, ideaUpload('deck'), fileController.uploadDeck);
router.get('/:id/:kind(logo|deck)/:version?', loadIdea, fileController.downloadFile);

// Liens du jour 2
router.post('/:id/links', loadIdea, requireAcceptedMember, requireWritable, linkController.addLink);
router.delete('/:id/links/:linkId', loadIdea, requireAcceptedMember, requireWritable, linkController.removeLink);

module.exports = router;
