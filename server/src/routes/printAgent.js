const express = require('express');
const router = express.Router();
const { authenticatePrinter } = require('../middleware/printerAuth');
const agentController = require('../controllers/print/agentController');

router.get('/next-job', authenticatePrinter, agentController.getNextJob);
router.get('/jobs/:id/file', authenticatePrinter, agentController.downloadJobFile);
router.post('/jobs/:id/status', authenticatePrinter, agentController.updateJobStatus);

module.exports = router;
