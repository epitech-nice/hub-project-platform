// controllers/projectController.js
const Project = require("../models/Project");
const User = require("../models/User");
const { sendExternalRequest } = require("../services/externalService");
const emailService = require('../services/emailService');

// Créer un nouveau projet
exports.createProject = async (req, res) => {
  try {
    const {
      name,
      description,
      objectives,
      technologies,
      studentCount,
      studentEmails,
      links,
    } = req.body;

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
      for (const email of studentEmails) {
        // Vérifier si l'utilisateur existe déjà
        const existingUser = await User.findOne({ email });

        members.push({
          email: email,
          userId: existingUser ? existingUser._id : null,
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
      submittedBy: {
        userId: req.user._id,
        name: req.user.name,
        email: req.user.email,
      },
    });

    await project.save();
    res.status(201).json({ success: true, data: project });
  } catch (error) {
    console.error("Erreur lors de la création du projet:", error);
    res.status(400).json({ success: false, message: error.message });
  }
};

// Récupérer tous les projets (pour admin)
exports.getAllProjects = async (req, res) => {
  try {
    const { status } = req.query;

    const query = {};
    if (status) {
      query.status = status;
    }

    const projects = await Project.find(query).sort({ createdAt: -1 });
    res
      .status(200)
      .json({ success: true, count: projects.length, data: projects });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Récupérer les projets d'un étudiant
exports.getUserProjects = async (req, res) => {
  try {
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
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Récupérer un projet par ID
exports.getProjectById = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);

    if (!project) {
      return res
        .status(404)
        .json({ success: false, message: "Projet non trouvé" });
    }

    // Vérifier que l'utilisateur est admin, le créateur du projet ou un membre
    const isOwner =
      project.submittedBy.userId.toString() === req.user._id.toString();
    const isMember = project.members.some(
      (member) => member.email === req.user.email
    );
    const isAdmin = req.user.role === "admin";

    if (!isOwner && !isAdmin && !isMember) {
      return res.status(403).json({ success: false, message: "Non autorisé" });
    }

    res.status(200).json({ success: true, data: project });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Mettre à jour les informations additionnelles (pour étudiant)
exports.updateAdditionalInfo = async (req, res) => {
  try {
    const { personalGithub, projectGithub, documents } = req.body;

    const project = await Project.findById(req.params.id);

    if (!project) {
      return res
        .status(404)
        .json({ success: false, message: "Projet non trouvé" });
    }

    // Vérifier que l'utilisateur est le propriétaire du projet
    if (project.submittedBy.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Non autorisé" });
    }

    // Vérifier que le projet est approuvé
    if (project.status !== "approved") {
      return res.status(400).json({
        success: false,
        message: "Seuls les projets approuvés peuvent être mis à jour",
      });
    }

    project.additionalInfo = {
      personalGithub,
      projectGithub,
      documents,
    };
    project.updatedAt = Date.now();

    await project.save();
    res.status(200).json({ success: true, data: project });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.completeProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    
    if (!project) {
      return res.status(404).json({ success: false, message: 'Projet non trouvé' });
    }
    
    // Vérifier que l'utilisateur est administrateur
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Non autorisé' });
    }
    
    // Vérifier que le projet était précédemment approuvé
    if (project.status !== 'approved') {
      return res.status(400).json({ success: false, message: 'Seuls les projets approuvés peuvent être marqués comme terminés' });
    }
    
    // Changer le statut et ajouter les commentaires
    project.status = 'completed';
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
        status: 'completed',
        comments: req.body.comments || 'Projet marqué comme terminé',
        reviewer: {
          userId: req.user._id,
          name: req.user.name
        },
        date: new Date()
      });
    }
    
    await project.save();
    
    // Envoyer un email de notification
    try {
      await emailService.sendStatusChangeEmail(project, 'completed');
    } catch (emailError) {
      console.error('Erreur lors de l\'envoi de l\'email de notification:', emailError);
    }
    
    res.status(200).json({ success: true, data: project });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};


// Approuver ou refuser un projet ou demande de modifications (pour admin)
exports.reviewProject = async (req, res) => {
  try {
    const { status, comments, credits } = req.body;
    
    if (!['approved', 'rejected', 'pending_changes'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Statut invalide' });
    }
    
    const project = await Project.findById(req.params.id);
    
    if (!project) {
      return res.status(404).json({ success: false, message: 'Projet non trouvé' });
    }
    
    // Vérifier si les crédits sont fournis pour un projet approuvé
    if (status === 'approved') {
      if (credits === undefined || credits === null) {
        return res.status(400).json({ success: false, message: 'Le champ crédits est requis pour approuver un projet' });
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
    
    // Si le projet est approuvé, envoyer la requête externe
    if (status === 'approved') {
      try {
        const response = await sendExternalRequest(project);
        
        project.externalRequestStatus = {
          sent: true,
          sentAt: Date.now(),
          response: response
        };
      } catch (error) {
        console.error('Erreur lors de l\'envoi de la requête externe:', error);
        // On continue même si la requête externe échoue
      }
    }
    
    await project.save();
    
    // Envoyer un email si le statut a changé
    if (oldStatus !== status) {
      try {
        await emailService.sendStatusChangeEmail(project, status);
        console.log(`Notification envoyée pour le changement de statut du projet ${project._id}`);
      } catch (emailError) {
        console.error('Erreur lors de l\'envoi de l\'email de notification:', emailError);
        // On continue même si l'envoi d'email échoue
      }
    }
    
    res.status(200).json({ success: true, data: project });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Mettre à jour un projet
exports.updateProject = async (req, res) => {
  try {
    const { name, description, objectives, technologies, studentCount, studentEmails, links } = req.body;
    
    const project = await Project.findById(req.params.id);
    
    if (!project) {
      return res.status(404).json({ success: false, message: 'Projet non trouvé' });
    }
    
    // Vérifier que l'utilisateur est le propriétaire du projet
    if (project.submittedBy.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Non autorisé à modifier ce projet' });
    }
    
    // Vérifier que le projet est en attente ou en attente de modifications
    if (project.status !== 'pending' && project.status !== 'pending_changes') {
      return res.status(400).json({ success: false, message: 'Seuls les projets en attente ou en attente de modifications peuvent être modifiés' });
    }
    
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
      for (const email of studentEmails) {
        // Vérifier si l'utilisateur existe déjà
        const existingUser = await User.findOne({ email });
        
        members.push({
          email: email,
          userId: existingUser ? existingUser._id : null,
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
    if (project.status === 'pending_changes') {
      project.status = 'pending';
      // Ajouter une note indiquant que l'étudiant a effectué les modifications demandées
      project.reviewedBy = {
        ...project.reviewedBy,
        comments: project.reviewedBy.comments + "\n\n[Modifications effectuées par l'étudiant le " + new Date().toLocaleDateString() + "]"
      };
      
      // Ajouter à l'historique que l'étudiant a effectué les modifications
      if (project.changeHistory) {
        project.changeHistory.push({
          status: 'pending',
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
  } catch (error) {
    console.error('Erreur lors de la mise à jour du projet:', error);
    res.status(400).json({ success: false, message: error.message });
  }
};

// Demander des modifications à un projet
exports.requestChanges = async (req, res) => {
  try {
    const { comments } = req.body;

    const project = await Project.findById(req.params.id);

    if (!project) {
      return res
        .status(404)
        .json({ success: false, message: "Projet non trouvé" });
    }

    // Vérifier que l'utilisateur est administrateur
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Non autorisé" });
    }

    // Changer le statut et ajouter les commentaires
    project.status = "pending_changes";
    project.reviewedBy = {
      userId: req.user._id,
      name: req.user.name,
      comments: comments || "Des modifications sont requises.",
    };
    project.updatedAt = Date.now();

    await project.save();
    res.status(200).json({ success: true, data: project });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Supprimer un projet
exports.deleteProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);

    if (!project) {
      return res
        .status(404)
        .json({ success: false, message: "Projet non trouvé" });
    }

    // Vérifier que l'utilisateur est le propriétaire du projet
    if (project.submittedBy.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Non autorisé à supprimer ce projet",
      });
    }

    // Vérifier que le projet est en attente
    if (project.status !== "pending" && project.status !== "pending_changes") {
      return res.status(400).json({
        success: false,
        message:
          "Seuls les projets en attente ou en attente de modifications peuvent être supprimés",
      });
    }

    await Project.findByIdAndDelete(req.params.id);
    res.status(200).json({ success: true, data: {} });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};
