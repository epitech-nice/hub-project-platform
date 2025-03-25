// app.js
const express = require("express");
const cors = require("cors");
const passport = require("passport");
const MicrosoftStrategy = require("passport-microsoft").Strategy;
const User = require("./models/User");
const config = require("./config/auth");
const { Client } = require('@microsoft/microsoft-graph-client');
require('isomorphic-fetch');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// Route de santé
app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// page users
app.use('/api/users', require('./routes/users'));

// Gestion des erreurs
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Erreur serveur" });
});

module.exports = app;
