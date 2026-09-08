const fs = require('fs');
const Printer = require('../../models/Printer');
const PrintJob = require('../../models/PrintJob');
const PrintAuthorization = require('../../models/PrintAuthorization');
const asyncHandler = require('../../middleware/asyncHandler');
const ErrorResponse = require('../../utils/errorResponse');
const {
  PRINTER_STATUSES,
  PRINTER_STATUS_SOURCES,
  PRINT_JOB_STATUSES,
  PRINT_REJECTION_REASONS,
} = require('../../utils/constants');

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

// POST /api/print/jobs/:id/cancel
exports.cancelJob = asyncHandler(async (req, res, next) => {
  const job = await PrintJob.findById(req.params.id);
  if (!job) return next(new ErrorResponse('Job non trouvé', 404));

  const isOwner = job.student.email === req.user.email.toLowerCase();
  if (req.user.role !== 'admin' && !isOwner) {
    return next(new ErrorResponse('Vous ne pouvez annuler que vos propres impressions', 403));
  }

  const cancelledBy = { email: req.user.email.toLowerCase(), role: req.user.role };

  if (job.status === PRINT_JOB_STATUSES.QUEUED) {
    // Verrou atomique symétrique à celui de submitJob : ne réussit que si le job est encore
    // 'queued' au moment de l'écriture. Empêche une course avec getNextJob (qui fait passer le
    // job en 'sent' de façon atomique) — si l'agent a déjà récupéré le job entre notre lecture
    // et cette écriture, ce findOneAndUpdate ne trouve plus rien et on renvoie 409 plutôt que
    // d'annuler un job que l'agent croit désormais devoir imprimer.
    const cancelled = await PrintJob.findOneAndUpdate(
      { _id: job._id, status: PRINT_JOB_STATUSES.QUEUED },
      {
        status: PRINT_JOB_STATUSES.CANCELLED,
        cancelledBy,
        $push: {
          history: { status: PRINT_JOB_STATUSES.CANCELLED, date: new Date(), detail: 'Annulée avant impression' },
        },
      },
      { new: true }
    );

    if (!cancelled) {
      return next(new ErrorResponse("Ce job vient de partir à l'imprimante, réessayez", 409));
    }

    // Ne libère l'imprimante que si elle pointe encore réellement sur ce job — un admin a pu la
    // désactiver entre-temps (setDisabled met currentJob à null sans toucher au job lui-même),
    // auquel cas la repasser 'idle' ici annulerait silencieusement l'action de l'admin.
    const printer = await Printer.findOne({ _id: job.printer, currentJob: job._id });
    if (printer) {
      printer.status = PRINTER_STATUSES.IDLE;
      printer.currentJob = null;
      printer.statusHistory.push({
        status: PRINTER_STATUSES.IDLE,
        // Aucune source de PRINTER_STATUS_SOURCES ne correspond exactement à "un étudiant ou un
        // admin annule un job en attente" (agent_report/heartbeat_timeout sont hors sujet ici) ;
        // admin_action est la plus proche sémantiquement (transition déclenchée par un humain,
        // pas par l'agent ni un timeout) — réutilisée pour les deux cas plutôt que d'ajouter une
        // valeur d'enum non prévue par le modèle de données existant.
        source: PRINTER_STATUS_SOURCES.ADMIN_ACTION,
        detail: 'Job annulé avant impression',
        byUserId: req.user._id,
        byName: req.user.name,
        date: new Date(),
      });
      await printer.save();
    }

    return res.status(200).json({ success: true, data: cancelled });
  }

  if ([PRINT_JOB_STATUSES.SENT, PRINT_JOB_STATUSES.PRINTING].includes(job.status)) {
    if (job.cancelRequestedAt) {
      return res.status(202).json({ success: true, data: job });
    }
    job.cancelRequestedAt = new Date();
    job.cancelledBy = cancelledBy;
    job.history.push({ status: job.status, date: new Date(), detail: 'Annulation demandée' });
    await job.save();
    return res.status(202).json({ success: true, data: job });
  }

  return next(new ErrorResponse('Ce job ne peut plus être annulé', 400));
});
