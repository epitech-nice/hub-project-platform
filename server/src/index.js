// index.js
require('dotenv').config();
const app = require('./app');
const connectDB = require('./config/database');

// Connexion à la base de données
connectDB();

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});