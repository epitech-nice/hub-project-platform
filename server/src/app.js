// app.js
const express = require("express");
const cors = require("cors");
const passport = require("passport");
const MicrosoftStrategy = require("passport-microsoft").Strategy;
const User = require("./models/User");
const config = require("./config/auth");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

        if (user) {
          // Mettre à jour la dernière connexion
          user.lastLogin = Date.now();
          await user.save();
          return done(null, user);
        }

        // Créer un nouvel utilisateur
        user = new User({
          microsoftId: profile.id,
          email: profile.emails[0].value,
          name: profile.displayName,
          role: "student", // Par défaut, tous les nouveaux utilisateurs sont des étudiants
        });

        await user.save();
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
