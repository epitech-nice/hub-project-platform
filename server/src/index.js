// index.js
require('dotenv').config();
const app = require('./app');
const connectDB = require('./config/database');
const { startPrinterScheduler } = require('./utils/printerScheduler');
const { startPendingUploadCleanup } = require('./utils/pendingUploadCleanup');

// Connexion à la base de données
connectDB();
startPrinterScheduler();
startPendingUploadCleanup();

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  const dateandtime = new Date();
  console.log(dateandtime.toString());
  console.log(`Serveur démarré sur le port ${PORT}`);
});
