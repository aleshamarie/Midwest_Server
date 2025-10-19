const User = require('./User');

async function findUserByEmail(email) {
  return await User.findByEmail(email);
}

async function createUser({ name, email, passwordHash, role = 'admin' }) {
  return await User.createUser({ name, email, passwordHash, role });
}

module.exports = { findUserByEmail, createUser };


