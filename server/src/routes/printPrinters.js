const express = require('express');
const router = express.Router();
const { authenticateToken, isAdmin } = require('../middleware/auth');
const printerController = require('../controllers/print/printerController');

router.get('/', authenticateToken, printerController.listPrinters);
router.post('/', authenticateToken, isAdmin, printerController.createPrinter);
router.post('/:id/regenerate-key', authenticateToken, isAdmin, printerController.regenerateKey);

module.exports = router;
