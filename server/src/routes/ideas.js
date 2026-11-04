// routes/ideas.js
const express = require('express');
const router = express.Router();
const { authenticateToken, isAdmin } = require('../middleware/auth');
const {
  loadIdea,
  requireAcceptedMember,
  requireCreator,
  requireWritable,
} = require('../middleware/ideaAccess');
const ideaUpload = require('../middleware/ideaUpload');
const ideaController = require('../controllers/ideation/ideaController');
const fileController = require('../controllers/ideation/fileController');
const linkController = require('../controllers/ideation/linkController');
const memberController = require('../controllers/ideation/memberController');
const adminController = require('../controllers/ideation/adminController');
const rosterController = require('../controllers/ideation/rosterController');
const rosterUpload = require('../middleware/rosterUpload');

// Toutes les routes exigent une authentification
router.use(authenticateToken);

// Routes statiques : à déclarer AVANT les routes paramétrées (/:id)
// (les tâches suivantes ajoutent /admin..., /admin/export, etc. dans ce bloc)
router.get('/settings', ideaController.getSettings);
router.get('/hashtags', ideaController.suggestHashtags);
router.get('/me', ideaController.getMine);

// Bloc admin statique : TOUS les chemins fixes /admin/... ici, avant /admin/:id (R4)
// (les tâches suivantes y ajoutent /admin/export, /admin/purge, /admin/roster...)
router.get('/admin', isAdmin, adminController.listAdmin);
router.get('/admin/export', isAdmin, adminController.exportDecks);
router.put('/admin/deadline', isAdmin, adminController.setDeadline);
router.delete('/admin/purge', isAdmin, adminController.purge);

// Liste de la promotion (CSV, en mémoire) : admin seulement, jamais exposée aux étudiants
router.post('/admin/roster/preview', isAdmin, rosterUpload, rosterController.preview);
router.get('/admin/roster/without-project', isAdmin, rosterController.withoutProject);
router.post('/admin/roster', isAdmin, rosterUpload, rosterController.importRoster);
router.delete('/admin/roster', isAdmin, rosterController.clearRoster);

// Admin paramétré : suivi, masquage, suppression, modération
router.patch('/admin/:id/hide', isAdmin, adminController.hideIdea);
router.patch('/admin/:id/unlock', isAdmin, adminController.unlockIdea);
router.put('/admin/:id', isAdmin, adminController.moderateIdea);
router.delete('/admin/:id', isAdmin, adminController.deleteIdea);
router.delete('/admin/:id/logo', isAdmin, adminController.clearLogo);
router.delete('/admin/:id/deck', isAdmin, adminController.clearDeck);
router.put('/admin/:id/links/:linkId', isAdmin, adminController.updateLink);
router.delete('/admin/:id/links/:linkId', isAdmin, adminController.removeLink);

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

// Groupe et invitations : l'invité répond via son entrée en attente (contrôlée dans le contrôleur)
router.post('/:id/members', loadIdea, requireCreator, requireWritable, memberController.inviteMember);
router.delete('/:id/members/:userId', loadIdea, requireWritable, memberController.removeMember);
router.post('/:id/invitation/accept', loadIdea, requireWritable, memberController.acceptInvitation);
router.post('/:id/invitation/decline', loadIdea, requireWritable, memberController.declineInvitation);

module.exports = router;
