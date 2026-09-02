const mongoose = require('mongoose');

const PrintAuthorizationSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  authorized: { type: Boolean, default: false },
  history: {
    type: [
      {
        authorized: Boolean,
        byUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        byName: String,
        date: { type: Date, default: Date.now },
        note: String,
      },
    ],
    default: [],
  },
});

module.exports = mongoose.model('PrintAuthorization', PrintAuthorizationSchema);
