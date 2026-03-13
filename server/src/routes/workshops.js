// routes/workshops.js
const express = require('express');
const router = express.Router();
const { authenticateToken, isAdmin } = require('../middleware/auth');
const { workshopValidationRules, validate } = require('../middleware/validators');
const workshopController = require('../controllers/workshopController');

// Routes pour les administrateurs (Création / Gestion)
router.post(
  '/', 
  authenticateToken, 
  isAdmin, 
  workshopValidationRules(), 
  validate, 
  workshopController.createWorkshop
);
router.get('/', authenticateToken, isAdmin, workshopController.getAllWorkshops);
router.get('/:id', authenticateToken, workshopController.getWorkshopById);
router.put(
  '/:id', 
  authenticateToken, 
  isAdmin, 
  workshopValidationRules(), 
  validate, 
  workshopController.updateWorkshop
);
router.delete('/:id', authenticateToken, isAdmin, workshopController.deleteWorkshop);

// Routes pour les étudiants (Participation)
router.get('/me', authenticateToken, workshopController.getUserWorkshops);
router.post('/:id/leave', authenticateToken, workshopController.leaveWorkshop);

// Routes pour les administrateurs
router.get('/', authenticateToken, isAdmin, workshopController.getAllWorkshops);
router.patch('/:id/review', authenticateToken, isAdmin, workshopController.reviewWorkshop);
router.patch('/:id/request-changes', authenticateToken, isAdmin, workshopController.requestChanges);
router.patch('/:id/complete', authenticateToken, isAdmin, workshopController.completeWorkshop);

module.exports = router;