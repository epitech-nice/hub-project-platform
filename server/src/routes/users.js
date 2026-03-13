// Dans server/src/routes/users.js (à créer si ce n'est pas déjà fait)
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');

const asyncHandler = require('../middleware/asyncHandler');

// Route pour récupérer les informations de l'utilisateur connecté
router.get('/me', authenticateToken, asyncHandler(async (req, res) => {
  // req.user contient l'utilisateur authentifié (défini par le middleware authenticateToken)
  res.status(200).json({ 
    success: true, 
    data: {
      _id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role
    } 
  });
}));

module.exports = router;