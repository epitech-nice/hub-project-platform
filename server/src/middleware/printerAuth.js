const Printer = require('../models/Printer');
const PrintJob = require('../models/PrintJob');
const { hashApiKey } = require('../utils/apiKey');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('./asyncHandler');
const { PRINTER_STATUSES, PRINTER_STATUS_SOURCES } = require('../utils/constants');
const { withOptimisticRetry } = require('../utils/optimisticRetry');

exports.authenticatePrinter = asyncHandler(async (req, res, next) => {
  const printerId = req.headers['x-printer-id'];
  const apiKey = req.headers['x-api-key'];

  if (!printerId || !apiKey) {
    return next(new ErrorResponse('Authentification imprimante requise', 401));
  }

  const found = await Printer.findById(printerId).catch(() => null);
  if (!found || found.apiKeyHash !== hashApiKey(apiKey)) {
    return next(new ErrorResponse('Clé API imprimante invalide', 401));
  }

  // withOptimisticRetry (pas un simple save()) : cette requête peut arriver en même temps qu'un
  // autre écrivain du même document Printer (checkStalePrinters vient justement de marquer cette
  // imprimante OFFLINE, ou une déclaration manuelle est en cours) — un save() nu plantait alors
  // en VersionError non catché, 500 brut sur une requête agent pourtant légitime (heartbeat,
  // spool-status, next-job...), l'excluant du Hub jusqu'à ce qu'une requête suivante ne tombe
  // pas sur la même course.
  req.printer = await withOptimisticRetry(
    () => Printer.findById(printerId),
    async (printer) => {
      if (printer.status === PRINTER_STATUSES.OFFLINE) {
        let nextStatus = printer.lastKnownStatus || PRINTER_STATUSES.IDLE;

        if (printer.currentJob) {
          const job = await PrintJob.findById(printer.currentJob);
          if (job && job.status === 'failed') {
            nextStatus = PRINTER_STATUSES.AWAITING_CLEARANCE;
          }
        }

        printer.status = nextStatus;
        printer.statusHistory.push({
          status: nextStatus,
          source: PRINTER_STATUS_SOURCES.AGENT_REPORT,
          detail: 'Reconnexion après perte de contact',
          date: new Date(),
        });
      }

      printer.lastSeenAt = new Date();
      await printer.save();
      return printer;
    }
  );

  next();
});
