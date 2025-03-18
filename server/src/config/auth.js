// config/auth.js
module.exports = {
    microsoft: {
      clientID: process.env.MICROSOFT_CLIENT_ID,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
      callbackURL: process.env.MICROSOFT_CALLBACK_URL || 'http://localhost:3000/api/auth/microsoft/callback',
      scope: ['user.read', 'email', 'profile', 'openid']
    },
    jwt: {
      secret: process.env.JWT_SECRET || 'your-secret-key',
      expiresIn: '1d'
    }
  };
  
  // config/auth.js
module.exports = {
  microsoft: {
    clientID: process.env.MICROSOFT_CLIENT_ID,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
    callbackURL: process.env.MICROSOFT_CALLBACK_URL || 'http://localhost:3000/api/auth/microsoft/callback',
    scope: ['user.read', 'email', 'profile', 'openid'],
    tenant: process.env.MICROSOFT_TENANT_ID || '901cb4ca-b862-4029-9306-e5cd0f6d9f86' // Remplacez 'common' par votre ID de locataire
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key',
    expiresIn: '1d'
  }
};