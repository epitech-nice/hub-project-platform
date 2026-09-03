const express = require('express');
const router = express.Router();
const { authenticateToken, isAdmin } = require('../middleware/auth');
const printerController = require('../controllers/print/printerController');

router.get('/', authenticateToken, printerController.listPrinters);
router.post('/', authenticateToken, isAdmin, printerController.createPrinter);
router.post('/:id/regenerate-key', authenticateToken, isAdmin, printerController.regenerateKey);
router.patch('/:id/disabled', authenticateToken, isAdmin, printerController.setDisabled);
router.get('/:id/qr', authenticateToken, isAdmin, printerController.getQrCode);
router.post('/:id/confirm-clearance', authenticateToken, printerController.confirmClearance);
router.post('/:id/confirm-clearance/override', authenticateToken, isAdmin, printerController.confirmClearanceOverride);

module.exports = router;
