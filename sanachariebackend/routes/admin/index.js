const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Admin = require('../../models/Admin');
const AuditLog = require('../../models/AuditLog');
const User = require('../../models/User');
const WalletPromotion = require('../../models/WalletPromotion');
const Booking = require('../../models/Booking');
const { Discount, Coupon, Offer, FestivalTheme, Banner, ApplicationSettings, AppAsset } = require('../../models/AdminResources');
const PushSubscription = require('../../models/PushSubscription');
const pushNotifications = require('../../services/pushNotifications');
const { authenticateAdmin, requirePermission } = require('../../middleware/adminAuth');
const { recordAdminAction } = require('../../services/adminAudit');

const router = express.Router();
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const modelRegistry = {
  discounts: { model: Discount, permission: 'discounts', label: 'Discount' },
  coupons: { model: Coupon, permission: 'coupons', label: 'Coupon' },
  offers: { model: Offer, permission: 'offers', label: 'Offer' },
  themes: { model: FestivalTheme, permission: 'themes', label: 'Festival theme' },
  banners: { model: Banner, permission: 'banners', label: 'Banner' },
};
const loginAttempts = new Map();
const adminLoginRateLimit = (req, res, next) => {
  const key = String(req.ip || 'unknown');
  const now = Date.now(); const windowMs = 15 * 60 * 1000;
  if (loginAttempts.size > 1000) for (const [attemptIp, attempt] of loginAttempts) if (attempt.resetAt <= now) loginAttempts.delete(attemptIp);
  const entry = loginAttempts.get(key);
  if (!entry || now >= entry.resetAt) {
    loginAttempts.set(key, { count: 1, resetAt: now + windowMs });
    return next();
  }
  if (entry.count >= 5) return res.status(429).json({ success: false, message: 'Too many sign-in attempts. Try again later.' });
  entry.count += 1;
  return next();
};
const validDates = (data) => {
  if (!data.startDate || !data.endDate) return true;
  const start = new Date(data.startDate); const end = new Date(data.endDate);
  return !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && start <= end;
};
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const publicSettings = (settings) => ({
  maintenanceMode: settings?.maintenanceMode ?? false,
  bookingsEnabled: settings?.bookingsEnabled ?? true,
  registrationEnabled: settings?.registrationEnabled ?? true,
  couponsEnabled: settings?.couponsEnabled ?? true,
  discountsEnabled: settings?.discountsEnabled ?? true,
  festivalThemeEnabled: settings?.festivalThemeEnabled ?? true,
  contactEmail: settings?.contactEmail || '',
  contactPhone: settings?.contactPhone || '',
  supportInformation: settings?.supportInformation || '',
  announcement: settings?.announcement || '',
});

router.post('/auth/login', adminLoginRateLimit, asyncRoute(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (email.length > 254 || !/^\S+@\S+\.\S+$/.test(email) || password.length > 200) {
    return res.status(400).json({ success: false, message: 'Enter a valid email and password' });
  }
  const admin = await Admin.findOne({ email }).select('+passwordHash');
  if (!admin || !admin.active || !(await bcrypt.compare(password, admin.passwordHash))) {
    return res.status(401).json({ success: false, message: 'Invalid email or password' });
  }
  if (!process.env.ADMIN_JWT_SECRET || process.env.ADMIN_JWT_SECRET.length < 32) return res.status(503).json({ success: false, message: 'Admin authentication is not configured' });
  admin.lastLoginAt = new Date();
  await admin.save();
  const token = jwt.sign({ ver: admin.tokenVersion }, process.env.ADMIN_JWT_SECRET, {
    subject: String(admin._id), issuer: 'sancharie-admin', audience: 'sancharie-admin', expiresIn: process.env.ADMIN_JWT_TTL || '8h',
  });
  await recordAdminAction({ admin, ip: req.ip, get: (key) => req.get(key) }, { action: 'login', resource: 'admin', resourceId: admin._id, summary: 'Admin signed in' });
  res.json({ success: true, token, expiresIn: process.env.ADMIN_JWT_TTL || '8h', admin: { id: admin._id, email: admin.email, name: admin.name, role: admin.role } });
}));

router.use(authenticateAdmin);

