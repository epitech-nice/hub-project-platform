// routes/projects.js
const express = require('express');
const router = express.Router();
const { authenticateToken, isAdmin } = require('../middleware/auth');
const projectController = require('../controllers/projectController');
const { projectValidationRules, validate } = require('../middleware/validators');

// Routes statiques avant /:id pour éviter les conflits de route
router.get('/validate-github', authenticateToken, projectController.validateGithubRepo);
router.get('/stats', authenticateToken, isAdmin, projectController.getProjectStats);
router.get('/me', authenticateToken, projectController.getUserProjects);
router.get('/export/completed-csv', authenticateToken, isAdmin, projectController.exportCompletedProjectsCSV);

// Routes pour les étudiants
router.post('/', authenticateToken, projectValidationRules(), validate, projectController.createProject);
router.get('/:id', authenticateToken, projectController.getProjectById);
router.patch('/:id/additional-info', authenticateToken, projectController.updateAdditionalInfo);
router.put('/:id', authenticateToken, projectValidationRules(), validate, projectController.updateProject);
router.delete('/:id', authenticateToken, projectController.deleteProject);
router.post('/:id/leave', authenticateToken, projectController.leaveProject);

// Routes pour les administrateurs
router.get('/', authenticateToken, isAdmin, projectController.getAllProjects);
router.patch('/:id/review', authenticateToken, isAdmin, projectController.reviewProject);
router.patch('/:id/request-changes', authenticateToken, isAdmin, projectController.requestChanges);
router.patch('/:id/complete', authenticateToken, isAdmin, projectController.completeProject);

module.exports = router;