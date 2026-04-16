const Tool = require('../models/Tool');
const Loan = require('../models/Loan');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middleware/asyncHandler');
const { TOOL_STATUS, LOAN_STATUS } = require('../utils/constants');

// --- HELPERS INTERNES ---

/**
 * Construit l'objet de requête Mongoose pour les outils
 */
const buildToolQuery = (params) => {
  const { search, tags, status } = params;
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
  return query;
};

/**
 * Assainit une valeur pour l'export CSV (prévient l'injection de formules Excel)
 */
const sanitizeCSVField = (val) => {
  if (typeof val !== 'string') return val;
  // Si commence par un caractère de contrôle Excel, on ajoute un apostrophe
  if (['=', '+', '-', '@'].includes(val.charAt(0))) {
    return `'${val}`;
  }
  return val.replace(/;/g, ','); // On remplace le séparateur point-virgule
};

/**
 * Enrichit une liste d'outils avec les quantités d'emprunts de l'utilisateur courant
 */
const enrichWithUserLoans = async (tools, userId) => {
  if (!userId || !tools || tools.length === 0) return tools;

  const toolIds = Array.isArray(tools) ? tools.map(t => t._id) : [tools._id];
  
  const activeLoans = await Loan.find({
    user: userId,
    status: LOAN_STATUS.BORROWED,
    tool: { $in: toolIds }
  }).lean();

  const loanMap = activeLoans.reduce((acc, loan) => {
    const tId = loan.tool.toString();
    acc[tId] = (acc[tId] || 0) + loan.quantity;
    return acc;
  }, {});

  if (Array.isArray(tools)) {
    tools.forEach(t => { t.currentUserBorrowCount = loanMap[t._id.toString()] || 0; });
  } else {
    tools.currentUserBorrowCount = loanMap[tools._id.toString()] || 0;
  }
  return tools;
};

// --- CONTROLLERS ---

// GET /api/tools — utilisateurs authentifiés (student + admin)
exports.getAllTools = asyncHandler(async (req, res, next) => {
  const { page = 1, limit = 50 } = req.query;
  const query = buildToolQuery(req.query);

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const skip = (pageNum - 1) * limitNum;

  const [tools, total] = await Promise.all([
    Tool.find(query).sort({ name: 1 }).skip(skip).limit(limitNum).lean(),
    Tool.countDocuments(query),
  ]);

  await enrichWithUserLoans(tools, req.user?.id);

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
  const tool = await Tool.findById(req.params.id).lean();
  if (!tool) {
    return next(new ErrorResponse('Outil non trouvé', 404));
  }

  await enrichWithUserLoans(tool, req.user?.id);
  res.status(200).json({ success: true, data: tool });
});

// POST /api/tools — admin uniquement
exports.createTool = asyncHandler(async (req, res, next) => {
  const { rfid, quantity, borrowedCount, status, maxBorrowPerUser, ...rest } = req.body;

  const tool = new Tool({
    ...rest,
    rfid: rfid ? rfid.trim().toUpperCase() : undefined,
    quantity: quantity ?? 1,
    borrowedCount: borrowedCount ?? 0,
    maxBorrowPerUser: maxBorrowPerUser !== undefined ? maxBorrowPerUser : null,
    status: status || TOOL_STATUS.AVAILABLE,
  });

  await tool.save();
  res.status(201).json({ success: true, data: tool });
});