router.get('/auth/me', (req, res) => res.json({ success: true, admin: { id: req.admin._id, email: req.admin.email, name: req.admin.name, role: req.admin.role } }));
router.post('/auth/logout', asyncRoute(async (req, res) => {
  await recordAdminAction(req, { action: 'logout', resource: 'admin', resourceId: req.admin._id, summary: 'Admin signed out' });
  req.admin.tokenVersion += 1;
  await req.admin.save();
  res.json({ success: true });
}));

router.get('/dashboard', requirePermission('dashboard:read'), asyncRoute(async (req, res) => {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const month = new Date(start.getFullYear(), start.getMonth(), 1);
  const filterStart = req.query.from && !Number.isNaN(new Date(req.query.from).getTime()) ? new Date(req.query.from) : new Date(Date.now() - 6 * 86400000);
  const filterEnd = req.query.to && !Number.isNaN(new Date(req.query.to).getTime()) ? new Date(req.query.to) : new Date();
  if (filterEnd < filterStart) return res.status(400).json({ success: false, message: 'End date must be on or after start date' });
  if (filterEnd - filterStart > 92 * 86400000) return res.status(400).json({ success: false, message: 'Date range cannot exceed 92 days' });
  const [totalUsers, newUsersToday, totalBookings, todayBookings, todayRevenue, monthlyRevenue, activeCoupons, activeDiscounts, cancelledBookings, settings, theme, pendingIssues, daily, registrations, statuses, routes, couponUsage] = await Promise.all([
    User.countDocuments(), User.countDocuments({ createdAt: { $gte: start } }),
    Booking.countDocuments(), Booking.countDocuments({ createdAt: { $gte: start } }),
    Booking.aggregate([{ $match: { createdAt: { $gte: start }, paymentStatus: 'completed' } }, { $group: { _id: null, total: { $sum: '$totalFare' } } }]),
    Booking.aggregate([{ $match: { createdAt: { $gte: month }, paymentStatus: 'completed' } }, { $group: { _id: null, total: { $sum: '$totalFare' } } }]),
    Coupon.countDocuments({ enabled: true, startDate: { $lte: new Date() }, endDate: { $gte: new Date() } }),
    Discount.countDocuments({ enabled: true, startDate: { $lte: new Date() }, endDate: { $gte: new Date() } }),
    Booking.countDocuments({ status: 'cancelled' }), ApplicationSettings.findOne({ key: 'global' }).lean(),
    FestivalTheme.findOne({ enabled: true, startDate: { $lte: new Date() }, endDate: { $gte: new Date() } }).sort({ priority: -1, startDate: -1 }).lean(),
    Booking.countDocuments({ $or: [{ paymentIssue: { $ne: '' } }, { status: 'failed' }, { paymentStatus: 'failed' }] }),
    Booking.aggregate([{ $match: { createdAt: { $gte: filterStart, $lte: filterEnd } } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, bookings: { $sum: 1 }, revenue: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'completed'] }, '$totalFare', 0] } } } }, { $sort: { _id: 1 } }]),
    User.aggregate([{ $match: { createdAt: { $gte: filterStart, $lte: filterEnd } } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, users: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    Booking.aggregate([{ $match: { createdAt: { $gte: filterStart, $lte: filterEnd } } }, { $group: { _id: '$status', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    Booking.aggregate([{ $match: { createdAt: { $gte: filterStart, $lte: filterEnd } } }, { $group: { _id: { source: '$source', destination: '$destination' }, bookings: { $sum: 1 } } }, { $sort: { bookings: -1 } }, { $limit: 5 }]),
    Coupon.aggregate([{ $match: { usageCount: { $gt: 0 } } }, { $project: { code: 1, name: 1, usageCount: 1 } }, { $sort: { usageCount: -1 } }, { $limit: 5 }]),
  ]);
  res.json({ success: true, data: { totalUsers, newUsersToday, totalBookings, todayBookings, todayRevenue: todayRevenue[0]?.total || 0, monthlyRevenue: monthlyRevenue[0]?.total || 0, activeCoupons, activeDiscounts, activeTheme: theme?.name || null, cancelledBookings, pendingIssues, dailyBookings: daily, dailyRegistrations: registrations, bookingStatuses: statuses, popularRoutes: routes, couponUsage, settings: publicSettings(settings) } });
}));

router.get('/notifications', requirePermission('notifications:read'), asyncRoute(async (req, res) => {
  const [subscriptions, userCount] = await Promise.all([
    PushSubscription.countDocuments(),
    PushSubscription.distinct('userId'),
  ]);
  res.json({ success: true, configured: pushNotifications.isConfigured(), subscriptions, users: userCount.length });
}));

router.post('/notifications/campaign', requirePermission('notifications:send'), asyncRoute(async (req, res) => {
  if (!pushNotifications.isConfigured()) return res.status(503).json({ success: false, message: 'Push notifications are not configured on the server' });
  const title = String(req.body?.title || '').trim();
  const body = String(req.body?.body || '').trim();
  const url = String(req.body?.url || '/').trim();
  if (!title || title.length > 100 || !body || body.length > 240) return res.status(400).json({ success: false, message: 'Title (1–100 characters) and message (1–240 characters) are required' });
  if (!url.startsWith('/') || url.startsWith('//') || url.length > 300) return res.status(400).json({ success: false, message: 'Link must be a path on the Sancharie site' });
  const result = await pushNotifications.sendCampaign({ title, body, url, tag: `campaign-${Date.now()}` });
  await recordAdminAction(req, { action: 'send', resource: 'notifications', summary: `Sent campaign push notification to ${result.sent} devices`, changes: result });
  res.json({ success: true, ...result });
}));

for (const [path, config] of Object.entries(modelRegistry)) {
  const { model, permission, label } = config;
  router.get(`/${path}`, requirePermission(`${permission}:read`), asyncRoute(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1); const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const filter = {};
    if (req.query.enabled === 'true' || req.query.enabled === 'false') filter.enabled = req.query.enabled === 'true';
    if (req.query.q) filter.$or = ['name', 'code', 'festival', 'title'].map((field) => ({ [field]: { $regex: escapeRegex(String(req.query.q).slice(0, 100)), $options: 'i' } }));
    const [items, total] = await Promise.all([model.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), model.countDocuments(filter)]);
    res.json({ success: true, data: items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  }));
  router.post(`/${path}`, requirePermission(`${permission}:manage`), asyncRoute(async (req, res) => {
    const body = req.body || {};
    if (!validDates(body)) return res.status(400).json({ success: false, message: 'End date must be on or after the start date' });
    if (path === 'themes' && body.enabled !== false) {
      const overlap = await FestivalTheme.exists({ enabled: true, startDate: { $lte: new Date(body.endDate) }, endDate: { $gte: new Date(body.startDate) } });
      if (overlap) return res.status(409).json({ success: false, message: 'Another enabled theme overlaps these dates. Disable it or change the schedule first.' });
    }
    const item = await model.create(body);
    await recordAdminAction(req, { action: 'create', resource: path, resourceId: item._id, summary: `Created ${label}`, changes: item.toObject() });
    res.status(201).json({ success: true, data: item });
  }));
  router.patch(`/${path}/:id`, requirePermission(`${permission}:manage`), asyncRoute(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid record ID' });
    const item = await model.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: `${label} not found` });
    const before = item.toObject();
    for (const [key, value] of Object.entries(req.body || {})) if (key !== '_id' && key !== '__v' && key !== 'createdAt' && key !== 'updatedAt') item.set(key, value);
    const candidate = { startDate: item.startDate, endDate: item.endDate };
    if (!validDates(candidate)) return res.status(400).json({ success: false, message: 'End date must be on or after the start date' });
    if (path === 'themes' && item.enabled) {
      const overlap = await FestivalTheme.exists({ _id: { $ne: item._id }, enabled: true, startDate: { $lte: item.endDate }, endDate: { $gte: item.startDate } });
      if (overlap) return res.status(409).json({ success: false, message: 'Another enabled theme overlaps these dates. Disable it or change the schedule first.' });
    }
    await item.save();
    const action = Object.hasOwn(before, 'enabled') && before.enabled !== item.enabled ? (item.enabled ? 'enable' : 'disable') : 'update';
    await recordAdminAction(req, { action, resource: path, resourceId: item._id, summary: `Updated ${label}`, changes: { before, after: item.toObject() } });
    res.json({ success: true, data: item });
  }));
  router.delete(`/${path}/:id`, requirePermission(`${permission}:manage`), asyncRoute(async (req, res) => {
    const item = await model.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: `${label} not found` });
    await recordAdminAction(req, { action: 'delete', resource: path, resourceId: item._id, summary: `Deleted ${label}`, changes: item.toObject() });
    res.json({ success: true });
  }));
}

