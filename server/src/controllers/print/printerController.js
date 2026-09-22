const QRCode = require('qrcode');
const Printer = require('../../models/Printer');
const PrintJob = require('../../models/PrintJob');
const PrintAuthorization = require('../../models/PrintAuthorization');
const asyncHandler = require('../../middleware/asyncHandler');
const ErrorResponse = require('../../utils/errorResponse');
const { generateApiKey } = require('../../utils/apiKey');
const { PRINTER_STATUSES, PRINTER_STATUS_SOURCES, PRINT_JOB_STATUSES, CLEARANCE_METHODS } = require('../../utils/constants');
const { withOptimisticRetry } = require('../../utils/optimisticRetry');

const NON_TERMINAL_JOB_STATUSES = [PRINT_JOB_STATUSES.QUEUED, PRINT_JOB_STATUSES.SENT, PRINT_JOB_STATUSES.PRINTING];

const MAX_MATERIAL_LENGTH = 64;
// Accepte "#RRGGBB" comme "RRGGBB" — le format que <input type="color"> (GatePicker) envoie
// réellement est sans '#', mais on tolère les deux plutôt que d'imposer un format côté client.
const HEX_COLOR_REGEX = /^#?[0-9a-fA-F]{6}$/;

// GET /api/print/printers
exports.listPrinters = asyncHandler(async (req, res) => {
  const printers = await Printer.find().select('-apiKeyHash').sort({ name: 1 });
  res.status(200).json({ success: true, count: printers.length, data: printers });
});

// POST /api/print/printers
exports.createPrinter = asyncHandler(async (req, res, next) => {
  const { name, model } = req.body;
  if (!name || !model) {
    return next(new ErrorResponse('Le nom et le modèle sont requis', 400));
  }

  const { rawKey, hash } = generateApiKey();
  const printer = await Printer.create({ name, model, apiKeyHash: hash });
  const printerObj = printer.toObject();
  delete printerObj.apiKeyHash;

  res.status(201).json({ success: true, data: { printer: printerObj, apiKey: rawKey } });
});

// POST /api/print/printers/:id/regenerate-key
exports.regenerateKey = asyncHandler(async (req, res, next) => {
  const printer = await Printer.findById(req.params.id);
  if (!printer) return next(new ErrorResponse('Imprimante non trouvée', 404));

  const { rawKey, hash } = generateApiKey();
  printer.apiKeyHash = hash;
  await printer.save();

  res.status(200).json({ success: true, data: { apiKey: rawKey } });
});

