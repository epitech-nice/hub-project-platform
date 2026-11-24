const Project = require('../models/Project');
const asyncHandler = require('../middleware/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const myClient = require('../services/my/myClient');
// myClient traduit deja les 401/403 de my en "Clé API my invalide ou expirée".
const { runSync, LOCK_DURATION_MS } = require('../services/my/mySyncService');

function validationError(project) {
  if (project.status !== 'completed') {
    return new ErrorResponse('Seuls les projets terminés peuvent être envoyés sur my', 400);
  }
  if (!(project.credits > 0)) {
    return new ErrorResponse('Aucun crédit attribué : rien à envoyer sur my', 400);
  }
  if (!project.defenseDate) {
    return new ErrorResponse('Date de soutenance manquante', 400);
  }
  if (project.mySync && project.mySync.status === 'done') {
    return new ErrorResponse('Projet déjà synchronisé sur my', 400);
  }
  return null;
}

exports.syncProjectToMy = asyncHandler(async (req, res, next) => {
  const existing = await Project.findById(req.params.id);
  if (!existing) {
    return next(new ErrorResponse('Projet non trouvé', 404));
  }
  const preError = validationError(existing);
  if (preError) return next(preError);

  // Verrou atomique : un seul envoi a la fois par projet.
  const now = new Date();
  const project = await Project.findOneAndUpdate(
    {
      _id: req.params.id,
      $or: [
        { 'mySync.inProgressUntil': { $exists: false } },
        { 'mySync.inProgressUntil': null },
        { 'mySync.inProgressUntil': { $lte: now } },
      ],
    },
    { $set: { 'mySync.inProgressUntil': new Date(now.getTime() + LOCK_DURATION_MS) } },
    { new: true }
  );
  if (!project) {
    return next(new ErrorResponse('Une synchronisation est déjà en cours pour ce projet', 409));
  }

  let released = false;
  const release = async () => {
    if (released) return;
    await Project.updateOne({ _id: project._id }, { $set: { 'mySync.inProgressUntil': null } });
    released = true;
  };

  try {
    // Etat relu sous verrou : un envoi concurrent a pu se terminer entre-temps.
    let failure = validationError(project);

    if (!failure) {
      try {
        await runSync(project, myClient);
      } catch (err) {
        if (!(err instanceof myClient.MyConfigError)) throw err;
        failure = new ErrorResponse(err.message, 500);
      }
    }

    // Le verrou est libere (et attendu) avant toute reponse : un appel enchaine ne voit plus de verrou.
    await release();
    if (failure) return next(failure);
    const data = project.toObject();
    data.mySync.inProgressUntil = null;
    return res.status(200).json({ success: true, data });
  } finally {
    // Chemins d'exception : le verrou est libere avant que l'erreur n'atteigne le gestionnaire.
    // Un echec de liberation est journalise sans remplacer l'erreur d'origine (le verrou expirera).
    try {
      await release();
    } catch (releaseErr) {
      console.error('Liberation du verrou my impossible :', releaseErr.message);
    }
  }
});