router.get('/users', requirePermission('users:read'), asyncRoute(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1); const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const q = String(req.query.q || '').trim().slice(0, 100); const filter = q ? { $or: [{ name: { $regex: q, $options: 'i' } }, { email: { $regex: q, $options: 'i' } }, { phone: { $regex: q, $options: 'i' } }, ...(mongoose.isValidObjectId(q) ? [{ _id: q }] : [])] } : {};
  const [data, total] = await Promise.all([User.find(filter).select('name email phone accountActive createdAt lastLogin isProfileComplete').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), User.countDocuments(filter)]);
  res.json({ success: true, data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}));
router.get('/users/:id', requirePermission('users:read'), asyncRoute(async (req, res) => {
  const user = await User.findById(req.params.id).select('-__v').lean();
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  const bookings = await Booking.find({ userId: user._id }).select('bookingId serviceType source destination journeyDate totalFare status paymentStatus paymentId paymentOrderId paymentMethod createdAt').sort({ createdAt: -1 }).limit(100).lean();
  res.json({ success: true, data: { user, bookings } });
}));
router.patch('/users/:id/status', requirePermission('users:manage'), asyncRoute(async (req, res) => {
  if (typeof req.body?.active !== 'boolean') return res.status(400).json({ success: false, message: 'active must be a boolean' });
  const user = await User.findByIdAndUpdate(req.params.id, { $set: { accountActive: req.body.active } }, { new: true, runValidators: true }).select('name email phone accountActive').lean();
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  await recordAdminAction(req, { action: req.body.active ? 'enable' : 'disable', resource: 'users', resourceId: user._id, summary: `${req.body.active ? 'Enabled' : 'Disabled'} customer account` });
  res.json({ success: true, data: user });
}));

