const path = require('path');
const PrintJob = require('../../models/PrintJob');
const asyncHandler = require('../../middleware/asyncHandler');
const ErrorResponse = require('../../utils/errorResponse');
const { PRINTER_STATUSES, PRINTER_STATUS_SOURCES, PRINT_JOB_STATUSES } = require('../../utils/constants');

const VALID_STATUS_UPDATES = ['printing', 'completed', 'failed'];

const TERMINAL_JOB_STATUSES = [
  PRINT_JOB_STATUSES.COMPLETED,
  PRINT_JOB_STATUSES.FAILED,
  PRINT_JOB_STATUSES.CANCELLED,
  PRINT_JOB_STATUSES.REJECTED,
];

// GET /api/print/agent/heartbeat
exports.heartbeat = asyncHandler(async (req, res) => {
  let cancelRequested = false;

  if (req.printer.currentJob) {
    const job = await PrintJob.findById(req.printer.currentJob);
    cancelRequested = !!(job && job.cancelRequestedAt && !TERMINAL_JOB_STATUSES.includes(job.status));
  }

  res.status(200).json({ success: true, cancelRequested });
});

// GET /api/print/agent/next-job
// req.printer est posé par authenticatePrinter
exports.getNextJob = asyncHandler(async (req, res) => {
  if (!req.printer.currentJob) {
    return res.status(200).json({ success: true, data: null });
  }

  // La condition status: 'queued' rend l'écriture atomique : si deux polls se chevauchent,
  // un seul obtiendra un document en retour.
  const job = await PrintJob.findOneAndUpdate(
    { _id: req.printer.currentJob, status: 'queued' },
    {
      status: 'sent',
      $push: { history: { status: 'sent', date: new Date(), detail: `Dispatché à l'imprimante ${req.printer.name}` } },
    }
  );

  if (!job) {
    return res.status(200).json({ success: true, data: null });
  }

  res.status(200).json({
    success: true,
    data: {
      jobId: job._id.toString(),
      fileName: job.fileName,
      downloadUrl: `/api/print/agent/jobs/${job._id}/file`,
    },
  });
});

// GET /api/print/agent/jobs/:id/file
exports.downloadJobFile = asyncHandler(async (req, res, next) => {
  const job = await PrintJob.findById(req.params.id);
  if (!job) return next(new ErrorResponse('Job non trouvé', 404));
  if (job.printer.toString() !== req.printer._id.toString()) {
    return next(new ErrorResponse('Ce job ne correspond pas à cette imprimante', 403));
  }

  // Les .gcode sont du texte brut ; sans ceci, `send` tomberait sur application/octet-stream
  // (extension inconnue de `mime`) et l'agent recevrait un buffer plutôt qu'un flux texte.
  res.type('text/plain');
  res.download(path.resolve(job.filePath), job.fileName);
});

// POST /api/print/agent/jobs/:id/status
// Body: { status: 'printing' | 'completed' | 'failed', errorMessage? }
exports.updateJobStatus = asyncHandler(async (req, res, next) => {
  const { status, errorMessage } = req.body;
  if (!VALID_STATUS_UPDATES.includes(status)) {
    return next(new ErrorResponse('Statut invalide', 400));
  }

  const job = await PrintJob.findById(req.params.id);
  if (!job) return next(new ErrorResponse('Job non trouvé', 404));
  if (job.printer.toString() !== req.printer._id.toString()) {
    return next(new ErrorResponse('Ce job ne correspond pas à cette imprimante', 403));
  }
  if (!req.printer.currentJob || job._id.toString() !== req.printer.currentJob.toString()) {
    return next(new ErrorResponse("Ce job n'est plus le job courant de cette imprimante", 409));
  }
  if (['completed', 'failed'].includes(job.status)) {
    return next(new ErrorResponse('Ce job est déjà dans un état terminal', 409));
  }

  job.status = status;
  job.history.push({ status, date: new Date(), detail: errorMessage || `Rapporté par l'agent: ${status}` });

  if (status === 'printing') {
    job.startedAt = new Date();
  } else {
    job.completedAt = new Date();
    if (status === 'failed') job.errorMessage = errorMessage || null;

    req.printer.status = PRINTER_STATUSES.AWAITING_CLEARANCE;
    req.printer.statusHistory.push({
      status: PRINTER_STATUSES.AWAITING_CLEARANCE,
      source: PRINTER_STATUS_SOURCES.AGENT_REPORT,
      detail: status === 'failed' ? (errorMessage || "Échec de l'impression") : 'Impression terminée',
      date: new Date(),
    });
    await req.printer.save();
  }

  await job.save();
  res.status(200).json({ success: true, data: job });
});
