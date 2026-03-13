// routes/simulatedCycles.js
// Handles /api/simulated/cycles
const express = require("express");
const router = express.Router();
const { authenticateToken, isAdmin } = require("../middleware/auth");
const simulatedCycleController = require("../controllers/simulated/cycleController");

// Doit être AVANT /:id pour éviter que "current"/"upcoming" soient capturés comme un :id
router.get("/current", authenticateToken, simulatedCycleController.getCurrentCycle);
router.get("/upcoming", authenticateToken, simulatedCycleController.getUpcomingCycles);

router.get("/", authenticateToken, isAdmin, simulatedCycleController.getCycles);
router.post("/", authenticateToken, isAdmin, simulatedCycleController.createCycle);

// Import/génération doivent être AVANT /:id
router.post("/import", authenticateToken, isAdmin, simulatedCycleController.importCycles);
router.post("/generate", authenticateToken, isAdmin, simulatedCycleController.generateCycles);
router.put("/:id", authenticateToken, isAdmin, simulatedCycleController.updateCycle);
router.delete("/:id", authenticateToken, isAdmin, simulatedCycleController.deleteCycle);

module.exports = router;
