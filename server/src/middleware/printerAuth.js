const Printer = require('../models/Printer');
const PrintJob = require('../models/PrintJob');
const { hashApiKey } = require('../utils/apiKey');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('./asyncHandler');
const { PRINTER_STATUSES, PRINTER_STATUS_SOURCES } = require('../utils/constants');

exports.authenticatePrinter = asyncHandler(async (req, res, next) => {
  const printerId = req.headers['x-printer-id'];
  const apiKey = req.headers['x-api-key'];

  if (!printerId || !apiKey) {
    return next(new ErrorResponse('Authentification imprimante requise', 401));
  }

  const printer = await Printer.findById(printerId).catch(() => null);
  if (!printer || printer.apiKeyHash !== hashApiKey(apiKey)) {
    return next(new ErrorResponse('Clé API imprimante invalide', 401));
  }

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

  req.printer = printer;
  next();
});
