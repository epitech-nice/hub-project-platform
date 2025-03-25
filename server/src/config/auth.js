// config/auth.js
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
    secret: process.env.JWT_SECRET || "your-secret-key",
    expiresIn: "1d",
  },
};
