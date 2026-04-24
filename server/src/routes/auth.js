// routes/auth.js
const express = require("express");
const passport = require("passport");
const jwt = require("jsonwebtoken");
const router = express.Router();
const config = require("../config/auth");

// Route pour initier l'authentification Microsoft
router.get(
  "/microsoft",
  (req, res, next) => {
    // Si un redirectTo est fourni, on l'encode en hexadécimal dans le paramètre state 
    // (pour éviter les problèmes de caractères réservés Base64 comme '+' ou '=')
    const state = req.query.redirectTo ? Buffer.from(req.query.redirectTo).toString('hex') : undefined;
    passport.authenticate("microsoft", {
      prompt: "select_account",
      session: false,
      state, // le state sera renvoyé tel quel lors du callback
    })(req, res, next);
  }
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
      console.log("Auth callback: user authenticated", req.user._id);

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

      // Déterminer la page de redirection
      let redirectPath = req.user.role === "admin" ? "/admin/dashboard" : "/dashboard";

      // Si un objet "state" (notre redirecTo encodé) est présent dans la requête
      if (req.query.state) {
        try {
          const decodedState = Buffer.from(req.query.state, 'hex').toString('utf8');
          // Sécurité additionnelle : on s'assure qu'on redirige bien vers un lien interne au site
          if (decodedState.startsWith('/')) {
            redirectPath = decodedState;
          }
        } catch (e) {
          console.error("Erreur de décodage du state OAuth", e);
        }
      }

      // Le token est transmis via le fragment (#) : il n'apparaît pas dans les logs nginx
      // et n'est pas envoyé au serveur lors de futures navigations
      res.redirect(`${process.env.FRONTEND_URL}/auth/callback#token=${token}&redirectTo=${encodeURIComponent(redirectPath)}`);
    } catch (error) {
      console.error("Erreur dans le callback:", error);
      res.status(500).send("Erreur interne du serveur");
    }
  }
);

module.exports = router;