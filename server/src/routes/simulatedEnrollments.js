// routes/simulatedEnrollments.js
// Handles /api/simulated/enrollments AND /api/simulated/me & /api/simulated/my-history
const express = require("express");
const router = express.Router();
const { authenticateToken, isAdmin } = require("../middleware/auth");
const { simulatedEnrollValidationRules, validate } = require("../middleware/validators");
const simulatedEnrollmentController = require("../controllers/simulated/enrollmentController");

// ─────────────────────────────────────────────
// ENROLLMENTS — étudiant
// ─────────────────────────────────────────────

router.get("/me", authenticateToken, simulatedEnrollmentController.getMyEnrollment);
router.get("/my-history", authenticateToken, simulatedEnrollmentController.getMyHistory);
router.post(
  "/enroll", 
  authenticateToken, 
  simulatedEnrollValidationRules(),
  validate,
  simulatedEnrollmentController.enroll
);

// Note : we map /enrollments/:id in app.js as well, so this will be on root '/' or '/:id' depending on mounting
router.put(
  "/:id",
  authenticateToken,
  simulatedEnrollmentController.updateEnrollment
);

// ─────────────────────────────────────────────
// ENROLLMENTS — admin
// ─────────────────────────────────────────────

// Doit être AVANT /:id
router.post(
  "/force-enroll",
  authenticateToken,
  isAdmin,
  simulatedEnrollmentController.forceEnroll
);

router.get(
  "/",
  authenticateToken,
  isAdmin,
  simulatedEnrollmentController.getAllEnrollments
);

// Doit être AVANT /:id pour éviter que "export" soit capturé comme un :id
router.get(
  "/export",
  authenticateToken,
  isAdmin,
  simulatedEnrollmentController.exportCompletedCSV
);

router.get(
  "/:id",
  authenticateToken,
  isAdmin,
  simulatedEnrollmentController.getEnrollmentById
);

router.patch(
  "/:id/review",
  authenticateToken,
  isAdmin,
  simulatedEnrollmentController.reviewEnrollment
);

router.patch(
  "/:id/defend",
  authenticateToken,
  isAdmin,
  simulatedEnrollmentController.defendEnrollment
);

router.patch(
  "/:id/toggle-double-cycle",
  authenticateToken,
  isAdmin,
  simulatedEnrollmentController.toggleDoubleCycle
);

router.patch(
  "/:id/update-credits",
  authenticateToken,
  isAdmin,
  simulatedEnrollmentController.updateEnrollmentCredits
);

router.patch(
  "/:id/complete",
  authenticateToken,
  isAdmin,
  simulatedEnrollmentController.completeEnrollment
);

router.post(
  "/:id/relaunch",
  authenticateToken,
  isAdmin,
  simulatedEnrollmentController.relaunchEnrollment
);

router.delete(
  "/:id",
  authenticateToken,
  isAdmin,
  simulatedEnrollmentController.deleteEnrollment
);

module.exports = router;