// PUT /api/tools/:id — admin uniquement
exports.updateTool = asyncHandler(async (req, res, next) => {
  const tool = await Tool.findById(req.params.id);
  if (!tool) {
    return next(new ErrorResponse('Outil non trouvé', 404));
  }

  const setData = {};
  const unsetData = {};

  const fields = ['name', 'description', 'tags', 'quantity', 'borrowedCount', 'maxBorrowPerUser', 'status'];
  fields.forEach(f => {
    if (req.body[f] !== undefined) setData[f] = req.body[f];
  });

  if (Object.prototype.hasOwnProperty.call(req.body, 'rfid')) {
    if (!req.body.rfid) {
      unsetData.rfid = ''; 
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
  if (!tool) return next(new ErrorResponse('Outil non trouvé', 404));

  await Tool.findByIdAndDelete(req.params.id);
  res.status(200).json({ success: true, message: 'Outil supprimé avec succès', data: {} });
});

// GET /api/tools/export/csv — admin uniquement
exports.exportInventoryCSV = asyncHandler(async (req, res, next) => {
  const query = buildToolQuery(req.query);
  const tools = await Tool.find(query).sort({ name: 1 }).lean();

  if (tools.length === 0) {
    return next(new ErrorResponse('Aucun outil trouvé pour les critères spécifiés', 404));
  }

  const STATUS_FR = { 
    [TOOL_STATUS.AVAILABLE]: 'Disponible', 
    [TOOL_STATUS.BORROWED]: 'Emprunté', 
    [TOOL_STATUS.MAINTENANCE]: 'Maintenance' 
  };

  const header = 'Nom;Description;Tags;RFID;Stock total;Empruntés;Disponibles;Statut;Créé le\n';
  const rows = tools
    .map((t) => {
      const nom         = sanitizeCSVField(t.name || '');
      const description = sanitizeCSVField(t.description || '').replace(/\n/g, ' ');
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

  const filename = `inventaire_hub_${new Date().toISOString().split('T')[0]}.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.write('\uFEFF'); // BOM UTF-8
  res.write(header + rows);
  res.end();
});

// POST /api/tools/bulk-import — admin uniquement
exports.bulkImport = asyncHandler(async (req, res, next) => {
  let { rfids } = req.body;
  if (!rfids || !Array.isArray(rfids) || rfids.length === 0) {
    return next(new ErrorResponse('Aucun code RFID fourni', 400));
  }
  rfids = [...new Set(rfids.map((r) => r.trim().toUpperCase()).filter(Boolean))];

  const foundTools = await Tool.find({ rfid: { $in: rfids } }).lean();
  const foundRfidSet = new Set(foundTools.map((t) => t.rfid));
  const unknownRfids = rfids.filter((r) => !foundRfidSet.has(r));

  res.status(200).json({
    success: true,
    data: { scannedCount: rfids.length, known: foundTools, unknownRfids },
  });
});

// POST /api/tools/:id/borrow
exports.borrowTool = asyncHandler(async (req, res, next) => {
  const requestedQuantity = Math.max(1, parseInt(req.body.quantity, 10) || 1);
  const tool = await Tool.findById(req.params.id);
  if (!tool) return next(new ErrorResponse('Outil non trouvé', 404));

  try {
    const { loan } = await Tool.processBorrow(tool._id, req.user.id, requestedQuantity, tool.maxBorrowPerUser);
    res.status(200).json({ success: true, data: loan });
  } catch (error) {
    if (error.message.startsWith('LIMITE_ATTEINTE')) {
      const parts = error.message.split(':');
      return next(new ErrorResponse(`Limite atteinte. Vous pouvez emprunter au maximum ${parts[1]} exemplaire(s) au total.`, 400));
    }
    if (error.message === 'STOCK_INSUFFISANT_OU_MAINTENANCE') {
      return next(new ErrorResponse('Stock insuffisant ou objet en maintenance.', 400));
    }
    throw error;
  }
});

// POST /api/tools/:id/return
exports.returnTool = asyncHandler(async (req, res, next) => {
  const returnedQuantity = Math.max(1, parseInt(req.body.quantity, 10) || 1);
  const tool = await Tool.findById(req.params.id);
  if (!tool) return next(new ErrorResponse('Outil non trouvé', 404));

  try {
    await Tool.processReturn(tool._id, req.user.id, returnedQuantity);
    res.status(200).json({ success: true, message: `${returnedQuantity} exemplaire(s) retourné(s) avec succès.` });
  } catch (error) {
    if (error.message === 'RETOUR_INVALIDE') {
      return next(new ErrorResponse("Vous n'avez pas emprunté cette quantité.", 400));
    }
    throw error;
  }
});

// GET /api/tools/loans/history
exports.getLoanHistory = asyncHandler(async (req, res, next) => {
  const { status, limit = 100 } = req.query;
  const query = status ? { status } : {};

  const loans = await Loan.find(query)
    .sort({ createdAt: -1 })
    .limit(parseInt(limit, 10))
    .populate('tool', 'name rfid')
    .populate('user', 'name email microsoftId')
    .lean();

  res.status(200).json({ success: true, count: loans.length, data: loans });
});

