const ToolReport = require('../models/ToolReport');
const Tool = require('../models/Tool');
const User = require('../models/User');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middleware/asyncHandler');
const { REPORT_STATUS } = require('../utils/constants');
const emailService = require('../services/emailService');

// POST /api/tools/:id/report — tout utilisateur authentifié
exports.createReport = asyncHandler(async (req, res, next) => {
  const tool = await Tool.findById(req.params.id).lean();
  if (!tool) return next(new ErrorResponse('Outil non trouvé', 404));

  const { category, message } = req.body;

  const report = await ToolReport.create({
    tool: tool._id,
    student: {
      userId: req.user._id,
      name:   req.user.name,
      email:  req.user.email,
    },
    category,
    message: message || undefined,
  });

  // Email non-bloquant
  try {
    const admins = await User.find({ role: 'admin' }, 'email').lean();
    const adminEmails = admins.map((a) => a.email).filter(Boolean);
    if (adminEmails.length > 0) {
      await emailService.sendToolReportEmail(tool, report, req.user, adminEmails);
    }
  } catch (err) {
    console.error('Erreur envoi email signalement (non-bloquant):', err);
  }

  res.status(201).json({ success: true, data: report });
});

// GET /api/tools/:id/reports — admin uniquement
exports.getReports = asyncHandler(async (req, res, next) => {
  const tool = await Tool.findById(req.params.id).lean();
  if (!tool) return next(new ErrorResponse('Outil non trouvé', 404));

  const reports = await ToolReport.find({ tool: req.params.id })
    .sort({ createdAt: -1 })
    .lean();

  res.status(200).json({ success: true, data: reports });
});

// PATCH /api/tools/:id/reports/:reportId/resolve — admin uniquement
exports.resolveReport = asyncHandler(async (req, res, next) => {
  const report = await ToolReport.findOne({
    _id:  req.params.reportId,
    tool: req.params.id,
  });

  if (!report) return next(new ErrorResponse('Signalement non trouvé', 404));

  if (report.status === REPORT_STATUS.RESOLVED) {
    return next(new ErrorResponse('Ce signalement est déjà résolu', 400));
  }

  report.status      = REPORT_STATUS.RESOLVED;
  report.resolvedBy  = { userId: req.user._id, name: req.user.name };
  report.resolvedAt  = new Date();
  if (req.body.resolveMessage) report.resolveMessage = req.body.resolveMessage;

  await report.save();

  res.status(200).json({ success: true, data: report });
});
