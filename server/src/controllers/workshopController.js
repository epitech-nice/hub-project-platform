// controllers/workshopController.js
const Workshop = require("../models/Workshop");
const User = require("../models/User");
const emailService = require('../services/emailService');

// Créer un nouveau workshop
exports.createWorkshop = async (req, res) => {
  try {
    const {
      title,
      details,
      instructorCount,
      instructorEmails,
      links,
    } = req.body;

    // Vérifier que les liens GitHub et PowerPoint sont fournis
    if (!links.github || !links.presentation) {
      return res.status(400).json({ 
        success: false, 
        message: 'Les liens GitHub de référence et de présentation sont obligatoires' 
      });
    }
    
    // Vérifier le format du lien GitHub
    const githubRegex = /^https:\/\/github\.com\/[\w-]+\/[\w-]+\/?$/;
    if (!githubRegex.test(links.github)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Le lien GitHub doit être au format https://github.com/username/repo' 
      });
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
      submittedBy: {
        userId: req.user._id,
        name: req.user.name,
        email: req.user.email,
      },
    });

    await workshop.save();
    res.status(201).json({ success: true, data: workshop });
  } catch (error) {
    console.error("Erreur lors de la création du workshop:", error);
    res.status(400).json({ success: false, message: error.message });
  }
};