router.get('/wallet-promotions', requirePermission('wallets:read'), asyncRoute(async (_req, res) => {
  const promotion = await WalletPromotion.findOne().sort({ createdAt: -1 }).select('-claimedUserIds').populate('createdBy', 'name email').lean();
  res.json({ success: true, data: promotion });
}));

router.post('/wallet-promotions', requirePermission('wallets:manage'), asyncRoute(async (req, res) => {
  const rewardAmount = Number(req.body?.rewardAmount);
  const minimumBookingAmount = Number(req.body?.minimumBookingAmount);
  const recipientLimit = Number(req.body?.recipientLimit);
  if (!Number.isFinite(rewardAmount) || rewardAmount < 0.01 || rewardAmount > 50000 || Math.round(rewardAmount * 100) !== rewardAmount * 100) {
    return res.status(400).json({ success: false, message: 'Reward must be between ₹0.01 and ₹50,000 with at most two decimal places' });
  }
  if (!Number.isFinite(minimumBookingAmount) || minimumBookingAmount < 0 || minimumBookingAmount > 500000 || Math.round(minimumBookingAmount * 100) !== minimumBookingAmount * 100) {
    return res.status(400).json({ success: false, message: 'Minimum booking amount must be between ₹0 and ₹500,000' });
  }
  if (!Number.isInteger(recipientLimit) || recipientLimit < 1 || recipientLimit > 100000) {
    return res.status(400).json({ success: false, message: 'Recipient limit must be a whole number from 1 to 100,000' });
  }
  await WalletPromotion.updateMany({ enabled: true }, { $set: { enabled: false } });
  const promotion = await WalletPromotion.create({ rewardAmount, minimumBookingAmount, recipientLimit, enabled: true, createdBy: req.admin._id });
  await recordAdminAction(req, { action: 'wallet_promotion_create', resource: 'wallets', resourceId: promotion._id, summary: `Started wallet bonus: ₹${rewardAmount} for first ${recipientLimit} customers`, changes: { rewardAmount, minimumBookingAmount, recipientLimit } });
  res.status(201).json({ success: true, data: { _id: promotion._id, rewardAmount: promotion.rewardAmount, minimumBookingAmount: promotion.minimumBookingAmount, recipientLimit: promotion.recipientLimit, claimedCount: promotion.claimedCount, enabled: promotion.enabled, createdAt: promotion.createdAt } });
}));

