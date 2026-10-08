const AuditLog = require('../models/AuditLog');

const recordAdminAction = async (req, { action, resource, resourceId = '', summary = '', changes = null }) => {
  const actor = req.admin;
  return AuditLog.create({
    actorId: actor?._id || null,
    actorEmail: actor?.email || '',
    action,
    resource,
    resourceId: String(resourceId || ''),
    summary,
    changes,
    ip: String(req.ip || '').slice(0, 100),
    userAgent: String(req.get('user-agent') || '').slice(0, 500),
  });
};

module.exports = { recordAdminAction };
