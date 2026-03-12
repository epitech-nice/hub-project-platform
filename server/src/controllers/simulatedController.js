// controllers/simulatedController.js
const path = require("path");
const fs = require("fs");
const SimulatedProject = require("../models/SimulatedProject");
const SimulatedEnrollment = require("../models/SimulatedEnrollment");
const SimulatedCycle = require("../models/SimulatedCycle");
const User = require("../models/User");
const emailService = require("../services/emailService");

// ─────────────────────────────────────────────
// CATALOGUE — routes admin
// ─────────────────────────────────────────────

// GET /api/simulated/catalog
// Admin : tous les projets | Étudiant : projets actifs uniquement
exports.getCatalog = async (req, res) => {
  try {
    const query = req.user.role === "admin" ? {} : { isActive: true };
    const projects = await SimulatedProject.find(query).sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: projects });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/simulated/catalog  (admin)
// Body: { title } + fichier PDF dans req.file
exports.createCatalogProject = async (req, res) => {
  try {
    const { title } = req.body;

    if (!title || !title.trim()) {
      // Supprimer le fichier uploadé si le titre est manquant
      if (req.file) fs.unlinkSync(req.file.path);
      return res
        .status(400)
        .json({ success: false, message: "Le titre est requis" });
    }

    const project = new SimulatedProject({
      title: title.trim(),
      subjectFile: req.file
        ? `simulated-subjects/${req.file.filename}`
        : null,
      createdBy: {
        userId: req.user._id,
        name: req.user.name,
      },
    });

    await project.save();
    res.status(201).json({ success: true, data: project });
  } catch (error) {
    if (req.file) fs.unlinkSync(req.file.path);
    res.status(500).json({ success: false, message: error.message });
  }
};

// PUT /api/simulated/catalog/:id  (admin)
// Body: { title?, isActive? } + fichier PDF optionnel dans req.file
exports.updateCatalogProject = async (req, res) => {
  try {
    const project = await SimulatedProject.findById(req.params.id);
    if (!project) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res
        .status(404)
        .json({ success: false, message: "Projet non trouvé" });
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
        const oldPath = path.join(
          __dirname,
          "../../uploads",
          project.subjectFile
        );
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      project.subjectFile = `simulated-subjects/${req.file.filename}`;
    }

    project.updatedAt = Date.now();
    await project.save();
    res.status(200).json({ success: true, data: project });
  } catch (error) {
    if (req.file) fs.unlinkSync(req.file.path);
    res.status(500).json({ success: false, message: error.message });
  }
};

