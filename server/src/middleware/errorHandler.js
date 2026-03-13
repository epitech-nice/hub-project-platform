const ErrorResponse = require('../utils/errorResponse');

const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log to console for dev
  console.error(err.stack);

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = 'Ressource non trouvée';
    error = new ErrorResponse(message, 404);
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const message = 'Valeur dupliquée entrée';
    error = new ErrorResponse(message, 400);
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message);
    error = new ErrorResponse(message, 400);
  }

  // Erreur de token JWT
  if (err.name === 'JsonWebTokenError') {
    const message = 'Token invalide. Veuillez vous reconnecter.';
    error = new ErrorResponse(message, 401);
  }

  // Token expiré
  if (err.name === 'TokenExpiredError') {
    const message = 'Token expiré. Veuillez vous reconnecter.';
    error = new ErrorResponse(message, 401);
  }

  res.status(error.statusCode || 500).json({
    success: false,
    error: error.message || 'Erreur Serveur'
  });
};

module.exports = errorHandler;
