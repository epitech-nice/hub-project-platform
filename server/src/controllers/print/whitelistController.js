const PrintAuthorization = require('../../models/PrintAuthorization');
const asyncHandler = require('../../middleware/asyncHandler');
const ErrorResponse = require('../../utils/errorResponse');

// GET /api/print/whitelist
exports.listWhitelist = asyncHandler(async (req, res) => {
  const entries = await PrintAuthorization.find().sort({ email: 1 });
  res.status(200).json({ success: true, count: entries.length, data: entries });
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

  res.status(200).json({ success: true, data: entry });
});