// DELETE /api/simulated/catalog/:id  (admin)
exports.deleteCatalogProject = async (req, res) => {
  try {
    const project = await SimulatedProject.findById(req.params.id);
    if (!project) {
      return res
        .status(404)
        .json({ success: false, message: "Projet non trouvé" });
    }

    // Supprimer le fichier PDF associé
    if (project.subjectFile) {
      const filePath = path.join(
        __dirname,
        "../../uploads",
        project.subjectFile
      );
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await SimulatedProject.findByIdAndDelete(req.params.id);
    res
      .status(200)
      .json({ success: true, message: "Projet supprimé avec succès" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/simulated/catalog/:id
// Retourne un projet du catalogue par son ID.
// Pour les étudiants : visible si actif OU si l'étudiant a un enrollment dessus
exports.getCatalogProjectById = async (req, res) => {
  try {
    const project = await SimulatedProject.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, message: "Projet non trouvé" });
    }

    if (req.user.role !== "admin" && !project.isActive) {
      // Permettre l'accès si l'étudiant a un enrollment sur ce projet
      const enrollment = await SimulatedEnrollment.findOne({
        "student.userId": req.user._id,
        "simulatedProject.projectId": req.params.id,
      });
      if (!enrollment) {
        return res.status(404).json({ success: false, message: "Projet non trouvé" });
      }
    }

    res.status(200).json({ success: true, data: project });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────
// ENROLLMENTS — routes étudiant
// ─────────────────────────────────────────────

// GET /api/simulated/me
// Retourne l'enrollment actif de l'étudiant (pending, pending_changes, ou approved non terminé)
exports.getMyEnrollment = async (req, res) => {
  try {
    // PAS de .populate() — simulatedProject.projectId doit rester un string pour la comparaison côté front
    const enrollment = await SimulatedEnrollment.findOne({
      "student.userId": req.user._id,
      status: { $in: ["pending", "pending_changes", "approved"] },
    }).sort({ submittedAt: -1 });

    res.status(200).json({ success: true, data: enrollment || null });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/simulated/my-history
// Tous les cycles de l'étudiant (pour savoir quels projets ont déjà été faits)
exports.getMyHistory = async (req, res) => {
  try {
    const enrollments = await SimulatedEnrollment.find({
      "student.userId": req.user._id,
    }).sort({ submittedAt: -1 });

    res.status(200).json({ success: true, data: enrollments });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/simulated/enroll
// Body: { projectId, githubProjectLink }
// Inscription phase 1 : fenêtre ouverte = startDate <= now <= firstSubmissionDeadline
exports.enroll = async (req, res) => {
  try {
    const { projectId, githubProjectLink } = req.body;

    if (!projectId || !githubProjectLink) {
      return res.status(400).json({
        success: false,
        message: "Le projet et le lien GitHub Project sont requis",
      });
    }

    // Vérifier qu'un cycle phase 1 est ouvert (startDate <= now <= firstSubmissionDeadline)
    const now = new Date();
    const openCycle = await SimulatedCycle.findOne({
      startDate: { $lte: now },
      firstSubmissionDeadline: { $gte: now },
    });
    if (!openCycle) {
      return res.status(400).json({
        success: false,
        message:
          "Aucune fenêtre de dépôt phase 1 n'est ouverte en ce moment. Revenez lors du prochain cycle.",
      });
    }

    // Vérifier que le projet existe et est actif
    const simulatedProject = await SimulatedProject.findById(projectId);
    if (!simulatedProject || !simulatedProject.isActive) {
      return res
        .status(404)
        .json({ success: false, message: "Projet non trouvé ou inactif" });
    }

    // Vérifier que l'étudiant n'a pas déjà un enrollment actif (toutes phases)
    const activeEnrollment = await SimulatedEnrollment.findOne({
      "student.userId": req.user._id,
      status: { $in: ["pending", "pending_changes", "approved"] },
    });
    if (activeEnrollment) {
      return res.status(400).json({
        success: false,
        message:
          "Vous avez déjà un projet en cours. Attendez qu'il soit terminé avant d'en soumettre un nouveau.",
      });
    }

    // Vérifier que ce projet n'a pas déjà été complété par cet étudiant
    // (un cycle complet = phase 2 approuvée ou complétée)
    // Note : après un relancement, l'enrollment est remis en phase 1 donc cette query ne match plus
    const alreadyDone = await SimulatedEnrollment.findOne({
      "student.userId": req.user._id,
      "simulatedProject.projectId": projectId,
      phase: 2,
      status: { $in: ["approved", "completed"] },
    });
    if (alreadyDone) {
      return res.status(400).json({
        success: false,
        message: "Vous avez déjà effectué ce projet",
      });
    }

    // Déterminer le numéro de cycle global pour cet étudiant
    const previousCycles = await SimulatedEnrollment.countDocuments({
      "student.userId": req.user._id,
      phase: 1,
    });

    const enrollment = new SimulatedEnrollment({
      student: {
        userId: req.user._id,
        name: req.user.name,
        email: req.user.email,
      },
      simulatedProject: {
        projectId: simulatedProject._id,
        title: simulatedProject.title,
      },
      cycleNumber: previousCycles + 1,
      phase: 1,
      githubProjectLink,
      // Dates phase 1 injectées depuis le cycle ouvert
      startDate: openCycle.startDate,
      submissionDeadline: openCycle.firstSubmissionDeadline,
      defenseDate: openCycle.firstDefenseDate,
      isDoubleCycle: openCycle.isDoubleCycle,
    });

    await enrollment.save();
    res.status(201).json({ success: true, data: enrollment });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// PUT /api/simulated/enrollments/:id
// Modifier le githubProjectLink (si non locké et statut pending/pending_changes)
exports.updateEnrollment = async (req, res) => {
  try {
    const { githubProjectLink } = req.body;
    const enrollment = await SimulatedEnrollment.findById(req.params.id);

    if (!enrollment) {
      return res
        .status(404)
        .json({ success: false, message: "Enrollment non trouvé" });
    }

    // Vérifier que c'est bien l'étudiant propriétaire
    if (enrollment.student.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Non autorisé" });
    }

    // Bloquer si lockedByAdmin
    if (enrollment.lockedByAdmin) {
      return res.status(400).json({
        success: false,
        message:
          "Ce cycle a été validé par un administrateur et ne peut plus être modifié",
      });
    }

    // Bloquer si statut n'est pas pending ou pending_changes
    if (!["pending", "pending_changes"].includes(enrollment.status)) {
      return res.status(400).json({
        success: false,
        message: "Ce cycle ne peut plus être modifié",
      });
    }

    enrollment.githubProjectLink = githubProjectLink;

    // Toujours noter la mise à jour dans l'historique
    const newStatus = enrollment.status === "pending_changes" ? "pending" : enrollment.status;
    enrollment.changeHistory.push({
      status: newStatus,
      comments: "Lien GitHub mis à jour par l'étudiant",
      reviewer: { userId: req.user._id, name: req.user.name },
      date: new Date(),
    });

    // Si l'étudiant resoumets après pending_changes → repasse en pending
    if (enrollment.status === "pending_changes") {
      enrollment.status = "pending";
    }

    enrollment.updatedAt = Date.now();
    await enrollment.save();
    res.status(200).json({ success: true, data: enrollment });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────
// ENROLLMENTS — routes admin
// ─────────────────────────────────────────────

// POST /api/simulated/force-enroll  (admin)
// Inscrit de force un étudiant même si la deadline est dépassée.
// Body: { projectId, studentEmail }
exports.forceEnroll = async (req, res) => {
  try {
    const { projectId, studentEmail } = req.body;

    if (!projectId || !studentEmail) {
      return res.status(400).json({
        success: false,
        message: "Le projet et l'email de l'étudiant sont requis",
      });
    }

    // Trouver l'étudiant par email
    const student = await User.findOne({ email: studentEmail.trim().toLowerCase() });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: `Aucun utilisateur trouvé avec l'email : ${studentEmail}`,
      });
    }

    // Vérifier que le projet existe
    const simulatedProject = await SimulatedProject.findById(projectId);
    if (!simulatedProject) {
      return res.status(404).json({ success: false, message: "Projet non trouvé" });
    }

    // Vérifier que l'étudiant n'a pas déjà un enrollment actif
    const activeEnrollment = await SimulatedEnrollment.findOne({
      "student.userId": student._id,
      status: { $in: ["pending", "pending_changes", "approved"] },
    });
    if (activeEnrollment) {
      return res.status(400).json({
        success: false,
        message: `L'étudiant a déjà un projet en cours : "${activeEnrollment.simulatedProject.title}"`,
      });
    }

    // Vérifier que ce projet n'est pas déjà complété par cet étudiant
    const alreadyDone = await SimulatedEnrollment.findOne({
      "student.userId": student._id,
      "simulatedProject.projectId": projectId,
      status: "completed",
    });
    if (alreadyDone) {
      return res.status(400).json({
        success: false,
        message: "L'étudiant a déjà complété ce projet",
      });
    }

    // Déterminer le numéro de cycle
    const previousCycles = await SimulatedEnrollment.countDocuments({
      "student.userId": student._id,
      phase: 1,
    });

    const enrollment = new SimulatedEnrollment({
      student: {
        userId: student._id,
        name: student.name,
        email: student.email,
      },
      simulatedProject: {
        projectId: simulatedProject._id,
        title: simulatedProject.title,
      },
      cycleNumber: previousCycles + 1,
      phase: 1,
      githubProjectLink: null,
      // Pas de dates de cycle — l'étudiant soumettra son lien manuellement
    });

    enrollment.changeHistory.push({
      status: "pending",
      comments: `Inscription forcée par l'administrateur ${req.user.name}`,
      reviewer: { userId: req.user._id, name: req.user.name },
      date: new Date(),
    });

    await enrollment.save();
    res.status(201).json({ success: true, data: enrollment });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/simulated/enrollments
exports.getAllEnrollments = async (req, res) => {
  try {
    const { status } = req.query;
    const query = status ? { status } : {};
    const enrollments = await SimulatedEnrollment.find(query).sort({
      submittedAt: -1,
    });
    res
      .status(200)
      .json({ success: true, count: enrollments.length, data: enrollments });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/simulated/enrollments/:id
exports.getEnrollmentById = async (req, res) => {
  try {
    const enrollment = await SimulatedEnrollment.findById(req.params.id);
    if (!enrollment) {
      return res
        .status(404)
        .json({ success: false, message: "Enrollment non trouvé" });
    }
    res.status(200).json({ success: true, data: enrollment });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// PATCH /api/simulated/enrollments/:id/review  (admin)
// Body: { status: 'approved'|'rejected'|'pending_changes', comments? }
// Validation du GitHub Project seulement — sans crédits.
// approved      → lockedByAdmin = true  (étudiant ne peut plus modifier en attendant la défense)
// pending_changes / rejected → lockedByAdmin = false
exports.reviewEnrollment = async (req, res) => {
  try {
    const { status, comments } = req.body;

    if (!["approved", "rejected", "pending_changes"].includes(status)) {
      return res.status(400).json({ success: false, message: "Statut invalide" });
    }

    const enrollment = await SimulatedEnrollment.findById(req.params.id);
    if (!enrollment) {
      return res.status(404).json({ success: false, message: "Enrollment non trouvé" });
    }

    if (enrollment.status === "completed") {
      return res.status(400).json({ success: false, message: "Ce cycle est terminé" });
    }

    const oldStatus = enrollment.status;

    enrollment.status = status;
    enrollment.lockedByAdmin = status === "approved";
    enrollment.reviewedBy = {
      userId: req.user._id,
      name: req.user.name,
      comments: comments || "",
    };
    enrollment.changeHistory.push({
      status,
      comments: comments || "",
      reviewer: { userId: req.user._id, name: req.user.name },
      date: new Date(),
    });
    enrollment.updatedAt = Date.now();

    await enrollment.save();

    if (oldStatus !== status) {
      try {
        await emailService.sendStatusChangeEmail(enrollment, status, false, true);
      } catch (emailError) {
        console.error("Erreur envoi email simulated:", emailError);
      }
    }

    res.status(200).json({ success: true, data: enrollment });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// PATCH /api/simulated/enrollments/:id/defend  (admin)
// Body: { credits, comments? }
// Enregistre la défense du cycle courant (phase 1 ou 2) et assigne les crédits.
// Phase 1 defense → stocke phase1Credits, passe phase:2, status:"pending_changes" (étudiant met à jour GitHub)
// Phase 2 defense → stocke credits, status:"approved" + lockedByAdmin (admin décide complete/relaunch)
exports.defendEnrollment = async (req, res) => {
  try {
    const { credits, comments } = req.body;

    const enrollment = await SimulatedEnrollment.findById(req.params.id);
    if (!enrollment) {
      return res.status(404).json({ success: false, message: "Enrollment non trouvé" });
    }

    if (enrollment.status !== "approved") {
      return res.status(400).json({
        success: false,
        message: "Le projet doit être approuvé avant de passer la défense",
      });
    }

    // Vérifier que la défense n'a pas déjà été effectuée pour cette phase
    if (enrollment.phase === 1 && enrollment.phase1Credits !== null) {
      return res.status(400).json({
        success: false,
        message: "La défense de la phase 1 a déjà été effectuée",
      });
    }
    if (enrollment.phase === 2 && enrollment.credits !== null) {
      return res.status(400).json({
        success: false,
        message: "La défense de la phase 2 a déjà été effectuée",
      });
    }

    if (credits === undefined || credits === null) {
      return res.status(400).json({
        success: false,
        message: "Les crédits sont requis pour valider la défense",
      });
    }

    const validValues = enrollment.isDoubleCycle
      ? SimulatedEnrollment.VALID_CREDITS_DOUBLE
      : SimulatedEnrollment.VALID_CREDITS_NORMAL;
    if (!validValues.includes(Number(credits))) {
      return res.status(400).json({
        success: false,
        message: `Valeur de crédits invalide. Valeurs acceptées : ${validValues.join(", ")}`,
      });
    }

    const defenseNumber = enrollment.defenseHistory.length + 1;
    const creditValue = Number(credits);

    enrollment.defenseHistory.push({
      defenseNumber,
      cycleNumber: enrollment.cycleNumber,
      phase: enrollment.phase,
      credits: creditValue,
      comments: comments || "",
      reviewer: { userId: req.user._id, name: req.user.name },
      date: new Date(),
    });
    enrollment.totalCredits = (enrollment.totalCredits || 0) + creditValue;

    if (enrollment.phase === 1) {
      // Transition vers la phase 2
      enrollment.phase1Credits = creditValue;
      enrollment.phase = 2;
      enrollment.status = "pending_changes"; // étudiant doit mettre à jour son GitHub
      enrollment.lockedByAdmin = false;
      enrollment.changeHistory.push({
        status: "pending_changes",
        comments: `Défense ${defenseNumber} (phase 1) — ${creditValue} crédit(s)${comments ? `. ${comments}` : ""}`,
        reviewer: { userId: req.user._id, name: req.user.name },
        date: new Date(),
      });
    } else {
      // Phase 2 — défense finale
      enrollment.credits = creditValue;
      enrollment.status = "approved";
      enrollment.lockedByAdmin = true;
      enrollment.changeHistory.push({
        status: "approved",
        comments: `Défense ${defenseNumber} (phase 2) — ${creditValue} crédit(s)${comments ? `. ${comments}` : ""}`,
        reviewer: { userId: req.user._id, name: req.user.name },
        date: new Date(),
      });
    }

    enrollment.reviewedBy = {
      userId: req.user._id,
      name: req.user.name,
      comments: comments || "",
    };
    enrollment.updatedAt = Date.now();
    await enrollment.save();

    try {
      await emailService.sendStatusChangeEmail(enrollment, enrollment.status, false, true);
    } catch (emailError) {
      console.error("Erreur envoi email défense simulated:", emailError);
    }

    res.status(200).json({ success: true, data: enrollment });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// PATCH /api/simulated/enrollments/:id/toggle-double-cycle  (admin)
exports.toggleDoubleCycle = async (req, res) => {
  try {
    const enrollment = await SimulatedEnrollment.findById(req.params.id);
    if (!enrollment) {
      return res
        .status(404)
        .json({ success: false, message: "Enrollment non trouvé" });
    }

    // Bloqué uniquement si le cycle est terminé
    if (enrollment.status === "completed") {
      return res.status(400).json({
        success: false,
        message: "Ce cycle est terminé et ne peut plus être modifié",
      });
    }

    enrollment.isDoubleCycle = !enrollment.isDoubleCycle;
    // Réinitialiser les crédits si la valeur actuelle devient invalide après le changement de type
    if (enrollment.credits !== null) {
      const validValues = enrollment.isDoubleCycle
        ? SimulatedEnrollment.VALID_CREDITS_DOUBLE
        : SimulatedEnrollment.VALID_CREDITS_NORMAL;
      if (!validValues.includes(enrollment.credits)) {
        enrollment.credits = null;
      }
    }
    enrollment.updatedAt = Date.now();

    await enrollment.save();
    res.status(200).json({ success: true, data: enrollment });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// PATCH /api/simulated/enrollments/:id/update-credits  (admin)
// Permet à l'admin de modifier les crédits même après approbation (tant que non terminé)
exports.updateEnrollmentCredits = async (req, res) => {
  try {
    const { credits } = req.body;
    const enrollment = await SimulatedEnrollment.findById(req.params.id);
    if (!enrollment) {
      return res
        .status(404)
        .json({ success: false, message: "Enrollment non trouvé" });
    }

    if (enrollment.status === "completed") {
      return res.status(400).json({
        success: false,
        message: "Ce cycle est terminé et ne peut plus être modifié",
      });
    }

    if (credits === undefined || credits === null) {
      return res.status(400).json({ success: false, message: "Les crédits sont requis" });
    }

    const validValues = enrollment.isDoubleCycle
      ? SimulatedEnrollment.VALID_CREDITS_DOUBLE
      : SimulatedEnrollment.VALID_CREDITS_NORMAL;
    if (!validValues.includes(Number(credits))) {
      return res.status(400).json({
        success: false,
        message: `Valeur de crédits invalide. Valeurs acceptées : ${validValues.join(", ")}`,
      });
    }

    enrollment.credits = Number(credits);
    enrollment.updatedAt = Date.now();
    await enrollment.save();
    res.status(200).json({ success: true, data: enrollment });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// PATCH /api/simulated/enrollments/:id/complete  (admin)
// Marque le cycle comme terminé — lecture seule après ça
exports.completeEnrollment = async (req, res) => {
  try {
    const enrollment = await SimulatedEnrollment.findById(req.params.id);
    if (!enrollment) {
      return res
        .status(404)
        .json({ success: false, message: "Enrollment non trouvé" });
    }

    if (enrollment.status !== "approved") {
      return res.status(400).json({
        success: false,
        message: "Seuls les cycles approuvés peuvent être marqués comme terminés",
      });
    }

    enrollment.status = "completed";
    enrollment.changeHistory.push({
      status: "completed",
      comments: "Cycle marqué comme terminé par l'administrateur",
      reviewer: {
        userId: req.user._id,
        name: req.user.name,
      },
      date: new Date(),
    });
    enrollment.updatedAt = Date.now();
    await enrollment.save();

    res.status(200).json({ success: true, data: enrollment });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/simulated/enrollments/export  (admin)
// Exporte les cycles terminés en CSV avec filtre de date
exports.exportCompletedCSV = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const query = { status: "completed" };

    if (startDate || endDate) {
      query.updatedAt = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        query.updatedAt.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.updatedAt.$lte = end;
      }
    }

    const enrollments = await SimulatedEnrollment.find(query).sort({ updatedAt: -1 });

    if (enrollments.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Aucun cycle terminé trouvé pour la période spécifiée",
      });
    }

    const csvHeader = "login;projet;cycles_effectues;double_cycle;total_credits\n";
    const csvRows = enrollments
      .map(
        (e) =>
          `${e.student.email};${e.simulatedProject.title};${e.cycleNumber};${
            e.isDoubleCycle ? "Oui" : "Non"
          };${e.totalCredits ?? 0}`
      )
      .join("\n");

    const csvContent = csvHeader + csvRows;
    const filename = `simulated_completed_${startDate || "all"}_to_${endDate || "all"}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.write("\uFEFF");
    res.write(csvContent);
    res.end();
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/simulated/enrollments/:id/relaunch  (admin)
// Remet l'enrollment en phase 1 (nouveau cycle 4 semaines sur le même projet).
// Le même enrollment est réutilisé — l'étudiant met simplement à jour son lien GitHub.
// Nécessite que l'enrollment soit une phase 2 approuvée ou terminée.
exports.relaunchEnrollment = async (req, res) => {
  try {
    const enrollment = await SimulatedEnrollment.findById(req.params.id);
    if (!enrollment) {
      return res.status(404).json({ success: false, message: "Enrollment non trouvé" });
    }

    if (enrollment.phase !== 2) {
      return res.status(400).json({
        success: false,
        message: "Le relancement n'est possible que depuis un enrollment de phase 2",
      });
    }

    if (!["approved", "completed"].includes(enrollment.status)) {
      return res.status(400).json({
        success: false,
        message: "Le relancement nécessite un cycle approuvé ou terminé",
      });
    }

    // Réinitialiser l'enrollment pour un nouveau cycle
    enrollment.phase = 1;
    enrollment.status = "pending";
    enrollment.cycleNumber += 1;
    enrollment.credits = null;
    enrollment.phase1Credits = null;
    enrollment.lockedByAdmin = false;
    // githubProjectLink conservé — l'étudiant peut le mettre à jour si besoin
    enrollment.changeHistory.push({
      status: "pending",
      comments: `Cycle n°${enrollment.cycleNumber} relancé par l'administrateur`,
      reviewer: { userId: req.user._id, name: req.user.name },
      date: new Date(),
    });
    enrollment.updatedAt = Date.now();
    await enrollment.save();

    res.status(200).json({ success: true, data: enrollment });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// DELETE /api/simulated/enrollments/:id  (admin)
exports.deleteEnrollment = async (req, res) => {
  try {
    const enrollment = await SimulatedEnrollment.findById(req.params.id);
    if (!enrollment) {
      return res
        .status(404)
        .json({ success: false, message: "Enrollment non trouvé" });
    }
    await SimulatedEnrollment.findByIdAndDelete(req.params.id);
    res
      .status(200)
      .json({ success: true, message: "Enrollment supprimé avec succès" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

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
exports.getUpcomingCycles = async (_req, res) => {
  try {
    const cycles = await SimulatedCycle.find().sort({ startDate: 1 });
    res.status(200).json({ success: true, data: cycles });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/simulated/cycles/current
// Retourne le cycle courant et la phase ouverte (1 ou 2), ou null si aucune fenêtre ouverte.
// Phase 1 ouverte : startDate <= now <= firstSubmissionDeadline
// Phase 2 ouverte : firstDefenseDate <= now <= secondSubmissionDeadline
exports.getCurrentCycle = async (_req, res) => {
  try {
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
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/simulated/cycles  (admin)
// Retourne tous les cycles triés par date de début
exports.getCycles = async (_req, res) => {
  try {
    const cycles = await SimulatedCycle.find().sort({ startDate: 1 });
    res.status(200).json({ success: true, data: cycles });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/simulated/cycles  (admin)
// Body: { name, startDate, firstSubmissionDeadline, firstDefenseDate, secondSubmissionDeadline, secondDefenseDate, isDoubleCycle? }
exports.createCycle = async (req, res) => {
  try {
    const {
      name, startDate,
      firstSubmissionDeadline, firstDefenseDate,
      secondSubmissionDeadline, secondDefenseDate,
      isDoubleCycle,
    } = req.body;

    if (!name || !startDate || !firstSubmissionDeadline || !firstDefenseDate || !secondSubmissionDeadline || !secondDefenseDate) {
      return res.status(400).json({
        success: false,
        message: "Tous les champs de dates sont requis (startDate, firstSubmissionDeadline, firstDefenseDate, secondSubmissionDeadline, secondDefenseDate)",
      });
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
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// PUT /api/simulated/cycles/:id  (admin)
exports.updateCycle = async (req, res) => {
  try {
    const cycle = await SimulatedCycle.findById(req.params.id);
    if (!cycle) {
      return res.status(404).json({ success: false, message: "Cycle non trouvé" });
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
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// DELETE /api/simulated/cycles/:id  (admin)
exports.deleteCycle = async (req, res) => {
  try {
    const cycle = await SimulatedCycle.findById(req.params.id);
    if (!cycle) {
      return res.status(404).json({ success: false, message: "Cycle non trouvé" });
    }
    await SimulatedCycle.findByIdAndDelete(req.params.id);
    res.status(200).json({ success: true, message: "Cycle supprimé avec succès" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/simulated/cycles/import  (admin)
// Body: { cycles: [{ name, startDate, firstSubmissionDeadline, firstDefenseDate, secondSubmissionDeadline, secondDefenseDate, isDoubleCycle? }] }
exports.importCycles = async (req, res) => {
  try {
    const { cycles } = req.body;

    if (!Array.isArray(cycles) || cycles.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Un tableau de cycles non vide est requis",
      });
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
        return res.status(400).json({
          success: false,
          message: `Cycle ${i + 1} : tous les champs de dates sont requis`,
        });
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
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/simulated/cycles/generate  (admin)
// Body: { firstStartDate, numberOfCycles, namePrefix? }
// Génère N cycles de 4 semaines consécutifs
// Pattern par cycle (W0=vendredi de départ) :
//   firstSubmissionDeadline = W0+5j (mercredi)
//   firstDefenseDate        = W0+14j (vendredi)
//   secondSubmissionDeadline = W0+19j (mercredi)
//   secondDefenseDate       = W0+28j (vendredi) → startDate du cycle suivant
exports.generateCycles = async (req, res) => {
  try {
    const { firstStartDate, numberOfCycles, namePrefix } = req.body;

    if (!firstStartDate || !numberOfCycles) {
      return res.status(400).json({
        success: false,
        message: "firstStartDate et numberOfCycles sont requis",
      });
    }

    const n = parseInt(numberOfCycles);
    if (isNaN(n) || n < 1 || n > 26) {
      return res.status(400).json({
        success: false,
        message: "numberOfCycles doit être entre 1 et 26",
      });
    }

    const prefix = namePrefix ? String(namePrefix).trim() : "Cycle";
    const toInsert = [];
    // addDays uses pure UTC arithmetic to avoid DST shift issues
    const addDays = (isoStr, d) => {
      const [y, m, day] = String(isoStr).slice(0, 10).split("-").map(Number);
      return new Date(Date.UTC(y, m - 1, day + d));
    };
    let currentStart = String(firstStartDate).slice(0, 10); // ISO string YYYY-MM-DD

    for (let i = 0; i < n; i++) {
      toInsert.push({
        name: `${prefix} ${i + 1}`,
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
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
