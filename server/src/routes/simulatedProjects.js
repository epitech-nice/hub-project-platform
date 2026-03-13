// routes/simulatedProjects.js
// Handles /api/simulated/catalog
const express = require("express");
const router = express.Router();
const { authenticateToken, isAdmin } = require("../middleware/auth");
const upload = require("../middleware/upload");
const simulatedProjectController = require("../controllers/simulated/projectController");

// Accessible à tous les utilisateurs authentifiés (filtre admin/étudiant dans le controller)
router.get("/", authenticateToken, simulatedProjectController.getCatalog);

// Récupère un projet par ID — doit être AVANT les routes admin PUT/DELETE /catalog/:id
// pour les étudiants : retourne même si inactif si enrollment existant
router.get("/:id", authenticateToken, simulatedProjectController.getCatalogProjectById);

// Admin uniquement : CRUD catalogue
router.post(
  "/",
  authenticateToken,
  isAdmin,
  upload.single("subjectFile"),
  simulatedProjectController.createCatalogProject
);

router.put(
  "/:id",
  authenticateToken,
  isAdmin,
  upload.single("subjectFile"),
  simulatedProjectController.updateCatalogProject
);

router.delete(
  "/:id",
  authenticateToken,
  isAdmin,
  simulatedProjectController.deleteCatalogProject
);

module.exports = router;
