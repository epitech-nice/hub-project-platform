const PrintAccessRequest = require('../../models/PrintAccessRequest');
const User = require('../../models/User');
const asyncHandler = require('../../middleware/asyncHandler');
const emailService = require('../../services/emailService');
const { PRINT_ACCESS_REQUEST_STATUSES } = require('../../utils/constants');

// POST /api/print/access-requests
// Idempotent : renvoie la demande pending existante plutôt que d'en recréer une.
exports.createAccessRequest = asyncHandler(async (req, res) => {
  const existing = await PrintAccessRequest.findOne({
    'student.email': req.user.email.toLowerCase(),
    status: PRINT_ACCESS_REQUEST_STATUSES.PENDING,
  });
  if (existing) {
    return res.status(200).json({ success: true, data: existing });
  }

  const accessRequest = await PrintAccessRequest.create({
    student: { userId: req.user._id, name: req.user.name, email: req.user.email.toLowerCase() },
  });

  // Email non-bloquant
  try {
    const admins = await User.find({ role: 'admin' }, 'email').lean();
    const adminEmails = admins.map((a) => a.email).filter(Boolean);
    if (adminEmails.length > 0) {
      await emailService.sendPrintAccessRequestEmail(accessRequest, adminEmails);
    }
  } catch (err) {
    console.error('Erreur envoi email demande accès impression (non-bloquant):', err);
  }

  res.status(201).json({ success: true, data: accessRequest });
});

// GET /api/print/access-requests
exports.listAccessRequests = asyncHandler(async (req, res) => {
  const requests = await PrintAccessRequest.find({ status: PRINT_ACCESS_REQUEST_STATUSES.PENDING })
    .sort({ requestedAt: 1 });
  res.status(200).json({ success: true, count: requests.length, data: requests });
});
