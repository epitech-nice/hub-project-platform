const Printer = require('../models/Printer');
const PrintJob = require('../models/PrintJob');
const { PRINTER_STATUSES, PRINTER_STATUS_SOURCES } = require('../utils/constants');
const { withOptimisticRetry } = require('./optimisticRetry');
const { createIntervalTask } = require('./intervalTask');

const OFFLINE_THRESHOLD_MS = 240 * 1000; // ~4x le tick de la boucle de l'agent (60s, --loop), incluant le heartbeat pendant le suivi d'impression
const DEFAULT_CHECK_INTERVAL_MS = 30 * 1000;

// DISABLED est volontairement absent de cette liste (contrairement à une version antérieure de
// ce fix) : une imprimante désactivée pendant une impression garde currentJob posé (voir
// setDisabled, printerController.js) pour permettre l'annulation asynchrone — si l'agent ne
// revient jamais (éteinte pour de bon), ce job devait quand même pouvoir être résolu, sinon
// currentJob reste bloqué et la réactivation (setDisabled(false)) refuse indéfiniment avec
// aucune échappatoire côté API (deadlock trouvé en revue 2026-09-22). Une imprimante DISABLED
// reste donc staleness-vérifiée pour résoudre un job bloqué, mais son statut/historique
// n'est jamais réécrit (elle reste DISABLED, jamais rebasculée OFFLINE).
const NEVER_STALE_STATUSES = [PRINTER_STATUSES.OFFLINE];

const markPrinterStale = async (printerId) => {
  // withOptimisticRetry (pas un simple save()) : ce document Printer peut être écrit au même
  // instant par le prochain tick de l'agent qui vient de reprendre contact (authenticatePrinter)
  // ou par un rapport spool-status — sans ça, un VersionError ici sortait de la boucle
  // for..of de checkStalePrinters et sautait silencieusement tous les imprimantes staleness
  // restantes de ce tick (voir revue 2026-09-21).
  await withOptimisticRetry(
    () => Printer.findById(printerId),
    async (printer) => {
      // Peut avoir changé de statut (reconnecté...) entre la requête stalePrinters et cette
      // écriture — ne re-marque offline que si c'est toujours pertinent.
      if (!printer || NEVER_STALE_STATUSES.includes(printer.status)) return;

      const isDisabled = printer.status === PRINTER_STATUSES.DISABLED;
      if (!isDisabled) {
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
      }

      if (printer.currentJob) {
        // Conditionné sur un statut encore actif ('sent'/'printing', pas seulement pour le cas
        // priorStatus === PRINTING ci-dessus — une imprimante DISABLED garde ce statut littéral,
        // pas 'printing') : ferme la course avec updateJobStatus, qui peut rapporter 'completed'
        // au même instant (l'agent a fini juste avant la coupure de contact) — le rapport de
        // l'agent, plus proche de la réalité physique, doit gagner.
        await PrintJob.findOneAndUpdate(
          { _id: printer.currentJob, status: { $in: ['sent', 'printing'] } },
          {
            status: 'failed',
            errorMessage: "Perte de contact avec l'imprimante",
            completedAt: new Date(),
            $push: { history: { status: 'failed', date: new Date(), detail: 'Job basculé failed automatiquement (staleness imprimante)' } },
          }
        );
      }
    }
  );
};

const checkStalePrinters = async () => {
  const cutoff = new Date(Date.now() - OFFLINE_THRESHOLD_MS);
  const stalePrinters = await Printer.find({
    lastSeenAt: { $ne: null, $lt: cutoff },
    $or: [
      { status: { $nin: [...NEVER_STALE_STATUSES, PRINTER_STATUSES.DISABLED] } },
      // Une imprimante DISABLED n'est re-sélectionnée que tant qu'un job reste à résoudre —
      // sinon elle matcherait ce filtre indéfiniment à chaque tick (lastSeenAt ne bouge plus
      // une fois éteinte pour de bon) pour un no-op perpétuel (voir revue 2026-09-22).
      { status: PRINTER_STATUSES.DISABLED, currentJob: { $ne: null } },
    ],
  });

  for (const printer of stalePrinters) {
    // Chaque imprimante est indépendante : un échec (VersionError épuisé, imprimante supprimée
    // entre-temps, etc.) sur l'une ne doit jamais empêcher de traiter les suivantes du même tick.
    try {
      await markPrinterStale(printer._id);
    } catch (err) {
      console.error(`[printerScheduler] erreur imprimante ${printer._id}:`, err.message);
    }
  }
};

const { start: startPrinterScheduler, stop: stopPrinterScheduler } = createIntervalTask(
  '[printerScheduler]',
  checkStalePrinters,
  DEFAULT_CHECK_INTERVAL_MS
);

module.exports = { checkStalePrinters, startPrinterScheduler, stopPrinterScheduler, OFFLINE_THRESHOLD_MS };
