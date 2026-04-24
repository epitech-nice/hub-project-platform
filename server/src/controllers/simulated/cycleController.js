// controllers/simulated/cycleController.js
const SimulatedCycle = require("../../models/SimulatedCycle");
const asyncHandler = require("../../middleware/asyncHandler");
const ErrorResponse = require("../../utils/errorResponse");

// ─────────────────────────────────────────────
// CYCLES — calendrier des fenêtres de dépôt
// ─────────────────────────────────────────────

// Les deadlines sont stockées en fin de journée (23:59:59.999 UTC) pour inclure le jour entier
const endOfDay = (dt) => {
  const d = new Date(dt);
  d.setUTCHours(23, 59, 59, 999);
  return d;
};

// GET /api/simulated/cycles/upcoming
// Accessible à tous les étudiants authentifiés — retourne tous les cycles triés par date de début.
exports.getUpcomingCycles = asyncHandler(async (_req, res, next) => {
  const cycles = await SimulatedCycle.find().sort({ startDate: 1 });
  res.status(200).json({ success: true, data: cycles });
});

// GET /api/simulated/cycles/current
// Retourne le cycle courant et la phase ouverte (1 ou 2), ou null si aucune fenêtre ouverte.
// Phase 1 ouverte : startDate <= now <= firstSubmissionDeadline
// Phase 2 ouverte : firstDefenseDate <= now <= secondSubmissionDeadline
exports.getCurrentCycle = asyncHandler(async (_req, res, next) => {
  const now = new Date();

  // Phase 1
  let cycle = await SimulatedCycle.findOne({
    startDate: { $lte: now },
    firstSubmissionDeadline: { $gte: now },
  });
  if (cycle) {
    return res.status(200).json({ success: true, data: { cycle, currentPhase: 1 } });
  }

  // Phase 2
  cycle = await SimulatedCycle.findOne({
    firstDefenseDate: { $lte: now },
    secondSubmissionDeadline: { $gte: now },
  });
  if (cycle) {
    return res.status(200).json({ success: true, data: { cycle, currentPhase: 2 } });
  }

  res.status(200).json({ success: true, data: null });
});

// GET /api/simulated/cycles  (admin)
// Retourne tous les cycles triés par date de début
exports.getCycles = asyncHandler(async (_req, res, next) => {
  const cycles = await SimulatedCycle.find().sort({ startDate: 1 });
  res.status(200).json({ success: true, data: cycles });
});

// POST /api/simulated/cycles  (admin)
// Body: { name, startDate, firstSubmissionDeadline, firstDefenseDate, secondSubmissionDeadline, secondDefenseDate, isDoubleCycle? }
exports.createCycle = asyncHandler(async (req, res, next) => {
  const {
    name, startDate,
    firstSubmissionDeadline, firstDefenseDate,
    secondSubmissionDeadline, secondDefenseDate,
    isDoubleCycle,
  } = req.body;

  if (!name || !startDate || !firstSubmissionDeadline || !firstDefenseDate || !secondSubmissionDeadline || !secondDefenseDate) {
    return next(new ErrorResponse("Tous les champs de dates sont requis", 400));
  }

  const cycle = new SimulatedCycle({
    name: name.trim(),
    startDate: new Date(startDate),
    firstSubmissionDeadline: endOfDay(firstSubmissionDeadline),
    firstDefenseDate: new Date(firstDefenseDate),
    secondSubmissionDeadline: endOfDay(secondSubmissionDeadline),
    secondDefenseDate: new Date(secondDefenseDate),
    isDoubleCycle: isDoubleCycle === true || isDoubleCycle === "true",
    createdBy: { userId: req.user._id, name: req.user.name },
  });

  await cycle.save();
  res.status(201).json({ success: true, data: cycle });
});

// PUT /api/simulated/cycles/:id  (admin)
exports.updateCycle = asyncHandler(async (req, res, next) => {
  const cycle = await SimulatedCycle.findById(req.params.id);
  if (!cycle) {
    return next(new ErrorResponse("Cycle non trouvé", 404));
  }

  const {
    name, startDate,
    firstSubmissionDeadline, firstDefenseDate,
    secondSubmissionDeadline, secondDefenseDate,
    isDoubleCycle,
  } = req.body;

  if (name !== undefined) cycle.name = name.trim();
  if (startDate !== undefined) cycle.startDate = new Date(startDate);
  if (firstSubmissionDeadline !== undefined) cycle.firstSubmissionDeadline = endOfDay(firstSubmissionDeadline);
  if (firstDefenseDate !== undefined) cycle.firstDefenseDate = new Date(firstDefenseDate);
  if (secondSubmissionDeadline !== undefined) cycle.secondSubmissionDeadline = endOfDay(secondSubmissionDeadline);
  if (secondDefenseDate !== undefined) cycle.secondDefenseDate = new Date(secondDefenseDate);
  if (isDoubleCycle !== undefined) {
    cycle.isDoubleCycle = isDoubleCycle === true || isDoubleCycle === "true";
  }

  await cycle.save();
  res.status(200).json({ success: true, data: cycle });
});