// Récupérer tous les workshops (pour admin)
exports.getAllWorkshops = async (req, res) => {
  try {
    const { status } = req.query;

    const query = {};
    if (status) {
      query.status = status;
    }

    const workshops = await Workshop.find(query).sort({ createdAt: -1 });
    res
      .status(200)
      .json({ success: true, count: workshops.length, data: workshops });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Récupérer les workshops d'un utilisateur
exports.getUserWorkshops = async (req, res) => {
  try {
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
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Récupérer un workshop par ID
exports.getWorkshopById = async (req, res) => {
  try {
    const workshop = await Workshop.findById(req.params.id);

    if (!workshop) {
      return res
        .status(404)
        .json({ success: false, message: "Workshop non trouvé" });
    }

    // Vérifier que l'utilisateur est admin, l'intervenant principal ou un intervenant
    const isOwner =
      workshop.submittedBy.userId.toString() === req.user._id.toString();
    const isInstructor = workshop.instructors.some(
      (instructor) => instructor.email === req.user.email
    );
    const isAdmin = req.user.role === "admin";

    if (!isOwner && !isAdmin && !isInstructor) {
      return res.status(403).json({ success: false, message: "Non autorisé" });
    }

    res.status(200).json({ success: true, data: workshop });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.completeWorkshop = async (req, res) => {
  try {
    const workshop = await Workshop.findById(req.params.id);
    
    if (!workshop) {
      return res.status(404).json({ success: false, message: 'Workshop non trouvé' });
    }
    
    // Vérifier que l'utilisateur est administrateur
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Non autorisé' });
    }
    
    // Vérifier que le workshop était précédemment approuvé
    if (workshop.status !== 'approved') {
      return res.status(400).json({ success: false, message: 'Seuls les workshops approuvés peuvent être marqués comme terminés' });
    }
    
    // Changer le statut et ajouter les commentaires
    workshop.status = 'completed';
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
        status: 'completed',
        comments: req.body.comments || 'Workshop marqué comme terminé',
        reviewer: {
          userId: req.user._id,
          name: req.user.name
        },
        date: new Date()
      });
    }
    
    await workshop.save();
    
    // Envoyer un email de notification
    try {
      await emailService.sendStatusChangeEmail(workshop, 'completed', true); // Le troisième paramètre indique qu'il s'agit d'un workshop
    } catch (emailError) {
      console.error('Erreur lors de l\'envoi de l\'email de notification:', emailError);
    }
    
    res.status(200).json({ success: true, data: workshop });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Approuver ou refuser un workshop ou demande de modifications (pour admin)
exports.reviewWorkshop = async (req, res) => {
  try {
    const { status, comments } = req.body;
    
    if (!['approved', 'rejected', 'pending_changes'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Statut invalide' });
    }
    
    const workshop = await Workshop.findById(req.params.id);
    
    if (!workshop) {
      return res.status(404).json({ success: false, message: 'Workshop non trouvé' });
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
    
    // Envoyer un email si le statut a changé
    if (oldStatus !== status) {
      try {
        await emailService.sendStatusChangeEmail(workshop, status, true); // Le troisième paramètre indique qu'il s'agit d'un workshop
        console.log(`Notification envoyée pour le changement de statut du workshop ${workshop._id}`);
      } catch (emailError) {
        console.error('Erreur lors de l\'envoi de l\'email de notification:', emailError);
        // On continue même si l'envoi d'email échoue
      }
    }
    
    res.status(200).json({ success: true, data: workshop });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Mettre à jour un workshop
exports.updateWorkshop = async (req, res) => {
  try {
    const { title, details, instructorCount, instructorEmails, links } = req.body;
    
    const workshop = await Workshop.findById(req.params.id);
    
    if (!workshop) {
      return res.status(404).json({ success: false, message: 'Workshop non trouvé' });
    }
    
    // Vérifier que l'utilisateur est l'intervenant principal
    if (workshop.submittedBy.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Non autorisé à modifier ce workshop' });
    }
    
    // Vérifier que le workshop est en attente ou en attente de modifications
    if (workshop.status !== 'pending' && workshop.status !== 'pending_changes') {
      return res.status(400).json({ success: false, message: 'Seuls les workshops en attente ou en attente de modifications peuvent être modifiés' });
    }
    
    // Vérifier que les liens GitHub et présentation sont fournis
    if (!links.github || !links.presentation) {
      return res.status(400).json({ 
        success: false, 
        message: 'Les liens GitHub de référence et de présentation sont obligatoires' 
      });
    }
    
    // Vérifier le format du lien GitHub
    const githubRegex = /^https:\/\/github\.com\/[\w-]+\/[\w-]+\/?$/;
    if (!githubRegex.test(links.github)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Le lien GitHub doit être au format https://github.com/username/repo' 
      });
    }

    // Mettre à jour la liste des intervenants
    // Commencez par l'intervenant principal (qui ne change pas)
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
        // Vérifier si l'utilisateur existe déjà
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
    if (workshop.status === 'pending_changes') {
      workshop.status = 'pending';
      // Ajouter une note indiquant que l'intervenant a effectué les modifications demandées
      workshop.reviewedBy = {
        ...workshop.reviewedBy,
        comments: workshop.reviewedBy.comments + "\n\n[Modifications effectuées par l'intervenant le " + new Date().toLocaleDateString() + "]"
      };
      
      // Ajouter à l'historique que l'intervenant a effectué les modifications
      if (workshop.changeHistory) {
        workshop.changeHistory.push({
          status: 'pending',
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
  } catch (error) {
    console.error('Erreur lors de la mise à jour du workshop:', error);
    res.status(400).json({ success: false, message: error.message });
  }
};

// Demander des modifications à un workshop
exports.requestChanges = async (req, res) => {
  try {
    const { comments } = req.body;

    const workshop = await Workshop.findById(req.params.id);

    if (!workshop) {
      return res
        .status(404)
        .json({ success: false, message: "Workshop non trouvé" });
    }

    // Vérifier que l'utilisateur est administrateur
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Non autorisé" });
    }

    // Changer le statut et ajouter les commentaires
    workshop.status = "pending_changes";
    workshop.reviewedBy = {
      userId: req.user._id,
      name: req.user.name,
      comments: comments || "Des modifications sont requises.",
    };
    workshop.updatedAt = Date.now();

    await workshop.save();
    res.status(200).json({ success: true, data: workshop });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Quitter un workshop pour un intervenant non-principal
exports.leaveWorkshop = async (req, res) => {
  try {
    const workshop = await Workshop.findById(req.params.id);
    
    if (!workshop) {
      return res.status(404).json({ success: false, message: 'Workshop non trouvé' });
    }
    
    // Vérifier que l'utilisateur est un intervenant mais pas l'intervenant principal
    const isMain = workshop.submittedBy.userId.toString() === req.user._id.toString();
    const isInstructor = workshop.instructors.some(instructor => instructor.email === req.user.email);
    
    if (isMain) {
      return res.status(400).json({ 
        success: false, 
        message: 'L\'intervenant principal ne peut pas quitter le workshop' 
      });
    }
    
    if (!isInstructor) {
      return res.status(400).json({ 
        success: false, 
        message: 'Vous n\'êtes pas intervenant dans ce workshop' 
      });
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
  } catch (error) {
    console.error('Erreur lors du départ du workshop:', error);
    res.status(400).json({ success: false, message: error.message });
  }
};

// Supprimer un workshop
exports.deleteWorkshop = async (req, res) => {
  try {
    const workshop = await Workshop.findById(req.params.id);

    if (!workshop) {
      return res
        .status(404)
        .json({ success: false, message: "Workshop non trouvé" });
    }

    // Vérifier si l'utilisateur est un administrateur
    const isAdmin = req.user.role === "admin";
    
    // Vérifier que l'utilisateur est l'intervenant principal ou un administrateur
    if (workshop.submittedBy.userId.toString() !== req.user._id.toString() && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Non autorisé à supprimer ce workshop",
      });
    }

    // Si l'utilisateur est l'intervenant principal (et non administrateur), vérifier que le workshop est en attente
    if (!isAdmin && workshop.status !== "pending" && workshop.status !== "pending_changes") {
      return res.status(400).json({
        success: false,
        message:
          "Seuls les workshops en attente ou en attente de modifications peuvent être supprimés par leur intervenant principal",
      });
    }

    await Workshop.findByIdAndDelete(req.params.id);
    res.status(200).json({ 
      success: true, 
      message: "Workshop supprimé avec succès",
      data: {} 
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};