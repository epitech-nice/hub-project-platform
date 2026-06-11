// config/auth.js

// En production, JWT_SECRET DOIT être défini. On refuse de démarrer avec le
// secret de repli (publiquement connu) plutôt que de signer silencieusement
// des tokens avec une valeur prévisible. En dev/test, le repli reste toléré.
const jwtSecret =
  process.env.JWT_SECRET ||
  (process.env.NODE_ENV === "production" ? undefined : "your-secret-key");

if (!jwtSecret) {
  throw new Error(
    "JWT_SECRET est requis en production — démarrage interrompu pour éviter un secret de repli prévisible."
  );
}

module.exports = {
  microsoft: {
    clientID: process.env.MICROSOFT_CLIENT_ID,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
    callbackURL:
      process.env.MICROSOFT_CALLBACK_URL ||
      "http://localhost:3000/api/auth/microsoft/callback",
    scope: ["user.read", "email", "profile", "openid"],
    tenant: process.env.MICROSOFT_TENANT_ID || "common",
  },
  jwt: {
    secret: jwtSecret,
    expiresIn: "8h",
  },
};
