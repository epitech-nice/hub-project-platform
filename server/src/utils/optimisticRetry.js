// Ré-essaie une lecture-modification-écriture Mongoose face à un conflit de concurrence optimiste
// (VersionError) — utilisé partout où deux écrivains indépendants peuvent modifier le même
// document Printer.spoolSlots en même temps (le tick périodique de l'agent qui rapporte l'état
// des bobines vs une déclaration manuelle étudiant/admin). Sans ceci, l'un des deux essuie un
// VersionError non catché, remonté tel quel en 500 par errorHandler.
const MAX_ATTEMPTS = 5;

async function withOptimisticRetry(reload, apply) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const doc = await reload();
    try {
      return await apply(doc);
    } catch (err) {
      if (err.name !== 'VersionError' || attempt === MAX_ATTEMPTS) throw err;
    }
  }
  return undefined;
}

module.exports = { withOptimisticRetry };
