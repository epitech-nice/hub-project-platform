const fs = require('fs');
const Printer = require('../../models/Printer');
const PrintJob = require('../../models/PrintJob');
const PrintAuthorization = require('../../models/PrintAuthorization');
const asyncHandler = require('../../middleware/asyncHandler');
const ErrorResponse = require('../../utils/errorResponse');
const { PRINTER_STATUSES, PRINT_JOB_STATUSES, PRINT_REJECTION_REASONS } = require('../../utils/constants');

const REJECTION_MESSAGES = {
  [PRINT_REJECTION_REASONS.NOT_AUTHORIZED]: "Vous n'êtes pas autorisé à soumettre une impression",
  [PRINT_REJECTION_REASONS.PRINTER_BUSY]: 'Cette imprimante est occupée',
  [PRINT_REJECTION_REASONS.PRINTER_OFFLINE]: 'Cette imprimante est injoignable',
  [PRINT_REJECTION_REASONS.PRINTER_ERROR]: 'Cette imprimante signale une erreur',
  [PRINT_REJECTION_REASONS.PRINTER_DISABLED]: 'Cette imprimante est désactivée',
};

const STATUS_TO_REJECTION_REASON = {
  [PRINTER_STATUSES.PRINTING]: PRINT_REJECTION_REASONS.PRINTER_BUSY,
  [PRINTER_STATUSES.AWAITING_CLEARANCE]: PRINT_REJECTION_REASONS.PRINTER_BUSY,
  [PRINTER_STATUSES.OFFLINE]: PRINT_REJECTION_REASONS.PRINTER_OFFLINE,
  [PRINTER_STATUSES.ERROR]: PRINT_REJECTION_REASONS.PRINTER_ERROR,
  [PRINTER_STATUSES.DISABLED]: PRINT_REJECTION_REASONS.PRINTER_DISABLED,
};

// Crée un PrintJob rejeté (avant tout verrouillage de l'imprimante) et nettoie le fichier uploadé.
const rejectSubmission = async (req, next, printer, reason) => {
  fs.unlink(req.file.path, () => {});
  await PrintJob.create({
    student: { email: req.user.email.toLowerCase(), name: req.user.name },
    printer: printer._id,
    fileName: req.file.originalname,
    filePath: req.file.path,
    status: PRINT_JOB_STATUSES.REJECTED,
    rejectionReason: reason,
    history: [{ status: PRINT_JOB_STATUSES.REJECTED, date: new Date(), detail: REJECTION_MESSAGES[reason] }],
  });
  const statusCode = reason === PRINT_REJECTION_REASONS.NOT_AUTHORIZED ? 403 : 409;
  return next(new ErrorResponse(REJECTION_MESSAGES[reason], statusCode));
};

// POST /api/print/jobs
// multipart form: printerId, file
exports.submitJob = asyncHandler(async (req, res, next) => {
  if (!req.file) return next(new ErrorResponse('Fichier .gcode requis', 400));

  const { printerId } = req.body;
  const printer = await Printer.findById(printerId);
  if (!printer) {
    fs.unlink(req.file.path, () => {});
    return next(new ErrorResponse('Imprimante non trouvée', 404));
  }

  const authorization = await PrintAuthorization.findOne({ email: req.user.email.toLowerCase() });
  if (!authorization || !authorization.authorized) {
    return rejectSubmission(req, next, printer, PRINT_REJECTION_REASONS.NOT_AUTHORIZED);
  }

  if (printer.status !== PRINTER_STATUSES.IDLE) {
    const reason = STATUS_TO_REJECTION_REASON[printer.status] || PRINT_REJECTION_REASONS.PRINTER_OFFLINE;
    return rejectSubmission(req, next, printer, reason);
  }

  const job = await PrintJob.create({
    student: { email: req.user.email.toLowerCase(), name: req.user.name },
    printer: printer._id,
    fileName: req.file.originalname,
    filePath: req.file.path,
    history: [{ status: PRINT_JOB_STATUSES.QUEUED, date: new Date(), detail: 'Soumission acceptée' }],
  });

  // Verrou atomique : ne réussit que si le statut est encore 'idle' au moment de l'écriture,
  // ce qui empêche deux soumissions simultanées de passer toutes les deux la vérification ci-dessus.
  // Le job est créé AVANT cette tentative de verrou : si le verrou échoue, on le repasse en
  // 'rejected' plutôt que de le laisser 'queued' sans imprimante réellement réservée.
  const locked = await Printer.findOneAndUpdate(
    { _id: printer._id, status: PRINTER_STATUSES.IDLE },
    { status: PRINTER_STATUSES.PRINTING, currentJob: job._id }
  );

  if (!locked) {
    fs.unlink(job.filePath, () => {});
    job.status = PRINT_JOB_STATUSES.REJECTED;
    job.rejectionReason = PRINT_REJECTION_REASONS.PRINTER_BUSY;
    job.history.push({
      status: PRINT_JOB_STATUSES.REJECTED,
      date: new Date(),
      detail: REJECTION_MESSAGES[PRINT_REJECTION_REASONS.PRINTER_BUSY],
    });
    await job.save();
    return next(new ErrorResponse(REJECTION_MESSAGES[PRINT_REJECTION_REASONS.PRINTER_BUSY], 409));
  }

  res.status(201).json({ success: true, data: job });
});

// GET /api/print/jobs/me
exports.getMyJobs = asyncHandler(async (req, res) => {
  const jobs = await PrintJob.find({ 'student.email': req.user.email.toLowerCase() }).sort({ submittedAt: -1 });
  res.status(200).json({ success: true, count: jobs.length, data: jobs });
});

// GET /api/print/jobs?status=&printerId=
exports.getAllJobs = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.printerId) filter.printer = req.query.printerId;

  const jobs = await PrintJob.find(filter).sort({ submittedAt: -1 });
  res.status(200).json({ success: true, count: jobs.length, data: jobs });
});

// GET /api/print/jobs/:id
exports.getJobById = asyncHandler(async (req, res, next) => {
  const job = await PrintJob.findById(req.params.id);
  if (!job) return next(new ErrorResponse('Job non trouvé', 404));
  res.status(200).json({ success: true, data: job });
});
