const express = require('express');
const router = express.Router();
const { authenticatePrinter } = require('../middleware/printerAuth');
const agentController = require('../controllers/print/agentController');

router.get('/next-job', authenticatePrinter, agentController.getNextJob);

module.exports = router;