// DELETE /api/simulated/cycles/:id  (admin)
exports.deleteCycle = asyncHandler(async (req, res, next) => {
  const cycle = await SimulatedCycle.findById(req.params.id);
  if (!cycle) {
    return next(new ErrorResponse("Cycle non trouvé", 404));
  }
  await SimulatedCycle.findByIdAndDelete(req.params.id);
  res.status(200).json({ success: true, message: "Cycle supprimé avec succès" });
});

// POST /api/simulated/cycles/import  (admin)
// Body: { cycles: [{ name, startDate, firstSubmissionDeadline, firstDefenseDate, secondSubmissionDeadline, secondDefenseDate, isDoubleCycle? }] }
exports.importCycles = asyncHandler(async (req, res, next) => {
  const { cycles } = req.body;

  if (!Array.isArray(cycles) || cycles.length === 0) {
    return next(new ErrorResponse("Un tableau de cycles non vide est requis", 400));
  }

  const toInsert = [];
  for (let i = 0; i < cycles.length; i++) {
    const {
      name, startDate,
      firstSubmissionDeadline, firstDefenseDate,
      secondSubmissionDeadline, secondDefenseDate,
      isDoubleCycle,
    } = cycles[i];

    if (!name || !startDate || !firstSubmissionDeadline || !firstDefenseDate || !secondSubmissionDeadline || !secondDefenseDate) {
      return next(new ErrorResponse(`Cycle ${i + 1} : tous les champs de dates sont requis`, 400));
    }
    toInsert.push({
      name: String(name).trim(),
      startDate: new Date(startDate),
      firstSubmissionDeadline: endOfDay(firstSubmissionDeadline),
      firstDefenseDate: new Date(firstDefenseDate),
      secondSubmissionDeadline: endOfDay(secondSubmissionDeadline),
      secondDefenseDate: new Date(secondDefenseDate),
      isDoubleCycle: isDoubleCycle === true || isDoubleCycle === "true",
      createdBy: { userId: req.user._id, name: req.user.name },
    });
  }

  const inserted = await SimulatedCycle.insertMany(toInsert);
  res.status(201).json({ success: true, count: inserted.length, data: inserted });
});

// POST /api/simulated/cycles/generate  (admin)
// Body: { firstStartDate, numberOfCycles, namePrefix? }
// Génère N cycles de 4 semaines consécutifs
exports.generateCycles = asyncHandler(async (req, res, next) => {
  const { firstStartDate, numberOfCycles, namePrefix } = req.body;

  if (!firstStartDate || !numberOfCycles) {
    return next(new ErrorResponse("firstStartDate et numberOfCycles sont requis", 400));
  }

  const n = parseInt(numberOfCycles);
  if (isNaN(n) || n < 1 || n > 26) {
    return next(new ErrorResponse("numberOfCycles doit être entre 1 et 26", 400));
  }

  const prefix = namePrefix ? String(namePrefix).trim() : "Cycle";
  const toInsert = [];
  // addDays uses pure UTC arithmetic to avoid DST shift issues
  const addDays = (isoStr, d) => {
    const [y, m, day] = String(isoStr).slice(0, 10).split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, day + d));
  };
  let currentStart = String(firstStartDate).slice(0, 10); // ISO string YYYY-MM-DD

  // Determine the next number by finding the highest existing number for this prefix
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const existing = await SimulatedCycle.find(
    { name: { $regex: `^${escapedPrefix} \\d+$` } },
    { name: 1 }
  ).lean();
  const maxExisting = existing.reduce((max, c) => {
    const num = parseInt(c.name.split(" ").pop(), 10);
    return isNaN(num) ? max : Math.max(max, num);
  }, 0);
  const startNumber = maxExisting + 1;

  for (let i = 0; i < n; i++) {
    toInsert.push({
      name: `${prefix} ${startNumber + i}`,
      startDate: addDays(currentStart, 0),
      firstSubmissionDeadline: endOfDay(addDays(currentStart, 5)),   // W1 mercredi fin de journée
      firstDefenseDate: addDays(currentStart, 14),                   // W2 vendredi
      secondSubmissionDeadline: endOfDay(addDays(currentStart, 19)), // W3 mercredi fin de journée
      secondDefenseDate: addDays(currentStart, 28),         // W4 vendredi
      isDoubleCycle: false,
      createdBy: { userId: req.user._id, name: req.user.name },
    });

    // Prochain cycle démarre le vendredi W4 du cycle courant
    currentStart = addDays(currentStart, 28).toISOString().slice(0, 10);
  }

  const inserted = await SimulatedCycle.insertMany(toInsert);
  res.status(201).json({ success: true, count: inserted.length, data: inserted });
});
