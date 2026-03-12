// routes/simulated.js
const express = require("express");
const router = express.Router();
const { authenticateToken, isAdmin } = require("../middleware/auth");
const upload = require("../middleware/upload");
const simulatedController = require("../controllers/simulatedController");

// ─────────────────────────────────────────────
// CATALOGUE
// ─────────────────────────────────────────────

// Accessible à tous les utilisateurs authentifiés (filtre admin/étudiant dans le controller)
router.get("/catalog", authenticateToken, simulatedController.getCatalog);

// Récupère un projet par ID — doit être AVANT les routes admin PUT/DELETE /catalog/:id
// pour les étudiants : retourne même si inactif si enrollment existant
router.get("/catalog/:id", authenticateToken, simulatedController.getCatalogProjectById);

// Admin uniquement : CRUD catalogue
router.post(
  "/catalog",
  authenticateToken,
  isAdmin,
  upload.single("subjectFile"),
  simulatedController.createCatalogProject
);

router.put(
  "/catalog/:id",
  authenticateToken,
  isAdmin,
  upload.single("subjectFile"),
  simulatedController.updateCatalogProject
);

router.delete(
  "/catalog/:id",
  authenticateToken,
  isAdmin,
  simulatedController.deleteCatalogProject
);

// ─────────────────────────────────────────────
// ENROLLMENTS — étudiant
// ─────────────────────────────────────────────

router.get("/me", authenticateToken, simulatedController.getMyEnrollment);
router.get("/my-history", authenticateToken, simulatedController.getMyHistory);
router.post("/enroll", authenticateToken, simulatedController.enroll);
router.put(
  "/enrollments/:id",
  authenticateToken,
  simulatedController.updateEnrollment
);

// ─────────────────────────────────────────────
// ENROLLMENTS — admin
// ─────────────────────────────────────────────

// Doit être AVANT /enrollments/:id
router.post(
  "/force-enroll",
  authenticateToken,
  isAdmin,
  simulatedController.forceEnroll
);

router.get(
  "/enrollments",
  authenticateToken,
  isAdmin,
  simulatedController.getAllEnrollments
);

// Doit être AVANT /enrollments/:id pour éviter que "export" soit capturé comme un :id
router.get(
  "/enrollments/export",
  authenticateToken,
  isAdmin,
  simulatedController.exportCompletedCSV
);

router.get(
  "/enrollments/:id",
  authenticateToken,
  isAdmin,
  simulatedController.getEnrollmentById
);

router.patch(
  "/enrollments/:id/review",
  authenticateToken,
  isAdmin,
  simulatedController.reviewEnrollment
);

router.patch(
  "/enrollments/:id/defend",
  authenticateToken,
  isAdmin,
  simulatedController.defendEnrollment
);

router.patch(
  "/enrollments/:id/toggle-double-cycle",
  authenticateToken,
  isAdmin,
  simulatedController.toggleDoubleCycle
);

router.patch(
  "/enrollments/:id/update-credits",
  authenticateToken,
  isAdmin,
  simulatedController.updateEnrollmentCredits
);

router.patch(
  "/enrollments/:id/complete",
  authenticateToken,
  isAdmin,
  simulatedController.completeEnrollment
);

router.post(
  "/enrollments/:id/relaunch",
  authenticateToken,
  isAdmin,
  simulatedController.relaunchEnrollment
);

router.delete(
  "/enrollments/:id",
  authenticateToken,
  isAdmin,
  simulatedController.deleteEnrollment
);

// ─────────────────────────────────────────────
// CYCLES — calendrier des fenêtres de dépôt
// ─────────────────────────────────────────────

// Doit être AVANT /cycles/:id pour éviter que "current"/"upcoming" soient capturés comme un :id
router.get("/cycles/current", authenticateToken, simulatedController.getCurrentCycle);
router.get("/cycles/upcoming", authenticateToken, simulatedController.getUpcomingCycles);

router.get("/cycles", authenticateToken, isAdmin, simulatedController.getCycles);
router.post("/cycles", authenticateToken, isAdmin, simulatedController.createCycle);
// Import/génération doivent être AVANT /cycles/:id
router.post("/cycles/import", authenticateToken, isAdmin, simulatedController.importCycles);
router.post("/cycles/generate", authenticateToken, isAdmin, simulatedController.generateCycles);
router.put("/cycles/:id", authenticateToken, isAdmin, simulatedController.updateCycle);
router.delete("/cycles/:id", authenticateToken, isAdmin, simulatedController.deleteCycle);

module.exports = router;
