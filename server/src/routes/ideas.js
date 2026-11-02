// routes/ideas.js
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  loadIdea,
  requireAcceptedMember,
  requireWritable,
} = require('../middleware/ideaAccess');
const ideaController = require('../controllers/ideation/ideaController');

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

module.exports = router;
