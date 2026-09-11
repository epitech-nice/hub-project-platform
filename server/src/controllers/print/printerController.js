const QRCode = require('qrcode');
const Printer = require('../../models/Printer');
const PrintAuthorization = require('../../models/PrintAuthorization');
const asyncHandler = require('../../middleware/asyncHandler');
const ErrorResponse = require('../../utils/errorResponse');
const { generateApiKey } = require('../../utils/apiKey');
const { PRINTER_STATUSES, PRINTER_STATUS_SOURCES, CLEARANCE_METHODS } = require('../../utils/constants');
const { withOptimisticRetry } = require('../../utils/optimisticRetry');

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

  const printer = await Printer.findById(req.params.id);
  if (!printer) return next(new ErrorResponse('Imprimante non trouvée', 404));

  printer.status = disabled ? PRINTER_STATUSES.DISABLED : PRINTER_STATUSES.IDLE;
  printer.currentJob = null;
  printer.statusHistory.push({
    status: printer.status,
    source: PRINTER_STATUS_SOURCES.ADMIN_ACTION,
    detail: note,
    byUserId: req.user._id,
    byName: req.user.name,
    date: new Date(),
  });
  await printer.save();

  res.status(200).json({ success: true, data: { status: printer.status } });
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
  const printer = await Printer.findById(req.params.id);
  if (!printer) return next(new ErrorResponse('Imprimante non trouvée', 404));
  if (printer.status !== PRINTER_STATUSES.AWAITING_CLEARANCE) {
    return next(new ErrorResponse("Cette imprimante n'attend pas de libération de plateau", 400));
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

  res.status(200).json({ success: true, data: { status: printer.status } });
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
