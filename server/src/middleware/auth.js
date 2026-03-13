// middleware/auth.js
const jwt = require('jsonwebtoken');
const config = require('../config/auth');
const User = require('../models/User');

const ErrorResponse = require("../utils/errorResponse");
const asyncHandler = require("./asyncHandler");

exports.authenticateToken = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return next(new ErrorResponse('Authentification requise', 401));
  }
  
  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    const user = await User.findById(decoded.id);
    
    if (!user) {
      return next(new ErrorResponse('Utilisateur non trouvé', 401));
    }
    
    req.user = user;
    next();
  } catch (error) {
    return next(new ErrorResponse('Token invalide', 401));
  }
});

exports.isAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    return next();
  }
  return next(new ErrorResponse('Accès refusé. Droits administrateur requis.', 403));
};
