const express = require('express');
const router = express.Router();
const { authenticateToken, isAdmin } = require('../middleware/auth');
const whitelistController = require('../controllers/print/whitelistController');

router.get('/', authenticateToken, isAdmin, whitelistController.listWhitelist);
router.post('/', authenticateToken, isAdmin, whitelistController.setAuthorization);

module.exports = router;
