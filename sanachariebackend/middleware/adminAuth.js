const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const { hasPermission } = require('../services/adminPermissions');

const authenticateAdmin = async (req, res, next) => {
  try {
    const secret = process.env.ADMIN_JWT_SECRET;
    if (!secret || secret.length < 32) return res.status(503).json({ success: false, message: 'Admin authentication is not configured' });
    const token = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return res.status(401).json({ success: false, message: 'Admin authentication required' });
    const payload = jwt.verify(token, secret, { issuer: 'sancharie-admin', audience: 'sancharie-admin' });
    const admin = await Admin.findById(payload.sub).select('+passwordHash');
    if (!admin || !admin.active || admin.tokenVersion !== payload.ver) {
      return res.status(401).json({ success: false, message: 'Admin session is no longer valid' });
    }
    req.admin = admin;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Admin session is invalid or expired' });
    }
    next(error);
  }
};

const requirePermission = (permission) => (req, res, next) => {
  if (!req.admin || !hasPermission(req.admin, permission)) {
    return res.status(403).json({ success: false, message: 'You do not have permission to perform this action' });
  }
  next();
};

module.exports = { authenticateAdmin, requirePermission };
