// Dans server/src/routes/users.js (à créer si ce n'est pas déjà fait)
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');

const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const asyncHandler = require('../middleware/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const User = require('../models/User');
const { escapeRegex } = require('../utils/ideation');

const SEARCH_MIN = 3;
const SEARCH_LIMIT = 10;

// 30 recherches par minute et par utilisateur authentifié (annuaire des étudiants)
const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Trop de recherches, veuillez réessayer dans une minute.' },
  keyGenerator: (req) => (req.user ? String(req.user._id) : ipKeyGenerator(req.ip)),
});

// Recherche d'étudiants (invitations) : nom ou partie locale de l'email, jamais l'email complet
router.get('/search', authenticateToken, searchLimiter, asyncHandler(async (req, res) => {
  const { q } = req.query;
  if (typeof q !== 'string' || q.trim().length < SEARCH_MIN) {
    throw new ErrorResponse(`La recherche doit contenir au moins ${SEARCH_MIN} caractères`, 400);
  }

  const term = escapeRegex(q.trim());
  const users = await User.find({
    _id: { $ne: req.user._id },
    role: 'student',
    $or: [
      { name: new RegExp(term, 'i') },
      // Partie locale seulement : le texte précède le "@" (le domaine n'est jamais cherché)
      { email: new RegExp(`^[^@]*${term}[^@]*@`, 'i') },
    ],
  })
    .select('name email')
    .sort({ name: 1, _id: 1 })
    .limit(SEARCH_LIMIT);

  res.json({
    success: true,
    data: users.map((u) => ({ _id: u._id, name: u.name, login: String(u.email).split('@')[0] })),
  });
}));

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