// PATCH /api/print/printers/:id/disabled
exports.setDisabled = asyncHandler(async (req, res, next) => {
  const { disabled, note } = req.body;
  if (typeof disabled !== 'boolean' || !note) {
    return next(new ErrorResponse('disabled (booléen) et note sont requis', 400));
  }

  let result;
  await withOptimisticRetry(
    () => Printer.findById(req.params.id),
    async (printer) => {
      if (!printer) throw new ErrorResponse('Imprimante non trouvée', 404);

      const activeJob = printer.currentJob ? await PrintJob.findById(printer.currentJob) : null;
      const jobIsActive = activeJob && NON_TERMINAL_JOB_STATUSES.includes(activeJob.status);

      if (disabled) {
        if (jobIsActive && [PRINT_JOB_STATUSES.SENT, PRINT_JOB_STATUSES.PRINTING].includes(activeJob.status)) {
          // Une impression est physiquement en cours : nuller currentJob orphelinerait le job
          // pour de bon — le heartbeat de l'agent (GET /agent/heartbeat) ne consulte
          // cancelRequestedAt que via req.printer.currentJob, et updateJobStatus refuse tout
          // rapport final dont l'id ne correspond plus au currentJob courant (409). On demande
          // donc l'annulation par le même mécanisme que POST /jobs/:id/cancel (asynchrone,
          // repris par l'agent à son prochain tick) plutôt que de couper le lien.
          if (!activeJob.cancelRequestedAt) {
            activeJob.cancelRequestedAt = new Date();
            activeJob.cancelledBy = { email: req.user.email.toLowerCase(), role: req.user.role };
            activeJob.history.push({
              status: activeJob.status,
              date: new Date(),
              detail: `Annulation demandée (imprimante désactivée: ${note})`,
            });
            await activeJob.save();
          }
          // currentJob reste posé tant que l'agent n'a pas confirmé l'annulation — voir
          // updateJobStatus, qui ne repasse plus une imprimante DISABLED en awaiting_clearance.
        } else if (jobIsActive) {
          // Job encore 'queued', jamais dispatché : rien de physique en cours, sûr à libérer
          // immédiatement (même verrou atomique que le chemin 'queued' de cancelJob).
          await PrintJob.findOneAndUpdate(
            { _id: activeJob._id, status: PRINT_JOB_STATUSES.QUEUED },
            {
              status: PRINT_JOB_STATUSES.CANCELLED,
              cancelledBy: { email: req.user.email.toLowerCase(), role: req.user.role },
              $push: {
                history: { status: PRINT_JOB_STATUSES.CANCELLED, date: new Date(), detail: `Annulée (imprimante désactivée: ${note})` },
              },
            }
          );
          printer.currentJob = null;
        } else {
          // Pas de job actif (jamais fixé, ou référence périmée vers un job déjà terminal) :
          // rien à annuler, comportement inchangé.
          printer.currentJob = null;
        }
        printer.status = PRINTER_STATUSES.DISABLED;
      } else {
        if (jobIsActive) {
          throw new ErrorResponse(
            "Une impression est encore en cours d'annulation sur cette imprimante, réessayez une fois le plateau libéré",
            409
          );
        }
        printer.status = PRINTER_STATUSES.IDLE;
        printer.currentJob = null;
      }

      printer.statusHistory.push({
        status: printer.status,
        source: PRINTER_STATUS_SOURCES.ADMIN_ACTION,
        detail: note,
        byUserId: req.user._id,
        byName: req.user.name,
        date: new Date(),
      });
      await printer.save();
      result = { status: printer.status };
    }
  );

  res.status(200).json({ success: true, data: result });
});

// GET /api/print/printers/:id/qr
exports.getQrCode = asyncHandler(async (req, res, next) => {
  const printer = await Printer.findById(req.params.id);
  if (!printer) return next(new ErrorResponse('Imprimante non trouvée', 404));
  if (!process.env.FRONTEND_URL) {
    return next(new ErrorResponse("FRONTEND_URL n'est pas configuré côté serveur, impossible de générer une URL fiable pour le QR code", 500));
  }

  const url = `${process.env.FRONTEND_URL}/print/printers/${printer._id}/confirm-clearance`;
  const buffer = await QRCode.toBuffer(url, { type: 'png', width: 400 });

  res.set('Content-Type', 'image/png');
  res.status(200).send(buffer);
});

const confirmClearanceInternal = async (req, res, next, method) => {
  let result;
  await withOptimisticRetry(
    () => Printer.findById(req.params.id),
    async (printer) => {
      if (!printer) throw new ErrorResponse('Imprimante non trouvée', 404);
      if (printer.status !== PRINTER_STATUSES.AWAITING_CLEARANCE) {
        throw new ErrorResponse("Cette imprimante n'attend pas de libération de plateau", 400);
      }

      printer.status = PRINTER_STATUSES.IDLE;
      printer.currentJob = null;
      printer.clearanceHistory.push({
        method,
        byUserId: req.user._id,
        byEmail: req.user.email,
        byName: req.user.name,
        date: new Date(),
      });
      await printer.save();
      result = { status: printer.status };
    }
  );

  res.status(200).json({ success: true, data: result });
};

// POST /api/print/printers/:id/confirm-clearance
exports.confirmClearance = asyncHandler((req, res, next) => confirmClearanceInternal(req, res, next, CLEARANCE_METHODS.QR));

// POST /api/print/printers/:id/confirm-clearance/override
exports.confirmClearanceOverride = asyncHandler((req, res, next) => confirmClearanceInternal(req, res, next, CLEARANCE_METHODS.ADMIN_OVERRIDE));

