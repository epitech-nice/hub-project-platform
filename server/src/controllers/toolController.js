const Tool = require('../models/Tool');
const Loan = require('../models/Loan');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middleware/asyncHandler');

// GET /api/tools — utilisateurs authentifiés (student + admin)
exports.getAllTools = asyncHandler(async (req, res, next) => {
  const { search, tags, status, page = 1, limit = 50 } = req.query;

  const query = {};

  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
    ];
  }

  if (tags) {
    const tagsArray = Array.isArray(tags)
      ? tags
      : tags.split(',').map((t) => t.trim()).filter(Boolean);
    query.tags = { $in: tagsArray };
  }

  if (status) query.status = status;

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const skip = (pageNum - 1) * limitNum;

  const [tools, total] = await Promise.all([
    Tool.find(query).sort({ name: 1 }).skip(skip).limit(limitNum).lean(),
    Tool.countDocuments(query),
  ]);

  res.status(200).json({
    success: true,
    count: tools.length,
    total,
    page: pageNum,
    totalPages: Math.ceil(total / limitNum),
    data: tools,
  });
});

// GET /api/tools/tags — liste de tous les tags distincts
exports.getAllTags = asyncHandler(async (req, res, next) => {
  const tags = await Tool.distinct('tags');
  res.status(200).json({ success: true, data: tags.sort() });
});

// GET /api/tools/:id
exports.getToolById = asyncHandler(async (req, res, next) => {
  const tool = await Tool.findById(req.params.id);
  if (!tool) {
    return next(new ErrorResponse('Outil non trouvé', 404));
  }
  res.status(200).json({ success: true, data: tool });
});

// POST /api/tools — admin uniquement
exports.createTool = asyncHandler(async (req, res, next) => {
  const { name, description, tags, rfid, quantity, borrowedCount, status, maxBorrowPerUser } = req.body;

  const tool = new Tool({
    name,
    description,
    tags: tags || [],
    rfid: rfid ? rfid.trim().toUpperCase() : undefined,
    quantity: quantity ?? 1,
    borrowedCount: borrowedCount ?? 0,
    maxBorrowPerUser: maxBorrowPerUser !== undefined ? maxBorrowPerUser : null,
    status: status || 'available',
  });

  await tool.save();
  res.status(201).json({ success: true, data: tool });
});

// PUT /api/tools/:id — admin uniquement
// Utilise $set/$unset pour gérer correctement la suppression du champ rfid
// (nécessaire à cause du sparse unique index — on ne peut pas juste passer null)
exports.updateTool = asyncHandler(async (req, res, next) => {
  const tool = await Tool.findById(req.params.id);
  if (!tool) {
    return next(new ErrorResponse('Outil non trouvé', 404));
  }

  const setData = {};
  const unsetData = {};

  if (req.body.name !== undefined) setData.name = req.body.name;
  if (req.body.description !== undefined) setData.description = req.body.description;
  if (req.body.tags !== undefined) setData.tags = req.body.tags;
  if (req.body.quantity !== undefined) setData.quantity = req.body.quantity;
  if (req.body.borrowedCount !== undefined) setData.borrowedCount = req.body.borrowedCount;
  if (req.body.maxBorrowPerUser !== undefined) setData.maxBorrowPerUser = req.body.maxBorrowPerUser;
  if (req.body.status !== undefined) setData.status = req.body.status;

  if (Object.prototype.hasOwnProperty.call(req.body, 'rfid')) {
    if (!req.body.rfid) {
      unsetData.rfid = ''; // $unset retire le champ du document
    } else {
      setData.rfid = req.body.rfid.trim().toUpperCase();
    }
  }

  const ops = {};
  if (Object.keys(setData).length > 0) ops.$set = setData;
  if (Object.keys(unsetData).length > 0) ops.$unset = unsetData;

  const updated = await Tool.findByIdAndUpdate(req.params.id, ops, {
    new: true,
    runValidators: true,
  });

  res.status(200).json({ success: true, data: updated });
});

