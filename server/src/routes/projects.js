// routes/projects.js
const express = require('express');
const router = express.Router();
const { authenticateToken, isAdmin } = require('../middleware/auth');
const projectController = require('../controllers/projectController');

// Routes pour les étudiants
router.post('/', authenticateToken, projectController.createProject);
router.get('/me', authenticateToken, projectController.getUserProjects);
router.get('/:id', authenticateToken, projectController.getProjectById);
router.patch('/:id/additional-info', authenticateToken, projectController.updateAdditionalInfo);
router.put('/:id', authenticateToken, projectController.updateProject);
router.delete('/:id', authenticateToken, projectController.deleteProject);
router.post('/:id/leave', authenticateToken, projectController.leaveProject);

// Routes pour les administrateurs
router.get('/', authenticateToken, isAdmin, projectController.getAllProjects);
router.patch('/:id/review', authenticateToken, isAdmin, projectController.reviewProject);
router.patch('/:id/request-changes', authenticateToken, isAdmin, projectController.requestChanges);
router.patch('/:id/complete', authenticateToken, isAdmin, projectController.completeProject);

module.exports = router;