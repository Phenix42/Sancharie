const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null, index: true },
  actorEmail: { type: String, default: '', maxlength: 254 },
  action: { type: String, required: true, maxlength: 100, index: true },
  resource: { type: String, required: true, maxlength: 100, index: true },
  resourceId: { type: String, default: '', maxlength: 150 },
  summary: { type: String, default: '', maxlength: 500 },
  changes: { type: mongoose.Schema.Types.Mixed, default: null },
  ip: { type: String, default: '', maxlength: 100 },
  userAgent: { type: String, default: '', maxlength: 500 },
}, { timestamps: { createdAt: true, updatedAt: false }, strict: 'throw' });

auditLogSchema.index({ createdAt: -1 });
module.exports = mongoose.model('AuditLog', auditLogSchema);