router.patch('/wallet-promotions/:id', requirePermission('wallets:manage'), asyncRoute(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid promotion ID' });
  if (typeof req.body?.enabled !== 'boolean') return res.status(400).json({ success: false, message: 'enabled must be a boolean' });
  const promotion = await WalletPromotion.findById(req.params.id);
  if (!promotion) return res.status(404).json({ success: false, message: 'Wallet promotion not found' });
  promotion.enabled = req.body.enabled;
  await promotion.save();
  await recordAdminAction(req, { action: promotion.enabled ? 'wallet_promotion_enable' : 'wallet_promotion_disable', resource: 'wallets', resourceId: promotion._id, summary: `${promotion.enabled ? 'Enabled' : 'Paused'} wallet bonus campaign`, changes: { enabled: promotion.enabled, claimedCount: promotion.claimedCount, recipientLimit: promotion.recipientLimit } });
  res.json({ success: true, data: { _id: promotion._id, rewardAmount: promotion.rewardAmount, minimumBookingAmount: promotion.minimumBookingAmount, recipientLimit: promotion.recipientLimit, claimedCount: promotion.claimedCount, enabled: promotion.enabled, updatedAt: promotion.updatedAt } });
}));

router.get('/wallets', requirePermission('wallets:read'), asyncRoute(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const q = String(req.query.q || '').trim().slice(0, 100);
  const filter = q ? { $or: [
    { name: { $regex: escapeRegex(q), $options: 'i' } },
    { email: { $regex: escapeRegex(q), $options: 'i' } },
    { phone: { $regex: escapeRegex(q), $options: 'i' } },
    ...(mongoose.isValidObjectId(q) ? [{ _id: q }] : []),
  ] } : {};
  const [data, total, balanceSummary] = await Promise.all([
    User.find(filter).select('name email phone walletBalance updatedAt').sort({ updatedAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    User.countDocuments(filter),
    User.aggregate([
      { $match: filter },
      { $group: {
        _id: null,
        totalBalance: { $sum: { $ifNull: ['$walletBalance', 0] } },
        fundedWallets: { $sum: { $cond: [{ $gt: [{ $ifNull: ['$walletBalance', 0] }, 0] }, 1, 0] } },
      } },
    ]),
  ]);
  res.json({ success: true, data, summary: balanceSummary[0] || { totalBalance: 0, fundedWallets: 0 }, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}));

router.get('/wallets/:id', requirePermission('wallets:read'), asyncRoute(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid customer ID' });
  const user = await User.findById(req.params.id).select('name email phone walletBalance walletTransactions updatedAt').lean();
  if (!user) return res.status(404).json({ success: false, message: 'Customer not found' });
  res.json({ success: true, data: { id: user._id, name: user.name, email: user.email, phone: user.phone, balance: user.walletBalance || 0, transactions: (user.walletTransactions || []).slice(-100).reverse(), updatedAt: user.updatedAt } });
}));

router.post('/wallets/:id/adjust', requirePermission('wallets:manage'), asyncRoute(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid customer ID' });
  const amount = Number(req.body?.amount);
  const direction = String(req.body?.direction || '').toLowerCase();
  const reason = String(req.body?.reason || '').trim().slice(0, 200);
  const requestId = String(req.body?.requestId || '').trim().slice(0, 100);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 50000 || Math.round(amount * 100) !== amount * 100) {
    return res.status(400).json({ success: false, message: 'Amount must be between ₹0.01 and ₹50,000 with at most two decimal places' });
  }
  if (!['credit', 'debit'].includes(direction)) return res.status(400).json({ success: false, message: 'direction must be credit or debit' });
  if (reason.length < 4) return res.status(400).json({ success: false, message: 'A reason of at least 4 characters is required' });
  if (!/^[A-Za-z0-9._:-]{8,100}$/.test(requestId)) return res.status(400).json({ success: false, message: 'A unique requestId (8–100 letters, numbers, dots, underscores, colons or hyphens) is required' });

  const transaction = { requestId, type: `admin_${direction}`, amount, description: reason, adminId: String(req.admin._id), adminEmail: req.admin.email, createdAt: new Date() };
  const conditions = { _id: req.params.id, walletProcessedAdjustments: { $ne: requestId } };
  if (direction === 'debit') conditions.$expr = { $gte: [{ $ifNull: ['$walletBalance', 0] }, amount] };
  const update = { $inc: { walletBalance: direction === 'credit' ? amount : -amount }, $addToSet: { walletProcessedAdjustments: requestId }, $push: { walletTransactions: { $each: [transaction], $slice: -100 } } };
  const updated = await User.findOneAndUpdate(conditions, update, { new: true }).select('name email phone walletBalance');
  if (!updated) {
    const existing = await User.findById(req.params.id).select('name walletBalance walletTransactions walletProcessedAdjustments');
    if (!existing) return res.status(404).json({ success: false, message: 'Customer not found' });
    if (existing.walletProcessedAdjustments?.includes(requestId)) {
      return res.json({ success: true, idempotent: true, balance: existing.walletBalance || 0, message: 'This wallet adjustment was already applied' });
    }
    return res.status(409).json({ success: false, message: 'Wallet balance is too low for this debit' });
  }
  await recordAdminAction(req, { action: direction === 'credit' ? 'wallet_credit' : 'wallet_debit', resource: 'wallets', resourceId: updated._id, summary: `Admin ${direction} of ₹${amount.toFixed(2)} for ${updated.phone}`, changes: { amount, direction, reason, requestId, balance: updated.walletBalance } });
  res.json({ success: true, idempotent: false, data: { userId: updated._id, balance: updated.walletBalance } });
}));

