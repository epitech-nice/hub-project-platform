const Printer = require('../../models/Printer');
const asyncHandler = require('../../middleware/asyncHandler');
const ErrorResponse = require('../../utils/errorResponse');
const { generateApiKey } = require('../../utils/apiKey');

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
