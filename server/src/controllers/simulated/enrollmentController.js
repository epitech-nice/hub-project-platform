// controllers/simulated/enrollmentController.js
const SimulatedProject = require("../../models/SimulatedProject");
const SimulatedEnrollment = require("../../models/SimulatedEnrollment");
const SimulatedCycle = require("../../models/SimulatedCycle");
const User = require("../../models/User");
const emailService = require("../../services/emailService");
const { SIMULATED_STATUSES } = require("../../utils/constants");
const asyncHandler = require("../../middleware/asyncHandler");
const ErrorResponse = require("../../utils/errorResponse");
const backgroundJobs = require("../../utils/backgroundJobs");

// ─────────────────────────────────────────────
// ENROLLMENTS — routes étudiant
// ─────────────────────────────────────────────

// GET /api/simulated/me
// Retourne l'enrollment actif de l'étudiant (pending, pending_changes, ou approved non terminé)
exports.getMyEnrollment = asyncHandler(async (req, res, next) => {
  // PAS de .populate() — simulatedProject.projectId doit rester un string pour la comparaison côté front
  const enrollment = await SimulatedEnrollment.findOne({
    "student.userId": req.user._id,
    status: { $in: ["pending", "pending_changes", "approved"] },
  }).sort({ submittedAt: -1 });

  res.status(200).json({ success: true, data: enrollment || null });
});

// GET /api/simulated/my-history
// Tous les cycles de l'étudiant (pour savoir quels projets ont déjà été faits)
exports.getMyHistory = asyncHandler(async (req, res, next) => {
  const enrollments = await SimulatedEnrollment.find({
    "student.userId": req.user._id,
  }).sort({ submittedAt: -1 }).lean();

  res.status(200).json({ success: true, count: enrollments.length, data: enrollments });
});

// POST /api/simulated/enroll
// Body: { projectId, githubProjectLink }
// Inscription phase 1 : fenêtre ouverte = startDate <= now <= firstSubmissionDeadline
exports.enroll = asyncHandler(async (req, res, next) => {
  const { projectId, githubProjectLink } = req.body;

  if (!projectId || !githubProjectLink) {
    return next(new ErrorResponse("Le projet et le lien GitHub Project sont requis", 400));
  }

  // Vérifier qu'un cycle phase 1 est ouvert (startDate <= now <= firstSubmissionDeadline)
  const now = new Date();
  const openCycle = await SimulatedCycle.findOne({
    startDate: { $lte: now },
    firstSubmissionDeadline: { $gte: now },
  });
  if (!openCycle) {
    return next(new ErrorResponse("Aucune fenêtre de dépôt phase 1 n'est ouverte en ce moment. Revenez lors du prochain cycle.", 400));
  }

  // Vérifier que le projet existe et est actif
  const simulatedProject = await SimulatedProject.findById(projectId);
  if (!simulatedProject || !simulatedProject.isActive) {
    return next(new ErrorResponse("Projet non trouvé ou inactif", 404));
  }

  // Vérifier que l'étudiant n'a pas déjà un enrollment actif (toutes phases)
  const activeEnrollment = await SimulatedEnrollment.findOne({
    "student.userId": req.user._id,
    status: { $in: [SIMULATED_STATUSES.PENDING, SIMULATED_STATUSES.PENDING_CHANGES, SIMULATED_STATUSES.APPROVED] },
  });
  if (activeEnrollment) {
    return next(new ErrorResponse("Vous avez déjà un projet en cours. Attendez qu'il soit terminé avant d'en soumettre un nouveau.", 400));
  }

  // Vérifier que ce projet n'a pas déjà été complété par cet étudiant
  const alreadyDone = await SimulatedEnrollment.findOne({
    "student.userId": req.user._id,
    "simulatedProject.projectId": projectId,
    phase: 2,
    status: { $in: [SIMULATED_STATUSES.APPROVED, SIMULATED_STATUSES.COMPLETED] },
  });
  if (alreadyDone) {
    return next(new ErrorResponse("Vous avez déjà effectué ce projet", 400));
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
    startDate: openCycle.startDate,
    submissionDeadline: openCycle.firstSubmissionDeadline,
    defenseDate: openCycle.firstDefenseDate,
    isDoubleCycle: openCycle.isDoubleCycle,
  });

  await enrollment.save();
  res.status(201).json({ success: true, data: enrollment });
});