router.get('/bookings', requirePermission('bookings:read'), asyncRoute(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1); const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const filter = {};
  if (req.query.status) filter.status = String(req.query.status).toLowerCase();
  if (req.query.paymentStatus) filter.paymentStatus = String(req.query.paymentStatus).toLowerCase();
  if (req.query.from || req.query.to) {
    filter.createdAt = {};
    if (req.query.from) { const from = new Date(req.query.from); if (Number.isNaN(from.getTime())) return res.status(400).json({ success: false, message: 'Invalid start date' }); filter.createdAt.$gte = from; }
    if (req.query.to) { const to = new Date(req.query.to); if (Number.isNaN(to.getTime())) return res.status(400).json({ success: false, message: 'Invalid end date' }); if (/^\d{4}-\d{2}-\d{2}$/.test(String(req.query.to))) to.setHours(23, 59, 59, 999); filter.createdAt.$lte = to; }
  }
  if (req.query.q) { const q = String(req.query.q).slice(0, 100); filter.$or = [{ bookingId: { $regex: q, $options: 'i' } }, { userPhone: { $regex: q, $options: 'i' } }, { source: { $regex: q, $options: 'i' } }, { destination: { $regex: q, $options: 'i' } }]; }
  const [data, total] = await Promise.all([Booking.find(filter).select('bookingId userId userPhone serviceType source destination journeyDate totalFare status paymentStatus paymentId paymentOrderId paymentMethod cancellationReason refundAmount refundStatus paymentIssue createdAt').populate('userId', 'name email phone').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), Booking.countDocuments(filter)]);
  res.json({ success: true, data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}));
router.get('/bookings/:id', requirePermission('bookings:read'), asyncRoute(async (req, res) => {
  const query = mongoose.isValidObjectId(req.params.id) ? { $or: [{ _id: req.params.id }, { bookingId: req.params.id }] } : { bookingId: req.params.id };
  const data = await Booking.findOne(query).populate('userId', 'name email phone').lean();
  if (!data) return res.status(404).json({ success: false, message: 'Booking not found' });
  res.json({ success: true, data });
}));
router.get('/payments', requirePermission('payments:read'), asyncRoute(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1); const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const filter = { paymentId: { $ne: '' } }; if (req.query.status) filter.paymentStatus = String(req.query.status).toLowerCase();
  if (req.query.from || req.query.to) {
    filter.createdAt = {};
    if (req.query.from) { const from = new Date(req.query.from); if (Number.isNaN(from.getTime())) return res.status(400).json({ success: false, message: 'Invalid start date' }); filter.createdAt.$gte = from; }
    if (req.query.to) { const to = new Date(req.query.to); if (Number.isNaN(to.getTime())) return res.status(400).json({ success: false, message: 'Invalid end date' }); if (/^\d{4}-\d{2}-\d{2}$/.test(String(req.query.to))) to.setHours(23, 59, 59, 999); filter.createdAt.$lte = to; }
  }
  const [data, total] = await Promise.all([Booking.find(filter).select('bookingId userId userPhone totalFare paymentId paymentOrderId paymentMethod paymentStatus refundAmount refundStatus createdAt').populate('userId', 'name email phone').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), Booking.countDocuments(filter)]);
  res.json({ success: true, data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}));

