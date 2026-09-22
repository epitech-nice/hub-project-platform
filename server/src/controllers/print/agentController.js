const path = require('path');
const Printer = require('../../models/Printer');
const PrintJob = require('../../models/PrintJob');
const asyncHandler = require('../../middleware/asyncHandler');
const ErrorResponse = require('../../utils/errorResponse');
const { PRINTER_STATUSES, PRINTER_STATUS_SOURCES, PRINT_JOB_STATUSES } = require('../../utils/constants');
const { mergeSpoolSlots } = require('../../utils/spoolSlotMerge');
const { withOptimisticRetry } = require('../../utils/optimisticRetry');

const VALID_STATUS_UPDATES = ['printing', 'completed', 'failed', 'cancelled'];
const MAX_MATERIAL_LENGTH = 64;

// Valide la forme d'un rapport de gate avant de le laisser atteindre mergeSpoolSlots — celle-ci
// ne fait aucune vérification (crash sur une entrée malformée) et ne dé-duplique pas les gates
// répétés (la dernière entrée écrase silencieusement les précédentes côté lookup). Même borne
// [0, 3] que confirmJob (jobController.js) pour un gate assigné par le hub — cette feature
// suppose partout une unique unité ACE à 4 gates (voir spec 2026-09-10).
const isValidGateReport = (g) =>
  g &&
  typeof g === 'object' &&
  typeof g.gate === 'number' &&
  Number.isInteger(g.gate) &&
  g.gate >= 0 &&
  g.gate <= 3 &&
  (g.material === undefined || (typeof g.material === 'string' && g.material.length <= MAX_MATERIAL_LENGTH)) &&
  (g.color === undefined || typeof g.color === 'string') &&
  (g.empty === undefined || typeof g.empty === 'boolean');

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

// POST /api/print/agent/spool-status
// Body: { gates: [{ gate, material, color, empty }] }
exports.reportSpoolStatus = asyncHandler(async (req, res, next) => {
  const { gates } = req.body;
  if (!Array.isArray(gates)) {
    return next(new ErrorResponse('gates (tableau) requis', 400));
  }
  if (!gates.every(isValidGateReport)) {
    return next(new ErrorResponse('gates contient une entrée invalide (gate entier 0-3, material/color string, empty booléen)', 400));
  }
  const gateNumbers = gates.map((g) => g.gate);
  if (new Set(gateNumbers).size !== gateNumbers.length) {
    return next(new ErrorResponse('gates contient un numéro de gate en double', 400));
  }

  // Relit puis réessaie sur VersionError plutôt que d'écrire directement sur req.printer (posé
  // par authenticatePrinter en tout début de requête) — une déclaration manuelle concurrente
  // (PUT .../spool-slots/:gate/manual) peut avoir sauvegardé le document entre-temps.
  await withOptimisticRetry(
    () => Printer.findById(req.printer._id),
    async (printer) => {
      printer.spoolSlots = mergeSpoolSlots(printer.spoolSlots, gates);
      printer.spoolSlotsUpdatedAt = new Date();
      await printer.save();
    }
  );

  res.status(200).json({ success: true });
});

// GET /api/print/agent/next-job
// req.printer est posé par authenticatePrinter
exports.getNextJob = asyncHandler(async (req, res) => {
  if (!req.printer.currentJob) {
    return res.status(200).json({ success: true, data: null });
  }

  // La condition status: 'queued' rend l'écriture atomique : si deux polls se chevauchent,
  // un seul obtiendra un document en retour. { new: true } : sans ça `job` resterait le
  // document PRE-update (status encore 'queued' en mémoire) alors que l'écriture a bien mis
  // 'sent' en base — inoffensif tant que la réponse n'échote que des champs non touchés par
  // cette update, mais un piège pour la prochaine évolution qui en renverrait un.
  const job = await PrintJob.findOneAndUpdate(
    { _id: req.printer.currentJob, status: 'queued' },
    {
      status: 'sent',
      $push: { history: { status: 'sent', date: new Date(), detail: `Dispatché à l'imprimante ${req.printer.name}` } },
    },
    { new: true }
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
      gateAssignments: job.gateAssignments,
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
  if (TERMINAL_JOB_STATUSES.includes(job.status)) {
    return next(new ErrorResponse('Ce job est déjà dans un état terminal', 409));
  }

  const setFields = { status };
  if (status === 'printing') {
    setFields.startedAt = new Date();
  } else {
    setFields.completedAt = new Date();
    if (status === 'failed') setFields.errorMessage = errorMessage || null;
  }

  // findOneAndUpdate conditionné sur un statut encore non-terminal plutôt que job.save() : le
  // scheduler de staleness (checkStalePrinters) peut faire passer ce même job à 'failed' via un
  // findByIdAndUpdate concurrent, qui ne bascule pas __v — un job.save() basé sur la lecture
  // faite plus haut ne verrait alors aucun conflit et écraserait silencieusement ce failed en
  // 'printing'/'completed'. Cette écriture atomique ferme la course : quel que soit l'écrivain
  // qui arrive en second, il constate que le job n'est plus non-terminal et échoue proprement.
  const updatedJob = await PrintJob.findOneAndUpdate(
    { _id: job._id, status: { $nin: TERMINAL_JOB_STATUSES } },
    {
      $set: setFields,
      $push: { history: { status, date: new Date(), detail: errorMessage || `Rapporté par l'agent: ${status}` } },
    },
    { new: true }
  );
  if (!updatedJob) {
    return next(new ErrorResponse('Ce job est déjà dans un état terminal', 409));
  }

  if (status !== 'printing') {
    await withOptimisticRetry(
      () => Printer.findById(req.printer._id),
      async (printer) => {
        if (!printer) return;
        // Une imprimante désactivée pendant l'impression (voir printerController.setDisabled)
        // reste DISABLED même une fois le job résolu — la libération de plateau se fera hors
        // ligne quand l'admin la réactivera, pas via le flux de clearance numérique habituel.
        if (printer.status === PRINTER_STATUSES.DISABLED) return;

        printer.status = PRINTER_STATUSES.AWAITING_CLEARANCE;
        printer.statusHistory.push({
          status: PRINTER_STATUSES.AWAITING_CLEARANCE,
          source: PRINTER_STATUS_SOURCES.AGENT_REPORT,
          detail: status === 'failed' ? (errorMessage || "Échec de l'impression") : 'Impression terminée',
          date: new Date(),
        });
        await printer.save();
      }
    );
  }

  res.status(200).json({ success: true, data: updatedJob });
});
