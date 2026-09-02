const crypto = require('crypto');

const generateApiKey = () => {
  const rawKey = crypto.randomBytes(32).toString('hex');
  return { rawKey, hash: hashApiKey(rawKey) };
};

const hashApiKey = (rawKey) => crypto.createHash('sha256').update(rawKey).digest('hex');

module.exports = { generateApiKey, hashApiKey };