// DELETE /api/tools/:id — admin uniquement
exports.deleteTool = asyncHandler(async (req, res, next) => {
  const tool = await Tool.findById(req.params.id);
  if (!tool) {
    return next(new ErrorResponse('Outil non trouvé', 404));
  }

  await Tool.findByIdAndDelete(req.params.id);
  res.status(200).json({
    success: true,
    message: 'Outil supprimé avec succès',
    data: {},
  });
});

// GET /api/tools/export/csv — admin uniquement
exports.exportInventoryCSV = asyncHandler(async (req, res, next) => {
  const { status, tags } = req.query;

  const query = {};
  if (status) query.status = status;
  if (tags) {
    const tagsArray = Array.isArray(tags)
      ? tags
      : tags.split(',').map((t) => t.trim()).filter(Boolean);
    query.tags = { $in: tagsArray };
  }

  const tools = await Tool.find(query).sort({ name: 1 }).lean();

  if (tools.length === 0) {
    return next(new ErrorResponse('Aucun outil trouvé pour les critères spécifiés', 404));
  }

  const STATUS_FR = { available: 'Disponible', borrowed: 'Emprunté', maintenance: 'Maintenance' };

  const header = 'Nom;Description;Tags;RFID;Stock total;Empruntés;Disponibles;Statut;Créé le\n';
  const rows = tools
    .map((t) => {
      const nom         = (t.name || '').replace(/;/g, ',');
      const description = (t.description || '').replace(/;/g, ',').replace(/\n/g, ' ');
      const tagsStr     = (t.tags || []).join(', ');
      const rfid        = t.rfid || '';
      const quantite    = t.quantity ?? 0;
      const empruntes   = t.borrowedCount ?? 0;
      const disponibles = Math.max(0, quantite - empruntes);
      const statut      = STATUS_FR[t.status] || t.status;
      const creeLE      = new Date(t.createdAt).toLocaleDateString('fr-FR');
      return `${nom};${description};${tagsStr};${rfid};${quantite};${empruntes};${disponibles};${statut};${creeLE}`;
    })
    .join('\n');

  const date = new Date().toISOString().split('T')[0];
  const filename = `inventaire_hub_${date}.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.write('\uFEFF'); // BOM UTF-8 pour compatibilité Excel
  res.write(header + rows);
  res.end();
});

// POST /api/tools/bulk-import — admin uniquement
// body: { rfids: string[] } — codes RFID scannés depuis le lecteur portable
// Retourne les outils trouvés + les codes inconnus (non enregistrés en BDD)
exports.bulkImport = asyncHandler(async (req, res, next) => {
  let { rfids } = req.body;

  if (!rfids || !Array.isArray(rfids) || rfids.length === 0) {
    return next(new ErrorResponse('Aucun code RFID fourni', 400));
  }

  // Normalisation : uppercase, trim, déduplication
  rfids = [...new Set(rfids.map((r) => r.trim().toUpperCase()).filter(Boolean))];

  if (rfids.length === 0) {
    return next(new ErrorResponse('Aucun code RFID valide fourni', 400));
  }

  // Une seule requête DB pour tous les codes
  const foundTools = await Tool.find({ rfid: { $in: rfids } }).lean();
  const foundRfidSet = new Set(foundTools.map((t) => t.rfid));
  const unknownRfids = rfids.filter((r) => !foundRfidSet.has(r));

  res.status(200).json({
    success: true,
    data: {
      scannedCount: rfids.length,
      known: foundTools,
      unknownRfids,
    },
  });
});

// POST /api/tools/:id/borrow
// body: { quantity: number }
exports.borrowTool = asyncHandler(async (req, res, next) => {
  const tool = await Tool.findById(req.params.id);
  if (!tool) {
    return next(new ErrorResponse('Outil non trouvé', 404));
  }

  const requestedQuantity = parseInt(req.body.quantity, 10) || 1;

  if (tool.status === 'maintenance') {
    return next(new ErrorResponse('Cet outil est en maintenance', 400));
  }

  const availableQuantity = tool.quantity - tool.borrowedCount;
  if (requestedQuantity > availableQuantity) {
    return next(new ErrorResponse(`Stock insuffisant. Seulement ${availableQuantity} disponible(s)`, 400));
  }

  // Vérification de la limite par étudiant
  if (tool.maxBorrowPerUser !== null) {
    // Calcul de ce que l'utilisateur a déjà emprunté et n'a pas rendu
    const activeLoans = await Loan.find({
      tool: tool._id,
      user: req.user.id,
      status: 'borrowed'
    });

    const alreadyBorrowedQuantity = activeLoans.reduce((sum, loan) => sum + loan.quantity, 0);

    if (alreadyBorrowedQuantity + requestedQuantity > tool.maxBorrowPerUser) {
      return next(new ErrorResponse(`Limite atteinte. Vous pouvez emprunter au maximum ${tool.maxBorrowPerUser} exemplaire(s) au total, vous en avez déjà ${alreadyBorrowedQuantity}.`, 400));
    }
  }

  // Création de l'emprunt
  const loan = await Loan.create({
    tool: tool._id,
    user: req.user.id,
    quantity: requestedQuantity,
    status: 'borrowed'
  });

  // Mise à jour de l'outil
  tool.borrowedCount += requestedQuantity;
  await tool.save();

  res.status(200).json({
    success: true,
    data: loan
  });
});

// POST /api/tools/:id/return
// body: { quantity: number }
exports.returnTool = asyncHandler(async (req, res, next) => {
  const tool = await Tool.findById(req.params.id);
  if (!tool) {
    return next(new ErrorResponse('Outil non trouvé', 404));
  }

  const returnedQuantity = parseInt(req.body.quantity, 10) || 1;

  // Trouver tous les emprunts actifs de cet utilisateur pour cet outil
  const activeLoans = await Loan.find({
    tool: tool._id,
    user: req.user.id,
    status: 'borrowed'
  }).sort({ borrowedAt: 1 }); // Rendre les plus anciens en premier

  const totalBorrowed = activeLoans.reduce((sum, loan) => sum + loan.quantity, 0);

  if (activeLoans.length === 0 || returnedQuantity > totalBorrowed) {
    return next(new ErrorResponse("Vous n'avez pas emprunté cette quantité de cet outil", 400));
  }

  let remainingToReturn = returnedQuantity;
  
  for (const loan of activeLoans) {
    if (remainingToReturn <= 0) break;

    if (loan.quantity <= remainingToReturn) {
      // Le prêt complet est retourné
      remainingToReturn -= loan.quantity;
      loan.status = 'returned';
      loan.returnedAt = Date.now();
      await loan.save();
    } else {
      // Retour partiel (le prêt courant couvre plus que ce qu'on veut rendre)
      loan.quantity -= remainingToReturn;
      await loan.save();
      
      // On crée un registre de ce qui a été rendu pour garder la trace de la transaction
      await Loan.create({
        tool: tool._id,
        user: req.user.id,
        quantity: remainingToReturn,
        status: 'returned',
        borrowedAt: loan.borrowedAt,
        returnedAt: Date.now()
      });
      break;
    }
  }

  tool.borrowedCount = Math.max(0, tool.borrowedCount - returnedQuantity);
  await tool.save();

  res.status(200).json({
    success: true,
    message: `${returnedQuantity} exemplaire(s) retourné(s) avec succès.`
  });
});

// GET /api/tools/loans/history
exports.getLoanHistory = asyncHandler(async (req, res, next) => {
  const { status, limit = 100 } = req.query;
  
  const query = {};
  if (status) { // 'borrowed' ou 'returned'
    query.status = status;
  }

  // Si pas admin, on peut soit limiter à ses propres emprunts, soit laisser public.
  // La demande était "un log accessible à tous de qui a emprunté".
  
  const loans = await Loan.find(query)
    .sort({ createdAt: -1 })
    .limit(parseInt(limit, 10))
    .populate('tool', 'name rfid')
    .populate('user', 'name email microsoftId')
    .lean();

  res.status(200).json({
    success: true,
    count: loans.length,
    data: loans
  });
});

