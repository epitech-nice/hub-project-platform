const express = require('express');
const router = express.Router();
const { authenticateToken, isAdmin } = require('../middleware/auth');
const accessRequestController = require('../controllers/print/accessRequestController');

router.post('/', authenticateToken, accessRequestController.createAccessRequest);
router.get('/', authenticateToken, isAdmin, accessRequestController.listAccessRequests);

module.exports = router;
