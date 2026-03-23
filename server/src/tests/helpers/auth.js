const jwt = require('jsonwebtoken');
const User = require('../../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

const createUser = async (overrides = {}) => {
  const defaults = {
    microsoftId: `ms-${Math.random().toString(36).slice(2)}`,
    email: `user-${Math.random().toString(36).slice(2)}@epitech.eu`,
    name: 'Test User',
    role: 'student',
  };
  return User.create({ ...defaults, ...overrides });
};

const createAdmin = async (overrides = {}) => {
  return createUser({ name: 'Test Admin', role: 'admin', ...overrides });
};

const generateToken = (user) => {
  return jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '1d' });
};

const authHeader = (user) => ({
  Authorization: `Bearer ${generateToken(user)}`,
});

module.exports = { createUser, createAdmin, generateToken, authHeader };
