const Printer = require('../models/Printer');
const PrintJob = require('../models/PrintJob');
const { PRINTER_STATUSES, PRINTER_STATUS_SOURCES } = require('../utils/constants');

const OFFLINE_THRESHOLD_MS = 240 * 1000; // ~4x le tick de la boucle de l'agent (60s, --loop), incluant le heartbeat pendant le suivi d'impression
const DEFAULT_CHECK_INTERVAL_MS = 30 * 1000;

const NEVER_STALE_STATUSES = [PRINTER_STATUSES.OFFLINE, PRINTER_STATUSES.DISABLED];

const checkStalePrinters = async () => {
  const cutoff = new Date(Date.now() - OFFLINE_THRESHOLD_MS);
  const stalePrinters = await Printer.find({
    status: { $nin: NEVER_STALE_STATUSES },
    lastSeenAt: { $ne: null, $lt: cutoff },
  });

  for (const printer of stalePrinters) {
    const priorStatus = printer.status;
    printer.lastKnownStatus = priorStatus;
    printer.status = PRINTER_STATUSES.OFFLINE;
    printer.statusHistory.push({
      status: PRINTER_STATUSES.OFFLINE,
      source: PRINTER_STATUS_SOURCES.HEARTBEAT_TIMEOUT,
      detail: `Dernier statut connu avant coupure: ${priorStatus}`,
      date: new Date(),
    });
    await printer.save();

    if (priorStatus === PRINTER_STATUSES.PRINTING && printer.currentJob) {
      await PrintJob.findByIdAndUpdate(printer.currentJob, {
        status: 'failed',
        errorMessage: "Perte de contact avec l'imprimante",
        completedAt: new Date(),
        $push: { history: { status: 'failed', date: new Date(), detail: 'Job basculé failed automatiquement (staleness imprimante)' } },
      });
    }
  }
};

let intervalHandle = null;

const startPrinterScheduler = (intervalMs = DEFAULT_CHECK_INTERVAL_MS) => {
  if (intervalHandle) return;
  intervalHandle = setInterval(() => {
    checkStalePrinters().catch((err) => console.error('[printerScheduler] erreur:', err.message));
  }, intervalMs);
};

const stopPrinterScheduler = () => {
  clearInterval(intervalHandle);
  intervalHandle = null;
};

module.exports = { checkStalePrinters, startPrinterScheduler, stopPrinterScheduler, OFFLINE_THRESHOLD_MS };
