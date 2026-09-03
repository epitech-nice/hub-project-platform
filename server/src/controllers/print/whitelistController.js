const PrintAuthorization = require('../../models/PrintAuthorization');
const PrintAccessRequest = require('../../models/PrintAccessRequest');
const asyncHandler = require('../../middleware/asyncHandler');
const ErrorResponse = require('../../utils/errorResponse');
const { PRINT_ACCESS_REQUEST_STATUSES } = require('../../utils/constants');

// GET /api/print/whitelist
exports.listWhitelist = asyncHandler(async (req, res) => {
  const entries = await PrintAuthorization.find().sort({ email: 1 });
  res.status(200).json({ success: true, count: entries.length, data: entries });
});

// GET /api/print/whitelist/me
exports.getMyStatus = asyncHandler(async (req, res) => {
  const normalizedEmail = req.user.email.toLowerCase();
  const entry = await PrintAuthorization.findOne({ email: normalizedEmail });
  const pendingRequest = await PrintAccessRequest.findOne({
    'student.email': normalizedEmail,
    status: PRINT_ACCESS_REQUEST_STATUSES.PENDING,
  });

  res.status(200).json({
    success: true,
    data: {
      authorized: entry ? entry.authorized : null,
      hasPendingRequest: !!pendingRequest,
    },
  });
});

// POST /api/print/whitelist
// Body: { email, authorized, note }
exports.setAuthorization = asyncHandler(async (req, res, next) => {
  const { email, authorized, note } = req.body;
  if (!email || typeof authorized !== 'boolean') {
    return next(new ErrorResponse('email et authorized (booléen) sont requis', 400));
  }

  const normalizedEmail = email.trim().toLowerCase();
  let entry = await PrintAuthorization.findOne({ email: normalizedEmail });
  if (!entry) {
    entry = new PrintAuthorization({ email: normalizedEmail });
  }

  entry.authorized = authorized;
  entry.history.push({
    authorized,
    byUserId: req.user._id,
    byName: req.user.name,
    date: new Date(),
    note: note || '',
  });
  await entry.save();

  // Toute décision admin (autoriser ou blacklister) répond implicitement à une éventuelle demande en attente
  await PrintAccessRequest.updateMany(
    { 'student.email': normalizedEmail, status: PRINT_ACCESS_REQUEST_STATUSES.PENDING },
    { status: PRINT_ACCESS_REQUEST_STATUSES.RESOLVED, resolvedAt: new Date() }
  );

  res.status(200).json({ success: true, data: entry });
});