router.get('/settings', requirePermission('settings:read'), asyncRoute(async (req, res) => res.json({ success: true, data: await ApplicationSettings.findOne({ key: 'global' }).lean() || publicSettings(null) })));
router.get('/app-icon', requirePermission('settings:read'), asyncRoute(async (req, res) => {
  const asset = await AppAsset.findOne({ key: 'app-icon' }).select('updatedAt contentType').lean();
  res.json({ success: true, data: asset ? { url: `/api/app-icon?v=${asset.updatedAt.getTime()}`, contentType: asset.contentType, updatedAt: asset.updatedAt } : null });
}));
router.put('/app-icon', requirePermission('settings:manage'), express.raw({ type: ['image/png', 'image/jpeg', 'image/webp'], limit: '1mb' }), asyncRoute(async (req, res) => {
  const image = req.body;
  const contentType = req.get('content-type');
  if (!Buffer.isBuffer(image) || image.length === 0) return res.status(400).json({ success: false, message: 'Select a PNG, JPG, or WebP image first' });
  const isPng = image.length >= 8 && image.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg = image.length >= 3 && image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff;
  const isWebp = image.length >= 12 && image.toString('ascii', 0, 4) === 'RIFF' && image.toString('ascii', 8, 12) === 'WEBP';
  if (!(contentType === 'image/png' && isPng) && !(contentType === 'image/jpeg' && isJpeg) && !(contentType === 'image/webp' && isWebp)) {
    return res.status(400).json({ success: false, message: 'Image type does not match PNG, JPG, or WebP content' });
  }
  const before = await AppAsset.findOne({ key: 'app-icon' }).select('contentType updatedAt').lean();
  const asset = await AppAsset.findOneAndUpdate({ key: 'app-icon' }, { $set: { image, contentType }, $setOnInsert: { key: 'app-icon' } }, { upsert: true, new: true, runValidators: true }).select('contentType updatedAt').lean();
  await recordAdminAction(req, { action: 'update', resource: 'app-icon', resourceId: 'app-icon', summary: 'Changed app icon', changes: { before, after: { contentType: asset.contentType, updatedAt: asset.updatedAt } } });
  res.json({ success: true, data: { url: `/api/app-icon?v=${asset.updatedAt.getTime()}`, contentType: asset.contentType, updatedAt: asset.updatedAt } });
}));
router.put('/settings', requirePermission('settings:manage'), asyncRoute(async (req, res) => {
  const allowed = ['maintenanceMode', 'bookingsEnabled', 'registrationEnabled', 'couponsEnabled', 'discountsEnabled', 'festivalThemeEnabled', 'contactEmail', 'contactPhone', 'supportInformation', 'announcement'];
  const update = {};
  for (const key of allowed) if (req.body?.[key] !== undefined) update[key] = req.body[key];
  const booleanKeys = ['maintenanceMode', 'bookingsEnabled', 'registrationEnabled', 'couponsEnabled', 'discountsEnabled', 'festivalThemeEnabled'];
  if (booleanKeys.some((key) => update[key] !== undefined && typeof update[key] !== 'boolean')) return res.status(400).json({ success: false, message: 'Feature flags must be boolean values' });
  if (update.contactEmail !== undefined && update.contactEmail !== '' && !/^\S+@\S+\.\S+$/.test(String(update.contactEmail))) return res.status(400).json({ success: false, message: 'Contact email is invalid' });
  const before = await ApplicationSettings.findOne({ key: 'global' }).lean();
  const data = await ApplicationSettings.findOneAndUpdate({ key: 'global' }, { $set: update, $setOnInsert: { key: 'global' } }, { upsert: true, new: true, runValidators: true }).lean();
  await recordAdminAction(req, { action: 'update', resource: 'settings', resourceId: 'global', summary: 'Updated application settings', changes: { before, after: data } });
  res.json({ success: true, data });
}));
router.get('/admin-users', requirePermission('admins:manage'), asyncRoute(async (req, res) => {
  const data = await Admin.find().select('email name role permissions active lastLoginAt createdAt').sort({ createdAt: -1 }).lean();
  res.json({ success: true, data });
}));
router.post('/admin-users', requirePermission('admins:manage'), asyncRoute(async (req, res) => {
  const { email, name, password, role, permissions } = req.body || {};
  if (!/^\S+@\S+\.\S+$/.test(String(email || '')) || !String(name || '').trim() || String(password || '').length < 14 || !['super_admin', 'admin', 'support'].includes(role)) return res.status(400).json({ success: false, message: 'Provide a valid email, name, 14-character password, and supported role' });
  const safePermissions = Array.isArray(permissions) ? permissions.filter((p) => typeof p === 'string' && /^[a-z][a-z0-9:_-]{1,79}$/.test(p)) : [];
  const admin = await Admin.create({ email, name, passwordHash: await bcrypt.hash(password, 12), role, permissions: safePermissions, createdBy: req.admin._id });
  await recordAdminAction(req, { action: 'create', resource: 'admin-users', resourceId: admin._id, summary: `Created ${role} account` });
  res.status(201).json({ success: true, data: { id: admin._id, email: admin.email, name: admin.name, role: admin.role, active: admin.active } });
}));
router.patch('/admin-users/:id', requirePermission('admins:manage'), asyncRoute(async (req, res) => {
  const admin = await Admin.findById(req.params.id);
  if (!admin) return res.status(404).json({ success: false, message: 'Admin not found' });
  if (String(admin._id) === String(req.admin._id) && (req.body.role && req.body.role !== admin.role || req.body.active === false)) return res.status(400).json({ success: false, message: 'You cannot disable or change your own role' });
  if (req.body.role !== undefined && !['super_admin', 'admin', 'support'].includes(req.body.role)) return res.status(400).json({ success: false, message: 'Invalid admin role' });
  if (admin.role === 'super_admin' && (req.body.active === false || req.body.role && req.body.role !== 'super_admin')) {
    const activeSuperAdmins = await Admin.countDocuments({ role: 'super_admin', active: true });
    if (activeSuperAdmins <= 1) return res.status(400).json({ success: false, message: 'At least one active Super Admin must remain' });
  }
  const before = { email: admin.email, name: admin.name, role: admin.role, active: admin.active, permissions: admin.permissions };
  if (req.body.email !== undefined) {
    const email = String(req.body.email).trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ success: false, message: 'Email address is invalid' });
    admin.email = email;
  }
  if (req.body.name !== undefined) admin.name = String(req.body.name).trim().slice(0, 120);
  if (req.body.role !== undefined) admin.role = req.body.role;
  if (typeof req.body.active === 'boolean') admin.active = req.body.active;
  if (Array.isArray(req.body.permissions)) admin.permissions = req.body.permissions.filter((p) => typeof p === 'string' && /^[a-z][a-z0-9:_-]{1,79}$/.test(p));
  if (req.body.password !== undefined) {
    if (String(req.body.password).length < 14) return res.status(400).json({ success: false, message: 'Password must be at least 14 characters' });
    admin.passwordHash = await bcrypt.hash(req.body.password, 12);
  }
  admin.tokenVersion += 1;
  await admin.save();
  await recordAdminAction(req, { action: 'update', resource: 'admin-users', resourceId: admin._id, summary: 'Updated admin account', changes: { before, after: { email: admin.email, name: admin.name, role: admin.role, active: admin.active, permissions: admin.permissions } } });
  res.json({ success: true, data: { id: admin._id, email: admin.email, name: admin.name, role: admin.role, active: admin.active } });
}));
router.get('/audit-logs', requirePermission('audit:read'), asyncRoute(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1); const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const filter = {}; if (req.query.action) filter.action = String(req.query.action).slice(0, 100); if (req.query.resource) filter.resource = String(req.query.resource).slice(0, 100);
  const [data, total] = await Promise.all([AuditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), AuditLog.countDocuments(filter)]);
  res.json({ success: true, data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}));

module.exports = router;