// PUT /api/simulated/enrollments/:id
// Modifier le githubProjectLink (si non locké et statut pending/pending_changes)
exports.updateEnrollment = asyncHandler(async (req, res, next) => {
  const { githubProjectLink } = req.body;
  const enrollment = await SimulatedEnrollment.findById(req.params.id);

  if (!enrollment) {
    return next(new ErrorResponse("Enrollment non trouvé", 404));
  }

  // Vérifier que c'est bien l'étudiant propriétaire
  if (enrollment.student.userId.toString() !== req.user._id.toString()) {
    return next(new ErrorResponse("Non autorisé", 403));
  }

  // Bloquer si lockedByAdmin
  if (enrollment.lockedByAdmin) {
    return next(new ErrorResponse("Ce cycle a été validé par un administrateur et ne peut plus être modifié", 400));
  }

  // Bloquer si statut n'est pas pending ou pending_changes
  if (![SIMULATED_STATUSES.PENDING, SIMULATED_STATUSES.PENDING_CHANGES].includes(enrollment.status)) {
    return next(new ErrorResponse("Ce cycle ne peut plus être modifié", 400));
  }

  enrollment.githubProjectLink = githubProjectLink;

  // Toujours noter la mise à jour dans l'historique
  const newStatus = enrollment.status === SIMULATED_STATUSES.PENDING_CHANGES ? SIMULATED_STATUSES.PENDING : enrollment.status;
  enrollment.changeHistory.push({
    status: newStatus,
    comments: "Lien GitHub mis à jour par l'étudiant",
    reviewer: { userId: req.user._id, name: req.user.name },
    date: new Date(),
  });

  // Si l'étudiant resoumets après pending_changes → repasse en pending
  if (enrollment.status === SIMULATED_STATUSES.PENDING_CHANGES) {
    enrollment.status = SIMULATED_STATUSES.PENDING;
  }

  enrollment.updatedAt = Date.now();
  await enrollment.save();
  res.status(200).json({ success: true, data: enrollment });
});

// ─────────────────────────────────────────────
// ENROLLMENTS — routes admin
// ─────────────────────────────────────────────

// POST /api/simulated/force-enroll  (admin)
// Inscrit de force un étudiant même si la deadline est dépassée.
// Body: { projectId, studentEmail }
exports.forceEnroll = asyncHandler(async (req, res, next) => {
  const { projectId, studentEmail } = req.body;

  if (!projectId || !studentEmail) {
    return next(new ErrorResponse("Le projet et l'email de l'étudiant sont requis", 400));
  }

  // Trouver l'étudiant par email
  const student = await User.findOne({ email: studentEmail.trim().toLowerCase() });
  if (!student) {
    return next(new ErrorResponse(`Aucun utilisateur trouvé avec l'email : ${studentEmail}`, 404));
  }

  // Vérifier que le projet existe
  const simulatedProject = await SimulatedProject.findById(projectId);
  if (!simulatedProject) {
    return next(new ErrorResponse("Projet non trouvé", 404));
  }

  // Vérifier que l'étudiant n'a pas déjà un enrollment actif
  const activeEnrollment = await SimulatedEnrollment.findOne({
    "student.userId": student._id,
    status: { $in: [SIMULATED_STATUSES.PENDING, SIMULATED_STATUSES.PENDING_CHANGES, SIMULATED_STATUSES.APPROVED] },
  });
  if (activeEnrollment) {
    return next(new ErrorResponse(`L'étudiant a déjà un projet en cours : "${activeEnrollment.simulatedProject.title}"`, 400));
  }

  // Vérifier que ce projet n'est pas déjà complété par cet étudiant
  const alreadyDone = await SimulatedEnrollment.findOne({
    "student.userId": student._id,
    "simulatedProject.projectId": projectId,
    status: SIMULATED_STATUSES.COMPLETED,
  });
  if (alreadyDone) {
    return next(new ErrorResponse("L'étudiant a déjà complété ce projet", 400));
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
    status: SIMULATED_STATUSES.PENDING,
    comments: `Inscription forcée par l'administrateur ${req.user.name}`,
    reviewer: { userId: req.user._id, name: req.user.name },
    date: new Date(),
  });

  await enrollment.save();
  res.status(201).json({ success: true, data: enrollment });
});

