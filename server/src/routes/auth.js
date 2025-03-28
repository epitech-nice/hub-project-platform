// routes/auth.js
const express = require("express");
const passport = require("passport");
const jwt = require("jsonwebtoken");
const router = express.Router();
const config = require("../config/auth");

// Route pour initier l'authentification Microsoft
router.get(
  "/microsoft",
  passport.authenticate("microsoft", {
    prompt: "select_account",
    session: false,
  })
);

// Callback après authentification Microsoft
router.get(
  "/microsoft/callback",
  passport.authenticate("microsoft", {
    failureRedirect: "/login",
    session: false,
  }),
  (req, res) => {
    try {
      // Vérifiez si l'utilisateur existe
      if (!req.user || !req.user._id) {
        console.error("Utilisateur non trouvé après authentification");
        return res
          .status(500)
          .send("Erreur d'authentification: utilisateur non trouvé");
      }
      console.log("Utilisateur authentifié:", req.user);

      // Générer le token JWT
      const token = jwt.sign(
        {
          id: req.user._id,
          name: req.user.name,
          email: req.user.email,
          role: req.user.role
        },
        config.jwt.secret,
        {
          expiresIn: config.jwt.expiresIn,
        }
      );

      // Déterminer la page de redirection en fonction du rôle
      let redirectPath = "/dashboard"; // Par défaut
      if (req.user.role === "admin") {
        redirectPath = "/admin/dashboard";
      }

      console.log(
        "Redirection vers:",
        `${process.env.FRONTEND_URL}/auth/callback?token=${token}&redirectTo=${redirectPath}`
      );

      // Rediriger vers le frontend avec le token et le chemin de redirection
      res.redirect(`${process.env.FRONTEND_URL}/auth/callback?token=${token}&redirectTo=${redirectPath}`);
    } catch (error) {
      console.error("Erreur dans le callback:", error);
      res.status(500).send("Erreur interne du serveur");
    }
  }
);

module.exports = router;