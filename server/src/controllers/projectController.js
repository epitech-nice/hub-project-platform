// controllers/projectController.js
const Project = require("../models/Project");
const User = require("../models/User");
const { sendExternalRequest } = require("../services/externalService");
const emailService = require('../services/emailService');
const projectService = require('../services/projectService');
const axios = require('axios');
const NodeCache = require("node-cache");
const ErrorResponse = require('../utils/errorResponse');
const { PROJECT_STATUSES } = require('../utils/constants');
const backgroundJobs = require('../utils/backgroundJobs');
const asyncHandler = require('../middleware/asyncHandler');

const githubCache = new NodeCache({ stdTTL: 3600 }); // Cache d'une heure

// Valider qu'un dépôt GitHub est public et existant
exports.validateGithubRepo = asyncHandler(async (req, res, next) => {
  const { url } = req.query;

  if (!url) {
    return next(new ErrorResponse('URL manquante', 400));
  }

  const githubRegex = /^https:\/\/github\.com\/[\w-]+\/[\w-]+\/?$/;
  if (!githubRegex.test(url)) {
    return next(new ErrorResponse('URL GitHub invalide (ex: https://github.com/username/repo)', 400));
  }

  // Vérifier d'abord dans le cache
  if (githubCache.has(url)) {
    return res.json(githubCache.get(url));
  }

  const apiUrl = url.replace('https://github.com/', 'https://api.github.com/repos/').replace(/\/$/, '');
  const headers = { Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) {
    headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const response = await axios.get(apiUrl, { headers, validateStatus: null });

  if (response.status === 200) {
    const result = { success: true, valid: true };
    githubCache.set(url, result);
    return res.json(result);
  } else if (response.status === 404) {
    const result = { success: true, valid: false, message: "Ce dépôt n'existe pas ou est privé" };
    githubCache.set(url, result);
    return res.json(result);
  } else if (response.status === 403 || response.status === 429) {
    return next(new ErrorResponse('Limite de requêtes GitHub atteinte, réessayez dans quelques instants', 503));
  } else {
    return next(new ErrorResponse('Erreur lors de la vérification GitHub', 502));
  }
});

// Créer un nouveau projet
exports.createProject = asyncHandler(async (req, res, next) => {
  const {
    name,
    description,
    objectives,
    technologies,
    studentCount,
    studentEmails,
    links,
  } = req.body;

    // La validation est gérée par express-validator (voir routes/projects.js)

    // Limite : max 5 projets en attente par utilisateur pour éviter le spam
    const pendingCount = await Project.countDocuments({
      'submittedBy.userId': req.user._id,
      status: { $in: [PROJECT_STATUSES.PENDING, PROJECT_STATUSES.PENDING_CHANGES] },
    });
    if (pendingCount >= 5) {
      return next(new ErrorResponse('Vous avez atteint le maximum de 5 projets en attente. Attendez qu\'un projet soit traité avant d\'en soumettre un nouveau.', 429));
    }

    // Créer la liste des membres (le créateur + les emails fournis)
    const members = [
      {
        email: req.user.email,
        userId: req.user._id,
        isCreator: true,
      },
    ];

    // Ajouter les autres membres du groupe
    if (studentEmails && studentEmails.length > 0) {
      // Résolution N+1: Récupération en une seule requête de tous les utilisateurs
      const existingUsers = await User.find({ email: { $in: studentEmails } }).lean();
      const usersByEmail = existingUsers.reduce((acc, user) => {
        acc[user.email] = user._id;
        return acc;
      }, {});

      for (const email of studentEmails) {
        members.push({
          email: email,
          userId: usersByEmail[email] || null,
          isCreator: false,
        });
      }
    }

  const project = new Project({
    name,
    description,
    objectives,
    technologies,
    studentCount,
    studentEmails,
    links,
    members,
    status: PROJECT_STATUSES.PENDING,
    submittedBy: {
      userId: req.user._id,
      name: req.user.name,
      email: req.user.email,
    },
  });

  await project.save();
  res.status(201).json({ success: true, data: project });
});

// Récupérer tous les projets (pour admin) avec pagination et recherche
exports.getAllProjects = asyncHandler(async (req, res, next) => {
  const { status, page = 1, limit = 20, search, schoolYear } = req.query;

  const query = {};
  if (status) query.status = status;

  if (search) {
    const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    query.$or = [
      { name: regex },
      { 'submittedBy.name': regex },
      { 'submittedBy.email': regex },
      { 'members.email': regex },
    ];
  }

  if (schoolYear) {
    const startYear = parseInt(schoolYear.split('-')[0], 10);
    if (!isNaN(startYear)) {
      query.createdAt = {
        $gte: new Date(startYear, 8, 1),
        $lte: new Date(startYear + 1, 7, 31, 23, 59, 59),
      };
    }
  }

  // Si recherche active : retourner tous les résultats sans pagination
  if (search) {
    const projects = await Project.find(query).sort({ createdAt: -1 }).lean();
    return res.status(200).json({
      success: true,
      count: projects.length,
      total: projects.length,
      page: 1,
      totalPages: 1,
      data: projects,
    });
  }

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const skip = (pageNum - 1) * limitNum;

  const [projects, total] = await Promise.all([
    Project.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
    Project.countDocuments(query),
  ]);

  res.status(200).json({
    success: true,
    count: projects.length,
    total,
    page: pageNum,
    totalPages: Math.ceil(total / limitNum),
    data: projects,
  });
});

// Récupérer les projets d'un étudiant
exports.getUserProjects = asyncHandler(async (req, res, next) => {
  // Trouver tous les projets où l'utilisateur est le créateur OU un membre
  const projects = await Project.find({
    $or: [
      { "submittedBy.userId": req.user._id },
        { "members.email": req.user.email },
      ],
    }).sort({ createdAt: -1 });

  // Pour chaque projet, ajouter une propriété indiquant si l'utilisateur est le créateur
  const projectsWithRole = projects.map((project) => {
    const isCreator =
      project.submittedBy.userId.toString() === req.user._id.toString();
    return {
      ...project.toObject(),
      isCreator: isCreator,
    };
  });

  res
    .status(200)
    .json({ success: true, count: projects.length, data: projectsWithRole });
});

// Récupérer un projet par ID
exports.getProjectById = asyncHandler(async (req, res, next) => {
  const project = await Project.findById(req.params.id);

  if (!project) {
    return next(new ErrorResponse("Projet non trouvé", 404));
  }

  // Vérifier que l'utilisateur est admin, le créateur du projet ou un membre
  const isOwner =
    project.submittedBy.userId.toString() === req.user._id.toString();
  const isMember = project.members.some(
    (member) => member.email === req.user.email
  );
  const isAdmin = req.user.role === "admin";

  if (!isOwner && !isAdmin && !isMember) {
    return next(new ErrorResponse("Non autorisé", 403));
  }

  res.status(200).json({ success: true, data: project });
});

// Mettre à jour les informations additionnelles (pour étudiant)
exports.updateAdditionalInfo = asyncHandler(async (req, res, next) => {
  const { personalGithub, projectGithub, documents } = req.body;

  const isHttpsUrl = (val) => typeof val === 'string' && val.startsWith('https://');

  if (personalGithub && !isHttpsUrl(personalGithub)) {
    return next(new ErrorResponse("personalGithub doit être une URL HTTPS valide", 400));
  }
  if (projectGithub && !isHttpsUrl(projectGithub)) {
    return next(new ErrorResponse("projectGithub doit être une URL HTTPS valide", 400));
  }
  if (documents) {
    if (!Array.isArray(documents)) {
      return next(new ErrorResponse("documents doit être un tableau", 400));
    }
    for (const doc of documents) {
      if (!isHttpsUrl(doc)) {
        return next(new ErrorResponse("Chaque document doit être une URL HTTPS valide", 400));
      }
    }
  }

  const project = await Project.findById(req.params.id);

  if (!project) {
    return next(new ErrorResponse("Projet non trouvé", 404));
  }

  // Vérifier que l'utilisateur est le propriétaire du projet
  if (project.submittedBy.userId.toString() !== req.user._id.toString()) {
    return next(new ErrorResponse("Non autorisé", 403));
  }

  // Vérifier que le projet est approuvé
  if (project.status !== PROJECT_STATUSES.APPROVED) {
    return next(new ErrorResponse("Seuls les projets approuvés peuvent être mis à jour", 400));
  }

  project.additionalInfo = {
    personalGithub,
    projectGithub,
    documents,
  };
  project.updatedAt = Date.now();

  await project.save();
  res.status(200).json({ success: true, data: project });
});

exports.completeProject = asyncHandler(async (req, res, next) => {
  const project = await Project.findById(req.params.id);
  
  if (!project) {
    return next(new ErrorResponse('Projet non trouvé', 404));
  }
  
  // Vérifier que l'utilisateur est administrateur
  if (req.user.role !== 'admin') {
    return next(new ErrorResponse('Non autorisé', 403));
  }
  
  // Vérifier que le projet était précédemment approuvé
  if (project.status !== PROJECT_STATUSES.APPROVED) {
    return next(new ErrorResponse('Seuls les projets approuvés peuvent être marqués comme terminés', 400));
  }
    
  // Changer le statut et ajouter les commentaires
  project.status = PROJECT_STATUSES.COMPLETED;
  if (req.body.comments) {
    project.reviewedBy = {
      userId: req.user._id,
      name: req.user.name,
      comments: req.body.comments
    };
  }
  project.updatedAt = Date.now();
  
  // Ajouter à l'historique si existe
  if (project.changeHistory) {
    project.changeHistory.push({
      status: PROJECT_STATUSES.COMPLETED,
      comments: req.body.comments || 'Projet marqué comme terminé',
      reviewer: {
        userId: req.user._id,
        name: req.user.name
      },
      date: new Date()
    });
  }
  
  await project.save();
  
  // Envoi différé de l'email via la Queue asynchrone pour ne pas bloquer l'UI
  backgroundJobs.addJob('sendStatusEmail', { project, status: PROJECT_STATUSES.COMPLETED });
  
  res.status(200).json({ success: true, data: project });
});

// Approuver ou refuser un projet ou demande de modifications (pour admin)
exports.reviewProject = asyncHandler(async (req, res, next) => {
  const { status, comments, credits } = req.body;
  
  if (!Object.values(PROJECT_STATUSES).includes(status)) {
    return next(new ErrorResponse('Statut invalide', 400));
  }
  
  const project = await Project.findById(req.params.id);
  
  if (!project) {
    return next(new ErrorResponse('Projet non trouvé', 404));
  }
    
  // Vérifier si les crédits sont fournis pour un projet approuvé
  if (status === PROJECT_STATUSES.APPROVED) {
    if (credits === undefined || credits === null) {
      return next(new ErrorResponse('Le champ crédits est requis pour approuver un projet', 400));
    }
    
    // Mettre à jour les crédits
    project.credits = credits;
  }

  // Enregistrer l'ancien statut pour vérifier s'il y a eu un changement
  const oldStatus = project.status;
  
  // Ajouter l'entrée dans l'historique des modifications
  if (project.changeHistory) {
    project.changeHistory.push({
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
  project.status = status;
  project.reviewedBy = {
    userId: req.user._id,
    name: req.user.name,
    comments: comments
  };
  project.updatedAt = Date.now();
  
  // Si le projet est approuvé, traitement en tâche de fond de la requête externe
  const externalSiteUrl = "https://intra.epitech.eu/module/2025/G-INN-020/NCE-0-1/#!/create";
  if (status === PROJECT_STATUSES.APPROVED) {
    backgroundJobs.addJob('sendExternalRequest', { project });
  }
    
  await project.save();
  
  // Envoi différé de l'email si le statut a changé
  if (oldStatus !== status) {
    backgroundJobs.addJob('sendStatusEmail', { project, status });
  }
  
  const responseData = {
    success: true,
    data: project
  };
  
  if (status === PROJECT_STATUSES.APPROVED) {
    responseData.externalSiteUrl = externalSiteUrl;
  }
  res.status(200).json(responseData);
});

// Mettre à jour un projet
exports.updateProject = asyncHandler(async (req, res, next) => {
  const { name, description, objectives, technologies, studentCount, studentEmails, links } = req.body;
  
  const project = await Project.findById(req.params.id);
  
  if (!project) {
    return next(new ErrorResponse('Projet non trouvé', 404));
  }
  
  // Vérifier que l'utilisateur est le propriétaire du projet
  if (project.submittedBy.userId.toString() !== req.user._id.toString()) {
    return next(new ErrorResponse('Non autorisé à modifier ce projet', 403));
  }
  
  // Vérifier que le projet est en attente ou en attente de modifications
  if (project.status !== PROJECT_STATUSES.PENDING && project.status !== PROJECT_STATUSES.PENDING_CHANGES) {
    return next(new ErrorResponse('Seuls les projets en attente ou en attente de modifications peuvent être modifiés', 400));
  }
    
    // La validation des liens est gérée par express-validator

    // Mettre à jour la liste des membres
    // Commencez par le créateur du projet (qui ne change pas)
    const members = [
      {
        email: req.user.email,
        userId: req.user._id,
        isCreator: true
      }
    ];
    
    // Ajouter les autres membres du groupe
    if (studentEmails && studentEmails.length > 0) {
      // Résolution N+1: Récupération en une seule requête de tous les utilisateurs
      const existingUsers = await User.find({ email: { $in: studentEmails } }).lean();
      const usersByEmail = existingUsers.reduce((acc, user) => {
        acc[user.email] = user._id;
        return acc;
      }, {});
      
      for (const email of studentEmails) {
        members.push({
          email: email,
          userId: usersByEmail[email] || null,
          isCreator: false
        });
      }
    }
    
  // Mettre à jour les champs
  project.name = name;
  project.description = description;
  project.objectives = objectives;
  project.technologies = technologies;
  project.studentCount = studentCount;
  project.studentEmails = studentEmails || [];
  project.links = links;
  project.members = members;
  project.updatedAt = Date.now();
  
  // Si le projet était en attente de modifications, le remettre en attente
  if (project.status === PROJECT_STATUSES.PENDING_CHANGES) {
    project.status = PROJECT_STATUSES.PENDING;
    // Ajouter une note indiquant que l'étudiant a effectué les modifications demandées
    project.reviewedBy = {
      ...project.reviewedBy,
      comments: project.reviewedBy.comments + "\n\n[Modifications effectuées par l'étudiant le " + new Date().toLocaleDateString() + "]"
    };
    
    // Ajouter à l'historique que l'étudiant a effectué les modifications
    if (project.changeHistory) {
      project.changeHistory.push({
        status: PROJECT_STATUSES.PENDING,
        comments: `Modifications effectuées par l'étudiant`,
        reviewer: {
          userId: req.user._id,
          name: req.user.name
        },
        date: new Date()
      });
    }
  }
  
  await project.save();
  res.status(200).json({ success: true, data: project });
});

// Demander des modifications à un projet
exports.requestChanges = asyncHandler(async (req, res, next) => {
  const { comments } = req.body;

  const project = await Project.findById(req.params.id);

  if (!project) {
    return next(new ErrorResponse("Projet non trouvé", 404));
  }

  // Vérifier que l'utilisateur est administrateur
  if (req.user.role !== "admin") {
    return next(new ErrorResponse("Non autorisé", 403));
  }

  // Changer le statut et ajouter les commentaires
  project.status = PROJECT_STATUSES.PENDING_CHANGES;
  project.reviewedBy = {
    userId: req.user._id,
    name: req.user.name,
    comments: comments || "Des modifications sont requises.",
  };
  project.updatedAt = Date.now();

  await project.save();
  res.status(200).json({ success: true, data: project });
});

// Quitter un projet pour un membre non-créateur
exports.leaveProject = asyncHandler(async (req, res, next) => {
  const project = await Project.findById(req.params.id);
  
  if (!project) {
    return next(new ErrorResponse('Projet non trouvé', 404));
  }
  
  // Vérifier que l'utilisateur est un membre mais pas le créateur
  const isCreator = project.submittedBy.userId.toString() === req.user._id.toString();
  const isMember = project.members.some(member => member.email === req.user.email);
  
  if (isCreator) {
    return next(new ErrorResponse('Le créateur du projet ne peut pas quitter le projet', 400));
  }
  
  if (!isMember) {
    return next(new ErrorResponse('Vous n\'êtes pas membre de ce projet', 400));
  }
    
  // Supprimer l'utilisateur des membres
  project.members = project.members.filter(member => member.email !== req.user.email);
  
  // Supprimer l'email de la liste des emails d'étudiants si présent
  if (project.studentEmails && project.studentEmails.includes(req.user.email)) {
    project.studentEmails = project.studentEmails.filter(email => email !== req.user.email);
  }
  
  // Mettre à jour le nombre d'étudiants si nécessaire
  project.studentCount = project.members.length;
  
  // Ajouter à l'historique si existe
  if (project.changeHistory) {
    project.changeHistory.push({
      status: project.status, // Peut être stocké en dur si non modif, ou convertit à une constante s'il gère les statuts.
      comments: `${req.user.name} (${req.user.email}) a quitté le projet`,
      reviewer: {
        userId: req.user._id,
        name: req.user.name
      },
      date: new Date()
    });
  }
  
  project.updatedAt = Date.now();
  await project.save();
  
  res.status(200).json({ 
    success: true, 
    message: 'Vous avez quitté le projet avec succès',
    data: project 
  });
});

// Supprimer un projet
exports.deleteProject = asyncHandler(async (req, res, next) => {
  const project = await Project.findById(req.params.id);

  if (!project) {
    return next(new ErrorResponse("Projet non trouvé", 404));
  }

  // Vérifier si l'utilisateur est un administrateur
  const isAdmin = req.user.role === "admin";

  // Vérifier que l'utilisateur est le propriétaire du projet ou un administrateur
  if (project.submittedBy.userId.toString() !== req.user._id.toString() && !isAdmin) {
    return next(new ErrorResponse("Non autorisé à supprimer ce projet", 403));
  }

  // Si l'utilisateur est le propriétaire (et non administrateur), vérifier que le projet est en attente
  if (!isAdmin && project.status !== PROJECT_STATUSES.PENDING && project.status !== PROJECT_STATUSES.PENDING_CHANGES) {
    return next(new ErrorResponse("Seuls les projets en attente ou en attente de modifications peuvent être supprimés par leur propriétaire", 400));
  }

  await Project.findByIdAndDelete(req.params.id);
  res.status(200).json({
    success: true,
    message: "Projet supprimé avec succès",
    data: {}
  });
});

// GET /api/projects/stats  (admin)
// Retourne le nombre de projets par statut + total
exports.getProjectStats = asyncHandler(async (req, res) => {
  const { schoolYear } = req.query;
  const pipeline = [];
  if (schoolYear) {
    const startYear = parseInt(schoolYear.split('-')[0], 10);
    if (!isNaN(startYear)) {
      pipeline.push({
        $match: {
          createdAt: {
            $gte: new Date(startYear, 8, 1),
            $lte: new Date(startYear + 1, 7, 31, 23, 59, 59),
          },
        },
      });
    }
  }
  pipeline.push({ $group: { _id: '$status', count: { $sum: 1 } } });
  const rows = await Project.aggregate(pipeline);
  const stats = { pending: 0, pending_changes: 0, approved: 0, rejected: 0, completed: 0, total: 0 };
  rows.forEach(({ _id, count }) => {
    if (_id in stats) stats[_id] = count;
    stats.total += count;
  });
  res.status(200).json({ success: true, data: stats });
});

// Exporter les projets terminés en CSV avec filtre de date
exports.exportCompletedProjectsCSV = asyncHandler(async (req, res, next) => {
  const { startDate, endDate } = req.query;

  // Construire la requête pour les projets terminés
  const query = { status: PROJECT_STATUSES.COMPLETED };

  // Ajouter le filtre de date si fourni
  if (startDate || endDate) {
    query.updatedAt = {};

    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0); // Début de la journée
      query.updatedAt.$gte = start;
    }

    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999); // Fin de la journée
      query.updatedAt.$lte = end;
    }
  }

  // Récupérer les projets terminés avec .lean() pour sauver de la RAM et accélérer l'exécution
  const projects = await Project.find(query).sort({ updatedAt: -1 }).lean();

  if (projects.length === 0) {
    return next(new ErrorResponse('Aucun projet terminé trouvé pour la période spécifiée', 404));
  }

  // Formater les données CSV via le service approprié
  const csvContent = projectService.formatCompletedProjectsForCSV(projects);

  // Définir les en-têtes de réponse pour télécharger le fichier CSV
  const filename = `completed_projects_${startDate || 'all'}_to_${endDate || 'all'}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  // Ajouter le BOM UTF-8 pour une meilleure compatibilité avec Excel
  res.write('\uFEFF');
  res.write(csvContent);
  res.end();
});
// POST /api/projects/notify-pending-changes (admin)
exports.notifyPendingChanges = asyncHandler(async (req, res) => {
  const projects = await Project.find({ status: 'pending_changes' });
  projects.forEach((project) => {
    backgroundJobs.addJob('sendStatusEmail', { project, status: 'pending_changes' });
  });
  res.status(200).json({ success: true, total: projects.length });
});

// POST /api/projects/:id/resend-notification (admin)
exports.resendNotification = asyncHandler(async (req, res, next) => {
  const project = await Project.findById(req.params.id);
  if (!project) {
    return next(new ErrorResponse('Projet non trouvé', 404));
  }
  if (project.status !== 'pending_changes') {
    return next(new ErrorResponse("Ce projet n'est pas en attente de modifications", 400));
  }
  backgroundJobs.addJob('sendStatusEmail', { project, status: 'pending_changes' });
  res.status(200).json({ success: true });
});
