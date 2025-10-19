const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password_hash: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['admin', 'staff', 'customer'],
    default: 'admin'
  }
}, {
  timestamps: true
});

// Static method to find user by email
userSchema.statics.findByEmail = async function(email) {
  return await this.findOne({ email }).lean();
};

// Static method to create user
userSchema.statics.createUser = async function({ name, email, passwordHash, role = 'admin' }) {
  const user = new this({
    name,
    email,
    password_hash: passwordHash,
    role
  });
  await user.save();
  return { id: user._id, name, email, role };
};

module.exports = mongoose.model('User', userSchema);