// PUT /api/print/printers/:id/spool-slots/:gate/manual
// body: { material, color }
exports.setManualSpoolSlot = asyncHandler(async (req, res, next) => {
  const { material, color } = req.body;
  if (typeof material !== 'string' || typeof color !== 'string' || !material || !color) {
    return next(new ErrorResponse('material et color sont requis', 400));
  }
  if (material.length > MAX_MATERIAL_LENGTH) {
    return next(new ErrorResponse(`material ne peut pas dépasser ${MAX_MATERIAL_LENGTH} caractères`, 400));
  }
  if (!HEX_COLOR_REGEX.test(color)) {
    return next(new ErrorResponse('color doit être une couleur hexadécimale valide (ex: #RRGGBB)', 400));
  }

  // Permission avant existence du gate — cohérent avec confirmJob, qui vérifie déjà la
  // propriété/l'autorisation avant l'existence de la ressource ciblée.
  if (req.user.role !== 'admin') {
    const authorization = await PrintAuthorization.findOne({ email: req.user.email.toLowerCase() });
    if (!authorization || !authorization.authorized) {
      return next(new ErrorResponse("Vous n'êtes pas autorisé à déclarer le contenu d'une bobine", 403));
    }
  }

  const gate = Number(req.params.gate);
  let updatedSlot;

  // Relit puis réessaie sur VersionError plutôt qu'un simple read-then-save : ce endpoint peut
  // être appelé en même temps que le rapport périodique de l'agent (POST /agent/spool-status),
  // qui sauvegarde lui aussi Printer.spoolSlots en entier.
  await withOptimisticRetry(
    () => Printer.findById(req.params.id),
    async (printer) => {
      if (!printer) throw new ErrorResponse('Imprimante non trouvée', 404);

      const slotIndex = printer.spoolSlots.findIndex((s) => s.gate === gate);
      if (slotIndex === -1) throw new ErrorResponse('Gate inconnu pour cette imprimante', 404);

      const slot = printer.spoolSlots[slotIndex];
      // Le capteur de présence physique de l'ACE (gate_status) est fiable indépendamment du RFID
      // — seules matière/couleur nécessitent une puce RFID pour être auto-détectées (voir spec
      // 2026-09-10). On fait donc confiance aux étudiants whitelistés pour le contenu déclaré,
      // mais pas pour l'occupation du gate : si le dernier rapport de l'agent dit que ce gate est
      // vide, une déclaration manuelle ne peut pas prétendre le contraire — ça bypasserait
      // silencieusement la validation de confirmJob pour n'importe quel autre étudiant utilisant
      // cette imprimante. Ne s'applique qu'à une déclaration initiale : corriger une déclaration
      // manuelle déjà acceptée ne re-vérifie pas (aucun signal auto frais à comparer, voir
      // ci-dessous).
      if (slot.source !== 'manual' && slot.empty) {
        throw new ErrorResponse(
          `L'imprimante rapporte que le gate ${gate} est actuellement vide — impossible de déclarer une bobine dessus tant qu'elle n'est pas physiquement chargée`,
          409
        );
      }
      // Ne capture le snapshot de dérive que si ce n'était pas déjà une déclaration manuelle —
      // corriger une déclaration existante ne doit pas déplacer la référence utilisée pour
      // détecter une future vraie lecture RFID (voir spec 2026-09-10).
      if (slot.source !== 'manual') {
        slot.autoMaterialAtSet = slot.material;
        slot.autoColorAtSet = slot.color;
        slot.autoEmptyAtSet = slot.empty;
      }
      slot.material = material;
      slot.color = color;
      slot.empty = false;
      slot.source = 'manual';
      slot.manualSetBy = { email: req.user.email.toLowerCase(), name: req.user.name };
      slot.manualSetAt = new Date();

      await printer.save();
      updatedSlot = printer.spoolSlots[slotIndex];
    }
  );

  res.status(200).json({ success: true, data: updatedSlot });
});