// GET /api/simulated/enrollments
// Ajout de pagination pour cet appel admin lourd
exports.getAllEnrollments = asyncHandler(async (req, res, next) => {
  const { status, page = 1, limit = 20 } = req.query;
  const query = status ? { status } : {};

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const skip = (pageNum - 1) * limitNum;

  const [enrollments, total] = await Promise.all([
    SimulatedEnrollment.find(query)
      .sort({ submittedAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    SimulatedEnrollment.countDocuments(query)
  ]);

  res.status(200).json({ 
    success: true, 
    count: enrollments.length, 
    total,
    page: pageNum,
    totalPages: Math.ceil(total / limitNum),
    data: enrollments 
  });
});

// GET /api/simulated/enrollments/export  (admin)
// Exporte les cycles terminés en CSV avec filtre de date
exports.exportCompletedCSV = asyncHandler(async (req, res, next) => {
  const { startDate, endDate } = req.query;
  const query = { status: SIMULATED_STATUSES.COMPLETED };

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

  const enrollments = await SimulatedEnrollment.find(query)
    .sort({ updatedAt: -1 })
    .lean();

  if (enrollments.length === 0) {
    return next(new ErrorResponse("Aucun cycle terminé trouvé pour la période spécifiée", 404));
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
});

// GET /api/simulated/enrollments/:id
exports.getEnrollmentById = asyncHandler(async (req, res, next) => {
  const enrollment = await SimulatedEnrollment.findById(req.params.id).lean();
  if (!enrollment) {
    return next(new ErrorResponse("Enrollment non trouvé", 404));
  }
  res.status(200).json({ success: true, data: enrollment });
});

// PATCH /api/simulated/enrollments/:id/review  (admin)
// Body: { status: 'approved'|'rejected'|'pending_changes', comments? }
// Validation du GitHub Project seulement — sans crédits.
// approved      → lockedByAdmin = true  (étudiant ne peut plus modifier en attendant la défense)
// pending_changes / rejected → lockedByAdmin = false
exports.reviewEnrollment = asyncHandler(async (req, res, next) => {
  const { status, comments } = req.body;

  if (![SIMULATED_STATUSES.APPROVED, SIMULATED_STATUSES.REJECTED, SIMULATED_STATUSES.PENDING_CHANGES].includes(status)) {
    return next(new ErrorResponse("Statut invalide", 400));
  }

  const enrollment = await SimulatedEnrollment.findById(req.params.id);
  if (!enrollment) {
    return next(new ErrorResponse("Enrollment non trouvé", 404));
  }

  if (enrollment.status === SIMULATED_STATUSES.COMPLETED) {
    return next(new ErrorResponse("Ce cycle est terminé", 400));
  }

  const oldStatus = enrollment.status;

  enrollment.status = status;
  enrollment.lockedByAdmin = status === SIMULATED_STATUSES.APPROVED;
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
    backgroundJobs.addJob(async () => {
      try {
        await emailService.sendStatusChangeEmail(enrollment, status, false, true);
      } catch (emailError) {
        console.error("Erreur envoi email simulated:", emailError);
      }
    });
  }

  res.status(200).json({ success: true, data: enrollment });
});

// PATCH /api/simulated/enrollments/:id/defend  (admin)
// Body: { credits, comments? }
// Enregistre la défense du cycle courant (phase 1 ou 2) et assigne les crédits.
// Phase 1 defense → stocke phase1Credits, passe phase:2, status:"pending_changes" (étudiant met à jour GitHub)
// Phase 2 defense → stocke credits, status:"approved" + lockedByAdmin (admin décide complete/relaunch)
exports.defendEnrollment = asyncHandler(async (req, res, next) => {
  const { credits, comments } = req.body;

  const enrollment = await SimulatedEnrollment.findById(req.params.id);
  if (!enrollment) {
    return next(new ErrorResponse("Enrollment non trouvé", 404));
  }

  if (enrollment.status !== SIMULATED_STATUSES.APPROVED) {
    return next(new ErrorResponse("Le projet doit être approuvé avant de passer la défense", 400));
  }

  // Vérifier que la défense n'a pas déjà été effectuée pour cette phase
  if (enrollment.phase === 1 && enrollment.phase1Credits !== null) {
    return next(new ErrorResponse("La défense de la phase 1 a déjà été effectuée", 400));
  }
  if (enrollment.phase === 2 && enrollment.credits !== null) {
    return next(new ErrorResponse("La défense de la phase 2 a déjà été effectuée", 400));
  }

  if (credits === undefined || credits === null) {
    return next(new ErrorResponse("Les crédits sont requis pour valider la défense", 400));
  }

  const validValues = enrollment.isDoubleCycle
    ? SimulatedEnrollment.VALID_CREDITS_DOUBLE
    : SimulatedEnrollment.VALID_CREDITS_NORMAL;
  if (!validValues.includes(Number(credits))) {
    return next(new ErrorResponse(`Valeur de crédits invalide. Valeurs acceptées : ${validValues.join(", ")}`, 400));
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
    enrollment.status = SIMULATED_STATUSES.PENDING_CHANGES; // étudiant doit mettre à jour son GitHub
    enrollment.lockedByAdmin = false;
    enrollment.changeHistory.push({
      status: SIMULATED_STATUSES.PENDING_CHANGES,
      comments: `Défense ${defenseNumber} (phase 1) — ${creditValue} crédit(s)${comments ? `. ${comments}` : ""}`,
      reviewer: { userId: req.user._id, name: req.user.name },
      date: new Date(),
    });
  } else {
    // Phase 2 — défense finale
    enrollment.credits = creditValue;
    enrollment.status = SIMULATED_STATUSES.APPROVED;
    enrollment.lockedByAdmin = true;
    enrollment.changeHistory.push({
      status: SIMULATED_STATUSES.APPROVED,
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

  backgroundJobs.addJob(async () => {
    try {
      await emailService.sendStatusChangeEmail(enrollment, enrollment.status, false, true);
    } catch (emailError) {
      console.error("Erreur envoi email défense simulated:", emailError);
    }
  });

  res.status(200).json({ success: true, data: enrollment });
});

// PATCH /api/simulated/enrollments/:id/toggle-double-cycle  (admin)
exports.toggleDoubleCycle = asyncHandler(async (req, res, next) => {
  const enrollment = await SimulatedEnrollment.findById(req.params.id);
  if (!enrollment) {
    return next(new ErrorResponse("Enrollment non trouvé", 404));
  }

  // Bloqué uniquement si le cycle est terminé
  if (enrollment.status === SIMULATED_STATUSES.COMPLETED) {
    return next(new ErrorResponse("Ce cycle est terminé et ne peut plus être modifié", 400));
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
});

// PATCH /api/simulated/enrollments/:id/update-credits  (admin)
// Permet à l'admin de modifier les crédits même après approbation (tant que non terminé)
exports.updateEnrollmentCredits = asyncHandler(async (req, res, next) => {
  const { credits } = req.body;
  const enrollment = await SimulatedEnrollment.findById(req.params.id);
  if (!enrollment) {
    return next(new ErrorResponse("Enrollment non trouvé", 404));
  }

  if (enrollment.status === SIMULATED_STATUSES.COMPLETED) {
    return next(new ErrorResponse("Ce cycle est terminé et ne peut plus être modifié", 400));
  }

  if (credits === undefined || credits === null) {
    return next(new ErrorResponse("Les crédits sont requis", 400));
  }

  const validValues = enrollment.isDoubleCycle
    ? SimulatedEnrollment.VALID_CREDITS_DOUBLE
    : SimulatedEnrollment.VALID_CREDITS_NORMAL;
  if (!validValues.includes(Number(credits))) {
    return next(new ErrorResponse(`Valeur de crédits invalide. Valeurs acceptées : ${validValues.join(", ")}`, 400));
  }

  enrollment.credits = Number(credits);
  enrollment.updatedAt = Date.now();

  // Mettre à jour les totaux (simplification : le total devient simplement cette nouvelle valeur)
  // Dans un système réel, on voudrait peut-être recalculer en fonction de l'historique
  enrollment.totalCredits = enrollment.credits + (enrollment.phase1Credits || 0);

  enrollment.changeHistory.push({
    status: enrollment.status,
    comments: `Crédits mis à jour manuellement à ${enrollment.credits} par l'admin`,
    reviewer: { userId: req.user._id, name: req.user.name },
    date: new Date(),
  });

  await enrollment.save();
  res.status(200).json({ success: true, data: enrollment });
});

// PATCH /api/simulated/enrollments/:id/complete  (admin)
// Marque l'enrollment comme "completed". Nécessite que des crédits aient été assignés.
exports.completeEnrollment = asyncHandler(async (req, res, next) => {
  const enrollment = await SimulatedEnrollment.findById(req.params.id);
  if (!enrollment) {
    return next(new ErrorResponse("Enrollment non trouvé", 404));
  }

  if (enrollment.status === SIMULATED_STATUSES.COMPLETED) {
    return next(new ErrorResponse("Ce projet est déjà terminé", 400));
  }

  // Permettre de clôturer si c'est approuvé OU rejeté
  if (![SIMULATED_STATUSES.APPROVED, SIMULATED_STATUSES.REJECTED].includes(enrollment.status)) {
    return next(new ErrorResponse("Le projet doit être approuvé ou rejeté avant d'être clôturé", 400));
  }

  if (enrollment.status === SIMULATED_STATUSES.APPROVED && enrollment.credits === null) {
    return next(new ErrorResponse("Impossible de clôturer sans avoir assigné de crédits (faites passer la défense d'abord)", 400));
  }

  enrollment.status = SIMULATED_STATUSES.COMPLETED;
  enrollment.lockedByAdmin = true;
  enrollment.changeHistory.push({
    status: SIMULATED_STATUSES.COMPLETED,
    comments: `Clôture du cycle par l'administrateur ${req.user.name}`,
    reviewer: { userId: req.user._id, name: req.user.name },
    date: new Date(),
  });
  enrollment.updatedAt = Date.now();
  await enrollment.save();

  res.status(200).json({ success: true, data: enrollment });
});

// POST /api/simulated/enrollments/:id/relaunch  (admin)
// Remet l'enrollment en phase 1 (nouveau cycle 4 semaines sur le même projet).
// Le même enrollment est réutilisé — l'étudiant met simplement à jour son lien GitHub.
// Nécessite que l'enrollment soit une phase 2 approuvée ou terminée.
exports.relaunchEnrollment = asyncHandler(async (req, res, next) => {
  const enrollment = await SimulatedEnrollment.findById(req.params.id);
  if (!enrollment) {
    return next(new ErrorResponse("Enrollment non trouvé", 404));
  }

  if (enrollment.phase !== 2) {
    return next(new ErrorResponse("Le relancement n'est possible que depuis un enrollment de phase 2", 400));
  }

  if (![SIMULATED_STATUSES.APPROVED, SIMULATED_STATUSES.COMPLETED].includes(enrollment.status)) {
    return next(new ErrorResponse("Le relancement nécessite un cycle approuvé ou terminé", 400));
  }

  // Réinitialiser l'enrollment pour un nouveau cycle
  enrollment.phase = 1;
  enrollment.status = SIMULATED_STATUSES.PENDING;
  enrollment.cycleNumber += 1;
  enrollment.credits = null;
  enrollment.phase1Credits = null;
  enrollment.lockedByAdmin = false;
  // githubProjectLink conservé — l'étudiant peut le mettre à jour si besoin
  enrollment.changeHistory.push({
    status: SIMULATED_STATUSES.PENDING,
    comments: `Cycle n°${enrollment.cycleNumber} relancé par l'administrateur`,
    reviewer: { userId: req.user._id, name: req.user.name },
    date: new Date(),
  });
  enrollment.updatedAt = Date.now();
  await enrollment.save();

  res.status(200).json({ success: true, data: enrollment });
});

// DELETE /api/simulated/enrollments/:id  (admin)
exports.deleteEnrollment = asyncHandler(async (req, res, next) => {
  const enrollment = await SimulatedEnrollment.findById(req.params.id);
  if (!enrollment) {
    return next(new ErrorResponse("Enrollment non trouvé", 404));
  }
  await SimulatedEnrollment.findByIdAndDelete(req.params.id);
  res.status(200).json({ success: true, message: "Enrollment supprimé avec succès" });
});
