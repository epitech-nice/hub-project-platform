// Fabrique le boilerplate start/stop d'une tâche périodique en tâche de fond (setInterval gardé
// contre les démarrages multiples, erreurs de tick catchées pour ne jamais faire planter le
// process) — factorisé depuis printerScheduler.js et pendingUploadCleanup.js, qui réimplémentaient
// chacun la même vingtaine de lignes.
const createIntervalTask = (logPrefix, task, defaultIntervalMs) => {
  let intervalHandle = null;

  const start = (intervalMs = defaultIntervalMs) => {
    if (intervalHandle) return;
    intervalHandle = setInterval(() => {
      task().catch((err) => console.error(`${logPrefix} erreur:`, err.message));
    }, intervalMs);
  };

  const stop = () => {
    clearInterval(intervalHandle);
    intervalHandle = null;
  };

  return { start, stop };
};

module.exports = { createIntervalTask };
