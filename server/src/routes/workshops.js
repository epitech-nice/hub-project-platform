// routes/workshops.js
const express = require('express');
const router = express.Router();
const { authenticateToken, isAdmin } = require('../middleware/auth');
const workshopController = require('../controllers/workshopController');

// Routes pour les étudiants
router.post('/', authenticateToken, workshopController.createWorkshop);
router.get('/me', authenticateToken, workshopController.getUserWorkshops);
router.get('/:id', authenticateToken, workshopController.getWorkshopById);
router.put('/:id', authenticateToken, workshopController.updateWorkshop);
router.delete('/:id', authenticateToken, workshopController.deleteWorkshop);
router.post('/:id/leave', authenticateToken, workshopController.leaveWorkshop);

// Routes pour les administrateurs
router.get('/', authenticateToken, isAdmin, workshopController.getAllWorkshops);
router.patch('/:id/review', authenticateToken, isAdmin, workshopController.reviewWorkshop);
router.patch('/:id/request-changes', authenticateToken, isAdmin, workshopController.requestChanges);
router.patch('/:id/complete', authenticateToken, isAdmin, workshopController.completeWorkshop);

module.exports = router;