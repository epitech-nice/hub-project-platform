// routes/tools.js
const express = require('express');
const router = express.Router();
const { authenticateToken, isAdmin } = require('../middleware/auth');
const { toolValidationRules, bulkImportValidationRules, validate } = require('../middleware/validators');
const {
  getAllTools,
  getAllTags,
  getToolById,
  createTool,
  updateTool,
  deleteTool,
  bulkImport,
  exportInventoryCSV,
} = require('../controllers/toolController');

// IMPORTANT : routes spécifiques avant /:id pour éviter les collisions de nommage
router.get('/tags', authenticateToken, getAllTags);
router.get('/export/csv', authenticateToken, isAdmin, exportInventoryCSV);
router.post('/bulk-import', authenticateToken, isAdmin, bulkImportValidationRules(), validate, bulkImport);

// Routes accessibles aux utilisateurs authentifiés (students + admin)
router.get('/', authenticateToken, getAllTools);
router.get('/:id', authenticateToken, getToolById);

// Routes admin uniquement
router.post('/', authenticateToken, isAdmin, toolValidationRules(), validate, createTool);
router.put('/:id', authenticateToken, isAdmin, toolValidationRules(), validate, updateTool);
router.delete('/:id', authenticateToken, isAdmin, deleteTool);

module.exports = router;
