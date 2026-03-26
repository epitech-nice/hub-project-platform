// app.js
const express = require("express");
const cors = require("cors");
const passport = require("passport");
const MicrosoftStrategy = require("passport-microsoft").Strategy;
const User = require("./models/User");
const config = require("./config/auth");
const { Client } = require('@microsoft/microsoft-graph-client');
require('isomorphic-fetch');
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const mongoSanitize = require("express-mongo-sanitize");
const xss = require("xss-clean");

const app = express();

// Définir que le serveur tourne derrière un proxy (Docker/Nginx)
app.set('trust proxy', 1);

// Middlewares de sécurité
app.use(helmet({
  crossOriginResourcePolicy: false, // Permet de charger les images/PDF depuis une autre origine (le front)
  crossOriginEmbedderPolicy: false,
  frameguard: false, // Permet d'afficher les PDF dans des iFrames ou des balises <object>
  contentSecurityPolicy: false, // Permet l'embedding des PDF dans des iframes cross-origin
})); // Protège les en-têtes HTTP
app.use(mongoSanitize()); // Prévient les injections NoSQL
app.use(xss()); // Prévient les attaques XSS

// Fichiers statiques — PDF des sujets Simulated (Doit être avant le rate limiter pour ne pas bloquer les images)
const path = require("path");
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Limitation de requêtes (Rate limiting)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === "production" ? 100 : 2000, // 100 en prod, 2000 en dev
  message: "Trop de requêtes depuis cette IP, veuillez réessayer plus tard.",
  standardHeaders: true, // Renvoie les headers d'info RateLimit
  legacyHeaders: false, // Désactive les headers 'X-RateLimit-*'
});
app.use('/api', limiter);

app.use(cors());
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

/**
 * Vérifie si un utilisateur est propriétaire de l'application dans Azure AD
 * @param {string} accessToken - Token d'accès Microsoft
 * @param {string} userEmail - Email de l'utilisateur à vérifier
 * @returns {Promise<boolean>} - True si l'utilisateur est propriétaire, false sinon
 */
async function checkIfUserIsAppOwner(accessToken, userEmail) {
  try {    
    // Liste des emails des propriétaires (peut être stockée en env var)
    const ownerEmails = process.env.APP_OWNER_EMAILS 
      ? process.env.APP_OWNER_EMAILS.split(',') 
      : [];
    
    if (ownerEmails.includes(userEmail)) {
      console.log(`Utilisateur ${userEmail} reconnu comme propriétaire par liste d'emails`);
      return true;
    }
    
  } catch (error) {
    console.error('Erreur lors de la vérification du statut de propriétaire:', error);
    return false;
  }
}

// Configuration de Passport pour Microsoft OAuth
passport.use(
  new MicrosoftStrategy(
    {
      clientID: config.microsoft.clientID,
      clientSecret: config.microsoft.clientSecret,
      callbackURL: config.microsoft.callbackURL,
      scope: config.microsoft.scope,
      tenant: config.microsoft.tenant,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        // Vérifier si l'utilisateur existe déjà
        let user = await User.findOne({ microsoftId: profile.id });

        // Vérifier si l'utilisateur est un propriétaire de l'application
        const isOwner = await checkIfUserIsAppOwner(accessToken, profile.emails[0].value);

        if (user) {
          // Mettre à jour la dernière connexion
          user.lastLogin = Date.now();

          if (isOwner && user.role !== 'admin') {
            user.role = 'admin';
            console.log(`Utilisateur ${user.email} promu au rang d'administrateur`);
          }

          await user.save();
          return done(null, user);
        }

        // Créer un nouvel utilisateur avec le rôle approprié
        user = new User({
          microsoftId: profile.id,
          email: profile.emails[0].value,
          name: profile.displayName,
          role: isOwner ? 'admin' : 'student', // Définir le rôle en fonction du statut de propriétaire
        });

        await user.save();

        if (isOwner) {
          console.log(`Nouvel utilisateur ${user.email} enregistré comme administrateur`);
        }

        return done(null, user);
      } catch (error) {
        return done(error, null);
      }
    }
  )
);

// Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/projects", require("./routes/projects"));
app.use("/api/workshops", require('./routes/workshops'));
app.use("/api/simulated/catalog", require("./routes/simulatedProjects"));
app.use("/api/simulated/cycles", require("./routes/simulatedCycles"));
app.use("/api/simulated/enrollments", require("./routes/simulatedEnrollments"));
// Pour /me, /my-history et /enroll
app.use("/api/simulated", require("./routes/simulatedEnrollments"));

app.use("/api/tools", require("./routes/tools"));

// Route de santé
app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// page users
app.use('/api/users', require('./routes/users'));

const errorHandler = require('./middleware/errorHandler');

// Gestion globale des erreurs
app.use(errorHandler);

module.exports = app;
