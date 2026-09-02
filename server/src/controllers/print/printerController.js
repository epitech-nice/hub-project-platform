const QRCode = require('qrcode');
const Printer = require('../../models/Printer');
const asyncHandler = require('../../middleware/asyncHandler');
const ErrorResponse = require('../../utils/errorResponse');
const { generateApiKey } = require('../../utils/apiKey');
const { PRINTER_STATUSES, PRINTER_STATUS_SOURCES } = require('../../utils/constants');

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

  const url = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/print/printers/${printer._id}/confirm-clearance`;
  const buffer = await QRCode.toBuffer(url, { type: 'png', width: 400 });

  res.set('Content-Type', 'image/png');
  res.status(200).send(buffer);
});
