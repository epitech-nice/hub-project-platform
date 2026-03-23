const errorHandler = require('../../middleware/errorHandler');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('errorHandler middleware', () => {
  let res, next;

  beforeEach(() => {
    res = mockRes();
    next = jest.fn();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    console.error.mockRestore();
  });

  it('returns 500 for a generic error', () => {
    const err = new Error('something broke');
    errorHandler(err, {}, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'something broke' });
  });

  it('returns 404 for a Mongoose CastError (bad ObjectId)', () => {
    const err = new Error('Cast to ObjectId failed');
    err.name = 'CastError';
    errorHandler(err, {}, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Ressource non trouvée' });
  });

  it('returns 400 for a Mongoose duplicate key error', () => {
    const err = new Error('Duplicate key');
    err.code = 11000;
    errorHandler(err, {}, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Valeur dupliquée entrée' });
  });

  it('returns 400 for a Mongoose ValidationError', () => {
    const err = new Error('Validation failed');
    err.name = 'ValidationError';
    err.errors = {
      name: { message: 'Le nom est requis' },
      email: { message: "L'email est invalide" },
    };
    errorHandler(err, {}, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    // Error.super(array) convertit le tableau en string "msg1,msg2"
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "Le nom est requis,L'email est invalide",
    });
  });

  it('returns 401 for an invalid JWT', () => {
    const err = new Error('invalid token');
    err.name = 'JsonWebTokenError';
    errorHandler(err, {}, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Token invalide. Veuillez vous reconnecter.',
    });
  });

  it('returns 401 for an expired JWT', () => {
    const err = new Error('jwt expired');
    err.name = 'TokenExpiredError';
    errorHandler(err, {}, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Token expiré. Veuillez vous reconnecter.',
    });
  });

  it('uses the statusCode from ErrorResponse', () => {
    const ErrorResponse = require('../../utils/errorResponse');
    const err = new ErrorResponse('Accès refusé', 403);
    errorHandler(err, {}, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Accès refusé' });
  });
});
