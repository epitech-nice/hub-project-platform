// controllers/workshopController.js
const Workshop = require("../models/Workshop");
const User = require("../models/User");
const emailService = require('../services/emailService');
const { WORKSHOP_STATUSES } = require('../utils/constants');
const asyncHandler = require('../middleware/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const backgroundJobs = require('../utils/backgroundJobs');

// Créer un nouveau workshop
exports.createWorkshop = asyncHandler(async (req, res, next) => {
  const {
    title,
      details,
      instructorCount,
      instructorEmails,
      links,
    } = req.body;

  // Vérifier que les liens GitHub et PowerPoint sont fournis
  if (!links.github || !links.presentation) {
    return next(new ErrorResponse('Les liens GitHub de référence et de présentation sont obligatoires', 400));
  }
  
  // Vérifier le format du lien GitHub
  const githubRegex = /^https:\/\/github\.com\/[\w-]+\/[\w-]+\/?$/;
  if (!githubRegex.test(links.github)) {
    return next(new ErrorResponse('Le lien GitHub doit être au format https://github.com/username/repo', 400));
  }

    // Créer la liste des intervenants (le créateur + les emails fournis)
    const instructors = [
      {
        email: req.user.email,
        userId: req.user._id,
        isMain: true,
      },
    ];

    // Ajouter les autres intervenants
    if (instructorEmails && instructorEmails.length > 0) {
      for (const email of instructorEmails) {
        // Vérifier si l'utilisateur existe déjà
        const existingUser = await User.findOne({ email });

        instructors.push({
          email: email,
          userId: existingUser ? existingUser._id : null,
          isMain: false,
        });
      }
    }

  const workshop = new Workshop({
    title,
    details,
    instructorCount,
    instructorEmails,
    links,
    instructors,
    status: WORKSHOP_STATUSES.PENDING,
    submittedBy: {
      userId: req.user._id,
      name: req.user.name,
      email: req.user.email,
    },
  });

  await workshop.save();
  res.status(201).json({ success: true, data: workshop });
});

// Récupérer tous les workshops (pour admin)
exports.getAllWorkshops = asyncHandler(async (req, res, next) => {
  const { status, page = 1, limit = 20 } = req.query;

  const query = {};
  if (status) {
    query.status = status;
  }

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const skip = (pageNum - 1) * limitNum;

  const [workshops, total] = await Promise.all([
    Workshop.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    Workshop.countDocuments(query)
  ]);

  res.status(200).json({ 
    success: true, 
    count: workshops.length, 
    total,
    page: pageNum,
    totalPages: Math.ceil(total / limitNum),
    data: workshops 
  });
});

// Récupérer les workshops d'un utilisateur
exports.getUserWorkshops = asyncHandler(async (req, res, next) => {
  // Trouver tous les workshops où l'utilisateur est l'intervenant principal OU un intervenant
  const workshops = await Workshop.find({
    $or: [
      { "submittedBy.userId": req.user._id },
      { "instructors.email": req.user.email },
    ],
  }).sort({ createdAt: -1 });

  // Pour chaque workshop, ajouter une propriété indiquant si l'utilisateur est l'intervenant principal
  const workshopsWithRole = workshops.map((workshop) => {
    const isMain =
      workshop.submittedBy.userId.toString() === req.user._id.toString();
    return {
      ...workshop.toObject(),
      isMain: isMain,
    };
  });

  res
    .status(200)
    .json({ success: true, count: workshops.length, data: workshopsWithRole });
});

// Récupérer un workshop par ID
exports.getWorkshopById = asyncHandler(async (req, res, next) => {
  const workshop = await Workshop.findById(req.params.id);

  if (!workshop) {
    return next(new ErrorResponse("Workshop non trouvé", 404));
  }

  // Vérifier que l'utilisateur est admin, l'intervenant principal ou un intervenant
  const isOwner =
    workshop.submittedBy.userId.toString() === req.user._id.toString();
  const isInstructor = workshop.instructors.some(
    (instructor) => instructor.email === req.user.email
  );
  const isAdmin = req.user.role === "admin";

  if (!isOwner && !isAdmin && !isInstructor) {
    return next(new ErrorResponse("Non autorisé", 403));
  }

  res.status(200).json({ success: true, data: workshop });
});

exports.completeWorkshop = asyncHandler(async (req, res, next) => {
  const workshop = await Workshop.findById(req.params.id);
  
  if (!workshop) {
    return next(new ErrorResponse('Workshop non trouvé', 404));
  }
  
  // Vérifier que l'utilisateur est administrateur
  if (req.user.role !== 'admin') {
    return next(new ErrorResponse('Non autorisé', 403));
  }
  
  // Vérifier que le workshop était précédemment approuvé
  if (workshop.status !== WORKSHOP_STATUSES.APPROVED) {
    return next(new ErrorResponse('Seuls les workshops approuvés peuvent être marqués comme terminés', 400));
  }
  
  // Changer le statut et ajouter les commentaires
  workshop.status = WORKSHOP_STATUSES.COMPLETED;
  if (req.body.comments) {
    workshop.reviewedBy = {
      userId: req.user._id,
      name: req.user.name,
      comments: req.body.comments
    };
  }
  workshop.updatedAt = Date.now();
  
  // Ajouter à l'historique si existe
  if (workshop.changeHistory) {
    workshop.changeHistory.push({
      status: WORKSHOP_STATUSES.COMPLETED,
      comments: req.body.comments || 'Workshop marqué comme terminé',
      reviewer: {
        userId: req.user._id,
        name: req.user.name
      },
      date: new Date()
    });
  }
  
  await workshop.save();
  
  // Envoi asynchrone pour ne pas pénaliser la requête HTTP
  backgroundJobs.addJob('sendStatusEmail', { project: workshop, status: WORKSHOP_STATUSES.COMPLETED });
  
  res.status(200).json({ success: true, data: workshop });
});

// Approuver ou refuser un workshop ou demande de modifications (pour admin)
exports.reviewWorkshop = asyncHandler(async (req, res, next) => {
  const { status, comments } = req.body;
  
  if (!Object.values(WORKSHOP_STATUSES).includes(status)) {
    return next(new ErrorResponse('Statut invalide', 400));
  }
  
  const workshop = await Workshop.findById(req.params.id);
  
  if (!workshop) {
    return next(new ErrorResponse('Workshop non trouvé', 404));
  }

  // Enregistrer l'ancien statut pour vérifier s'il y a eu un changement
  const oldStatus = workshop.status;
  
  // Ajouter l'entrée dans l'historique des modifications
  if (workshop.changeHistory) {
    workshop.changeHistory.push({
      status: status,
      comments: comments,
      reviewer: {
        userId: req.user._id,
        name: req.user.name
      },
      date: new Date()
    });
  }
  
  // Mettre à jour le statut et l'évaluateur actuels
  workshop.status = status;
  workshop.reviewedBy = {
    userId: req.user._id,
    name: req.user.name,
    comments: comments
  };
  workshop.updatedAt = Date.now();
  
  await workshop.save();
  
  // Envoyer un email en background si le statut a changé
  if (oldStatus !== status) {
    backgroundJobs.addJob('sendStatusEmail', { project: workshop, status });
  }
  
  res.status(200).json({ success: true, data: workshop });
});

// Mettre à jour un workshop
exports.updateWorkshop = asyncHandler(async (req, res, next) => {
  const { title, details, instructorCount, instructorEmails, links } = req.body;
  
  const workshop = await Workshop.findById(req.params.id);
  
  if (!workshop) {
    return next(new ErrorResponse('Workshop non trouvé', 404));
  }
  
  // Vérifier que l'utilisateur est l'intervenant principal
  if (workshop.submittedBy.userId.toString() !== req.user._id.toString()) {
    return next(new ErrorResponse('Non autorisé à modifier ce workshop', 403));
  }
  
  // Vérifier que le workshop est en attente ou en attente de modifications
  if (workshop.status !== WORKSHOP_STATUSES.PENDING && workshop.status !== WORKSHOP_STATUSES.PENDING_CHANGES) {
    return next(new ErrorResponse('Seuls les workshops en attente ou en attente de modifications peuvent être modifiés', 400));
  }
  
  // Vérifier que les liens GitHub et présentation sont fournis
  if (!links.github || !links.presentation) {
    return next(new ErrorResponse('Les liens GitHub de référence et de présentation sont obligatoires', 400));
  }
  
  // Vérifier le format du lien GitHub
  const githubRegex = /^https:\/\/github\.com\/[\w-]+\/[\w-]+\/?$/;
  if (!githubRegex.test(links.github)) {
    return next(new ErrorResponse('Le lien GitHub doit être au format https://github.com/username/repo', 400));
  }

  // Mettre à jour la liste des intervenants
  const instructors = [
    {
      email: req.user.email,
      userId: req.user._id,
      isMain: true
    }
  ];
  
  // Ajouter les autres intervenants
  if (instructorEmails && instructorEmails.length > 0) {
    for (const email of instructorEmails) {
      const existingUser = await User.findOne({ email });
      instructors.push({
        email: email,
        userId: existingUser ? existingUser._id : null,
        isMain: false
      });
    }
  }
  
  // Mettre à jour les champs
  workshop.title = title;
  workshop.details = details;
  workshop.instructorCount = instructorCount;
  workshop.instructorEmails = instructorEmails || [];
  workshop.links = links;
  workshop.instructors = instructors;
  workshop.updatedAt = Date.now();
  
  // Si le workshop était en attente de modifications, le remettre en attente
  if (workshop.status === WORKSHOP_STATUSES.PENDING_CHANGES) {
    workshop.status = WORKSHOP_STATUSES.PENDING;
    // Ajouter une note indiquant que l'intervenant a effectué les modifications demandées
    workshop.reviewedBy = {
      ...workshop.reviewedBy,
      comments: workshop.reviewedBy.comments + "\n\n[Modifications effectuées par l'intervenant le " + new Date().toLocaleDateString() + "]"
    };
    
    // Ajouter à l'historique que l'intervenant a effectué les modifications
    if (workshop.changeHistory) {
      workshop.changeHistory.push({
        status: WORKSHOP_STATUSES.PENDING,
        comments: `Modifications effectuées par l'intervenant`,
        reviewer: {
          userId: req.user._id,
          name: req.user.name
        },
        date: new Date()
      });
    }
  }
  
  await workshop.save();
  res.status(200).json({ success: true, data: workshop });
});

// Demander des modifications à un workshop
exports.requestChanges = asyncHandler(async (req, res, next) => {
  const { comments } = req.body;

  const workshop = await Workshop.findById(req.params.id);

  if (!workshop) {
    return next(new ErrorResponse("Workshop non trouvé", 404));
  }

  // Vérifier que l'utilisateur est administrateur
  if (req.user.role !== "admin") {
    return next(new ErrorResponse("Non autorisé", 403));
  }

  // Changer le statut et ajouter les commentaires
  workshop.status = WORKSHOP_STATUSES.PENDING_CHANGES;
  workshop.reviewedBy = {
    userId: req.user._id,
    name: req.user.name,
    comments: comments || "Des modifications sont requises.",
  };
  workshop.updatedAt = Date.now();

  await workshop.save();
  res.status(200).json({ success: true, data: workshop });
});

// Quitter un workshop pour un intervenant non-principal
exports.leaveWorkshop = asyncHandler(async (req, res, next) => {
  const workshop = await Workshop.findById(req.params.id);
  
  if (!workshop) {
    return next(new ErrorResponse('Workshop non trouvé', 404));
  }
  
  // Vérifier que l'utilisateur est un intervenant mais pas l'intervenant principal
  const isMain = workshop.submittedBy.userId.toString() === req.user._id.toString();
  const isInstructor = workshop.instructors.some(instructor => instructor.email === req.user.email);
  
  if (isMain) {
    return next(new ErrorResponse('L\'intervenant principal ne peut pas quitter le workshop', 400));
  }
  
  if (!isInstructor) {
    return next(new ErrorResponse('Vous n\'êtes pas intervenant dans ce workshop', 400));
  }
  
  // Supprimer l'utilisateur des intervenants
  workshop.instructors = workshop.instructors.filter(instructor => instructor.email !== req.user.email);
  
  // Supprimer l'email de la liste des emails d'intervenants si présent
  if (workshop.instructorEmails && workshop.instructorEmails.includes(req.user.email)) {
    workshop.instructorEmails = workshop.instructorEmails.filter(email => email !== req.user.email);
  }
  
  // Mettre à jour le nombre d'intervenants
  workshop.instructorCount = workshop.instructors.length;
  
  // Ajouter à l'historique si existe
  if (workshop.changeHistory) {
    workshop.changeHistory.push({
      status: workshop.status,
      comments: `${req.user.name} (${req.user.email}) a quitté le workshop`,
      reviewer: {
        userId: req.user._id,
        name: req.user.name
      },
      date: new Date()
    });
  }
  
  workshop.updatedAt = Date.now();
  await workshop.save();
  
  res.status(200).json({ 
    success: true, 
    message: 'Vous avez quitté le workshop avec succès',
    data: workshop 
  });
});

// Supprimer un workshop
exports.deleteWorkshop = asyncHandler(async (req, res, next) => {
  const workshop = await Workshop.findById(req.params.id);

  if (!workshop) {
    return next(new ErrorResponse("Workshop non trouvé", 404));
  }

  // Vérifier si l'utilisateur est un administrateur
  const isAdmin = req.user.role === "admin";
  
  // Vérifier que l'utilisateur est l'intervenant principal ou un administrateur
  if (workshop.submittedBy.userId.toString() !== req.user._id.toString() && !isAdmin) {
    return next(new ErrorResponse("Non autorisé à supprimer ce workshop", 403));
  }

  // Si l'utilisateur est l'intervenant principal (et non administrateur), vérifier que le workshop est en attente
  if (!isAdmin && workshop.status !== WORKSHOP_STATUSES.PENDING && workshop.status !== WORKSHOP_STATUSES.PENDING_CHANGES) {
    return next(new ErrorResponse("Seuls les workshops en attente ou en attente de modifications peuvent être supprimés par leur intervenant principal", 400));
  }

  await Workshop.findByIdAndDelete(req.params.id);
  res.status(200).json({ 
    success: true, 
    message: "Workshop supprimé avec succès",
    data: {} 
  });
});