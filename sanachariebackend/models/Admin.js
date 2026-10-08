const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254, index: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['super_admin', 'admin', 'support'], required: true, default: 'support' },
  permissions: { type: [String], default: [] },
  active: { type: Boolean, default: true, index: true },
  tokenVersion: { type: Number, default: 0 },
  lastLoginAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
}, { timestamps: true, strict: 'throw' });

module.exports = mongoose.model('Admin', adminSchema);
