// controllers/simulated/projectController.js
const fs = require("fs");
const path = require("path");
const SimulatedProject = require("../../models/SimulatedProject");
const SimulatedEnrollment = require("../../models/SimulatedEnrollment");
const asyncHandler = require("../../middleware/asyncHandler");
const ErrorResponse = require("../../utils/errorResponse");

// ─────────────────────────────────────────────
// CATALOGUE — routes admin & étudiant
// ─────────────────────────────────────────────

// GET /api/simulated/catalog
// Admin : tous les projets | Étudiant : projets actifs uniquement
exports.getCatalog = asyncHandler(async (req, res, next) => {
  const query = req.user.role === "admin" ? {} : { isActive: true };
  const projects = await SimulatedProject.find(query).sort({ createdAt: -1 }).lean();
  res.status(200).json({ success: true, data: projects });
});

// POST /api/simulated/catalog  (admin)
// Body: { title } + fichier PDF dans req.file
exports.createCatalogProject = asyncHandler(async (req, res, next) => {
  const { title } = req.body;

  if (!title || !title.trim()) {
    // Supprimer le fichier uploadé si le titre est manquant
    if (req.file) fs.unlinkSync(req.file.path);
    return next(new ErrorResponse("Le titre est requis", 400));
  }

  const project = new SimulatedProject({
    title: title.trim(),
    subjectFile: req.file ? `simulated-subjects/${req.file.filename}` : null,
    createdBy: {
      userId: req.user._id,
      name: req.user.name,
    },
  });

  await project.save();
  res.status(201).json({ success: true, data: project });
});

// PUT /api/simulated/catalog/:id  (admin)
// Body: { title?, isActive? } + fichier PDF optionnel dans req.file
exports.updateCatalogProject = asyncHandler(async (req, res, next) => {
  const project = await SimulatedProject.findById(req.params.id);
  if (!project) {
    if (req.file) fs.unlinkSync(req.file.path);
    return next(new ErrorResponse("Projet non trouvé", 404));
  }

  if (req.body.title !== undefined) {
    project.title = req.body.title.trim();
  }
  if (req.body.isActive !== undefined) {
    project.isActive = req.body.isActive === "true" || req.body.isActive === true;
  }

  // Remplacer le PDF si un nouveau est uploadé
  if (req.file) {
    // Supprimer l'ancien fichier
    if (project.subjectFile) {
      const oldPath = path.join(__dirname, "../../../uploads", project.subjectFile);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
    project.subjectFile = `simulated-subjects/${req.file.filename}`;
  }

  project.updatedAt = Date.now();
  await project.save();
  res.status(200).json({ success: true, data: project });
});

// DELETE /api/simulated/catalog/:id  (admin)
exports.deleteCatalogProject = asyncHandler(async (req, res, next) => {
  const project = await SimulatedProject.findById(req.params.id);
  if (!project) {
    return next(new ErrorResponse("Projet non trouvé", 404));
  }

  // Supprimer le fichier PDF associé
  if (project.subjectFile) {
    const filePath = path.join(__dirname, "../../../uploads", project.subjectFile);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  await SimulatedProject.findByIdAndDelete(req.params.id);
  res.status(200).json({ success: true, message: "Projet supprimé avec succès" });
});

// GET /api/simulated/catalog/:id
// Retourne un projet du catalogue par son ID.
// Pour les étudiants : visible si actif OU si l'étudiant a un enrollment dessus
exports.getCatalogProjectById = asyncHandler(async (req, res, next) => {
  const project = await SimulatedProject.findById(req.params.id);
  if (!project) {
    return next(new ErrorResponse("Projet non trouvé", 404));
  }

  if (req.user.role !== "admin" && !project.isActive) {
    // Permettre l'accès si l'étudiant a un enrollment sur ce projet
    const enrollment = await SimulatedEnrollment.findOne({
      "student.userId": req.user._id,
      "simulatedProject.projectId": req.params.id,
    });
    if (!enrollment) {
      return next(new ErrorResponse("Projet non trouvé", 404));
    }
  }

  res.status(200).json({ success: true, data: project });
});
