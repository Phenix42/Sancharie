/**
 * ============================================
 * ETS BUS API PROXY ROUTES
 * ============================================
 * 
 * Secure proxy for eTravelSmart (ETS) bus booking API.
 * Uses Digest Authentication with credentials stored server-side only.
 * 
 * Browser sees: https://sancharie.com/api/ets/*
 * Server calls: ETS API (Configured in .env)
 * 
 * LIVE API ENDPOINT: http://agent.etravelsmart.com/etsAPI/api/<Method_Name>
 * 
 * SECURITY:
 * - API credentials never exposed to frontend
 * - Digest Authentication handled server-side
 * - Request validation and sanitization
 * - Rate limiting for sensitive endpoints
 * - Input sanitization to prevent injection attacks
 * - Error handling without leaking internal details
 * 
 * BOARDING POINT LOGIC (as per ETS documentation):
 * - inventoryType 0, 1: Use boarding points from getAvailableBuses response
 * - inventoryType 2, 3, 5, 6: Use boarding points from getBusLayout response
 * - For inventoryType 1: Boarding time may be null in layout; prefer search results
 * - Map boarding details using boardingId for complete info with landmarks
 * 
 * @module routes/bus
 */

const express = require('express');
const AxiosDigestAuth = require('@mhoc/axios-digest-auth').default;
const paymentService = require('../services/paymentService');
const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const User = require('../models/User');
const userRoutes = require('./user');
const authenticateToken = userRoutes.authenticateToken;
const { authenticateAdmin, requirePermission } = require('../middleware/adminAuth');
const { recordAdminAction } = require('../services/adminAudit');
const smsService = require('../services/smsService');
const Referral = require('../models/Referral');
const { ApplicationSettings, Coupon, Discount } = require('../models/AdminResources');
const {
  PaymentSecurityError,
  assertCapturedPaymentCovers,
  assertOrderContextMatches,
  assertPaymentNotConsumed,
  markPaymentConsumed,
  hashReference,
  toAmount,
} = require('../services/paymentSecurity');
const router = express.Router();
const { requireBookingAvailability } = require('../middleware/runtimeSettings');
const normalizeRouteCity = (value) => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const getBookingAdjustments = async ({ bookingId, walletAmount = 0, promoCode = '', promotionId = '', blockAmount, blockTicketKey }) => {
  let walletCredit = 0;
  const requestedWalletAmount = toAmount(walletAmount);
  if (requestedWalletAmount > 0) {
    if (!mongoose.isValidObjectId(bookingId)) throw new Error('Wallet payment booking reference is invalid');
    const booking = await Booking.findById(bookingId).select('userId providerReferenceHash status paymentStatus');
    if (!booking || booking.providerReferenceHash !== hashReference(String(blockTicketKey))) throw new Error('Wallet payment does not match this bus booking');
    if (!['pending', 'confirmed'].includes(booking.status) || !['pending', 'completed'].includes(booking.paymentStatus)) throw new Error('Wallet payment booking is not valid');
    // Validate the debit by its booking association and exact amount. Older
    // app versions generated their own idempotency keys, so the request ID is
    // not a reliable way to determine whether this booking was funded.
    const user = await User.findOne({ _id: booking.userId, walletTransactions: { $elemMatch: { type: 'debit', bookingId: String(bookingId), amount: requestedWalletAmount } } }).select('_id');
    if (!user) throw new Error('Wallet debit could not be verified');
    walletCredit = requestedWalletAmount;
  }

  let promotionCredit = 0;
  let returnCouponId = null;
  let promotionName = '';
  let promotionReservation = null;
  const normalizedCode = String(promoCode || '').trim().toUpperCase();
  if (normalizedCode || promotionId) {
    const now = new Date();
    const settings = await ApplicationSettings.findOne({ key: 'global' }).lean();
    let promotion = null;
    let isCoupon = false;
    if (normalizedCode && settings?.couponsEnabled !== false) {
      promotion = await Coupon.findOne({ code: normalizedCode, enabled: true, startDate: { $lte: now }, endDate: { $gte: now } }).lean();
      isCoupon = Boolean(promotion);
    }
    if (!promotion && settings?.discountsEnabled !== false) {
      const filter = { enabled: true, startDate: { $lte: now }, endDate: { $gte: now } };
      if (promotionId && mongoose.isValidObjectId(promotionId)) filter._id = promotionId;
      else if (normalizedCode) filter.code = normalizedCode;
      promotion = await Discount.findOne(filter).lean();
    }
    if (!promotion) throw new Error('Promo code is no longer active');
    promotionName = promotion.name || normalizedCode;
    promotionReservation = { id: promotion._id, type: isCoupon ? 'coupon' : 'discount' };
    if (promotion.ownerUserId) {
      const booking = mongoose.isValidObjectId(bookingId)
        ? await Booking.findById(bookingId).select('userId fromCity toCity source destination').lean()
        : null;
      const bookingFrom = normalizeRouteCity(booking?.fromCity || booking?.source);
      const bookingTo = normalizeRouteCity(booking?.toCity || booking?.destination);
      if (!booking || String(booking.userId) !== String(promotion.ownerUserId) ||
          bookingFrom !== normalizeRouteCity(promotion.returnFrom) || bookingTo !== normalizeRouteCity(promotion.returnTo) ||
          Number(promotion.usageCount || 0) >= 1) {
        throw new Error('This return offer is not valid for this booking');
      }
      returnCouponId = promotion._id;
      promotionReservation = null;
    }
    const baseAmount = Number(blockAmount) || 0;
    if (baseAmount <= 0) throw new Error('Bus fare is unavailable; please select seats again');
    if (baseAmount < (Number(promotion.minimumBooking) || 0)) throw new Error('Promo code minimum booking amount is not met');
    if (Number(promotion.usageLimit) > 0 && Number(promotion.usageCount || 0) >= Number(promotion.usageLimit)) {
      throw new Error('This promotion has reached its usage limit');
    }
    const ownerBooking = mongoose.isValidObjectId(bookingId)
      ? await Booking.findById(bookingId).select('userId').lean()
      : null;
    if (Number(promotion.perUserLimit) > 0 && ownerBooking) {
      const promotionCode = String(promotion.code || normalizedCode).toUpperCase();
      const previousUses = await Booking.countDocuments({ userId: ownerBooking.userId, serviceType: 'bus',
        promotionCode, status: { $in: ['confirmed', 'completed'] }, paymentStatus: 'completed' });
      if (previousUses >= Number(promotion.perUserLimit)) throw new Error('You have already used this promotion the maximum number of times');
    }
    const isPercentage = !isCoupon || promotion.type === 'percentage';
    const value = Number(promotion.percentage ?? promotion.value);
    const rawDiscount = isPercentage ? baseAmount * value / 100 : value;
    const maximum = Number(promotion.maximumDiscount);
    promotionCredit = Math.min(baseAmount, Math.round((Math.min(maximum > 0 ? Math.min(rawDiscount, maximum) : rawDiscount, baseAmount) + Number.EPSILON) * 100) / 100);
  }
  return { walletCredit, promotionCredit, returnCouponId, promotionReservation,
    promotionCode: normalizedCode, promotionName };
};

const releasePromotionReservation = async (reservation) => {
  if (!reservation?.id || !['coupon', 'discount'].includes(reservation.type)) return;
  const Model = reservation.type === 'coupon' ? Coupon : Discount;
  await Model.updateOne({ _id: reservation.id, usageCount: { $gt: 0 } }, { $inc: { usageCount: -1 } });
};

const reverseWalletDebit = async (bookingId, amount) => {
  if (!mongoose.isValidObjectId(bookingId) || !(Number(amount) > 0)) return false;
  const booking = await Booking.findById(bookingId).select('userId');
  if (!booking) return false;
  const account = await User.findById(booking.userId).select('walletBalance walletTransactions walletProcessedAdjustments');
  const debit = account?.walletTransactions?.find((item) => item.type === 'debit' &&
    String(item.bookingId) === String(bookingId) && Number(item.amount) === Number(amount));
  if (!debit) return false;
  const refundKey = `bus-booking-wallet-refund-${bookingId}`;
  if (account.walletProcessedAdjustments?.includes(refundKey)) return true;
  const restored = await User.findOneAndUpdate(
    { _id: booking.userId, walletProcessedAdjustments: { $ne: refundKey } },
    { $inc: { walletBalance: Number(debit.amount) }, $addToSet: { walletProcessedAdjustments: refundKey },
      $push: { walletTransactions: { $each: [{ type: 'credit', amount: Number(debit.amount), requestId: refundKey,
        bookingId: String(bookingId), description: 'Bus booking payment reversed', createdAt: new Date() }], $slice: -100 } } },
    { new: true, projection: { walletBalance: 1 } }
  );
  return Boolean(restored) || Boolean(await User.exists({ _id: booking.userId, walletProcessedAdjustments: refundKey }));
};

const updateBusBookingFromOperator = async ({ bookingId, data, paymentId, paymentOrderId, paymentMethod,
  appliedPromotion, refundStatus = '', failure = null }) => {
  if (!mongoose.isValidObjectId(bookingId)) return;
  const booking = await Booking.findById(bookingId);
  if (!booking) return;
  if (failure) {
    booking.status = failure.pending ? 'pending' : 'failed';
    booking.paymentStatus = failure.paymentStatus || (paymentId?.startsWith('WALLET-') ? 'refunded' : 'completed');
    booking.providerStatus = failure.pending ? 'confirmation_unknown' : 'booking_failed';
    booking.failureStage = failure.pending ? 'provider_confirmation' : 'provider_booking';
    booking.failureReason = String(failure.reason || 'The bus operator could not confirm this booking').slice(0, 500);
    booking.failedAt = failure.pending ? undefined : (booking.failedAt || new Date());
    booking.paymentId = paymentId || booking.paymentId;
    booking.paymentOrderId = paymentOrderId || booking.paymentOrderId;
    booking.paymentMethod = paymentMethod || booking.paymentMethod;
    if (refundStatus) booking.refundStatus = refundStatus;
  } else {
    const ticketNo = String(read(data, 'etstnumber', 'ETSTNumber', 'ticketNo') || '');
    booking.status = 'confirmed';
    booking.paymentStatus = 'completed';
    booking.providerStatus = 'CONFIRMED';
    booking.failureStage = '';
    booking.failureReason = '';
    booking.confirmedAt = booking.confirmedAt || new Date();
    booking.paymentId = paymentId || '';
    booking.paymentOrderId = paymentOrderId || '';
    booking.paymentMethod = paymentMethod || '';
    booking.ticketNo = ticketNo;
    booking.externalBookingId = ticketNo;
    booking.pnr = String(read(data, 'opPNR', 'pnr') || '');
    booking.promotionCode = appliedPromotion?.promotionCode || '';
    booking.promotionName = appliedPromotion?.promotionName || '';
    booking.promotionDiscount = appliedPromotion?.promotionCredit || 0;
  }
  booking.statusHistory.push({ status: booking.status, paymentStatus: booking.paymentStatus,
    stage: booking.failureStage || 'operator_confirmed', message: booking.failureReason || '', createdAt: new Date() });
  await booking.save();
  if (!failure && booking.status === 'confirmed' && booking.ticketNo) dispatchBookingConfirmationSms(booking._id);
};

const REFERRER_REWARD_PERCENTAGE = 2;
const INVITEE_FIRST_BOOKING_REWARD_PERCENTAGE = 8;
const REFERRER_REWARD_CAP = 1000;
const calculateReferralRewards = (bookingAmount) => {
  const eligibleAmount = Math.max(0, Math.round((Number(bookingAmount) || 0) * 100) / 100);
  return {
    eligibleAmount,
    referrerAmount: Math.round((eligibleAmount * REFERRER_REWARD_PERCENTAGE / 100 + Number.EPSILON) * 100) / 100,
    inviteeAmount: Math.round((eligibleAmount * INVITEE_FIRST_BOOKING_REWARD_PERCENTAGE / 100 + Number.EPSILON) * 100) / 100,
  };
};

const ensureReferralRewardTotal = async (userId) => {
  const historical = await Referral.aggregate([
    { $match: { referrerUserId: new mongoose.Types.ObjectId(String(userId)), status: 'rewarded' } },
    { $group: { _id: null, total: { $sum: '$rewardAmount' } } },
  ]);
  const historicalTotal = Math.min(REFERRER_REWARD_CAP, Math.max(0, Number(historical[0]?.total) || 0));
  await User.updateOne({ _id: userId, referralRewardTotal: { $exists: false } },
    { $set: { referralRewardTotal: historicalTotal } });
  const referrer = await User.findById(userId).select('referralRewardTotal').lean();
  return Math.min(REFERRER_REWARD_CAP, Math.max(0, Number(referrer?.referralRewardTotal) || 0));
};

const creditCappedReferralCommission = async ({ userId, referral, bookingId, bookingAmount, amount }) => {
  const requestId = `referral-commission-${referral._id}-${bookingId}`;
  await ensureReferralRewardTotal(userId);
  const credit = { $min: [amount, { $max: [0, { $subtract: [REFERRER_REWARD_CAP, { $ifNull: ['$referralRewardTotal', 0] }] }] }] };
  const account = await User.findOneAndUpdate({
    _id: userId,
    walletProcessedAdjustments: { $ne: requestId },
    $or: [{ referralRewardTotal: { $lt: REFERRER_REWARD_CAP } }, { referralRewardTotal: { $exists: false } }],
  }, [
    { $set: { __referralCredit: credit } },
    { $set: {
      walletBalance: { $add: [{ $ifNull: ['$walletBalance', 0] }, '$__referralCredit'] },
      referralRewardTotal: { $add: [{ $ifNull: ['$referralRewardTotal', 0] }, '$__referralCredit'] },
      walletProcessedAdjustments: { $concatArrays: [{ $ifNull: ['$walletProcessedAdjustments', []] }, [{ $literal: requestId }]] },
      walletTransactions: { $slice: [{ $concatArrays: [{ $ifNull: ['$walletTransactions', []] }, [{
        type: { $literal: 'referral_commission' }, amount: '$__referralCredit', requestId: { $literal: requestId },
        bookingId: { $literal: String(bookingId) }, bookingAmount, rewardPercentage: REFERRER_REWARD_PERCENTAGE,
        description: { $literal: 'Referral commission · bus booking' }, createdAt: new Date(),
      }]] }, -100] },
    } },
    { $unset: '__referralCredit' },
  ], { new: true, projection: { _id: 1 } });
  if (!account) {
    const referrer = await User.findById(userId).select('walletProcessedAdjustments referralRewardTotal').lean();
    if (!referrer || (referrer.walletProcessedAdjustments || []).includes(requestId) ||
        Number(referrer.referralRewardTotal || 0) >= REFERRER_REWARD_CAP) return;
    throw new Error('Referrer wallet could not be credited');
  }
};

const creditInviteeFirstBookingBonus = async ({ userId, referral, bookingAmount }) => {
  const amount = calculateReferralRewards(bookingAmount).inviteeAmount;
  if (amount <= 0) return false;
  const requestId = `referral-invitee-bonus-${referral._id}`;
  const account = await User.findOneAndUpdate({ _id: userId, walletProcessedAdjustments: { $ne: requestId } }, {
    $inc: { walletBalance: amount },
    $addToSet: { walletProcessedAdjustments: requestId },
    $push: { walletTransactions: { $each: [{ type: 'referral_bonus', amount, requestId,
      bookingId: String(referral.firstBookingId), bookingAmount, rewardPercentage: INVITEE_FIRST_BOOKING_REWARD_PERCENTAGE,
      description: 'One-time 8% first bus booking referral reward', createdAt: new Date() }], $slice: -100 } },
  }, { new: true, projection: { _id: 1 } });
  if (!account) {
    const invitee = await User.findById(userId).select('walletProcessedAdjustments').lean();
    if (!invitee || (invitee.walletProcessedAdjustments || []).includes(requestId)) return false;
    throw new Error('Referred customer wallet could not be credited');
  }
  return true;
};

const rewardReferralForSuccessfulBooking = async (bookingId, bookingAmount) => {
  if (!mongoose.isValidObjectId(bookingId)) return;
  const booking = await Booking.findById(bookingId).select('userId serviceType status paymentStatus ticketNo').lean();
  if (!booking || booking.serviceType !== 'bus' || !['confirmed', 'completed'].includes(booking.status) ||
      booking.paymentStatus !== 'completed' || !booking.ticketNo) return;

  const { eligibleAmount, referrerAmount: amount, inviteeAmount } = calculateReferralRewards(bookingAmount);
  let referral = await Referral.findOneAndUpdate({ referredUserId: booking.userId, firstBookingId: null, status: 'joined' }, {
    $set: { firstBookingId: booking._id, bookingAmount: eligibleAmount, rewardPercentage: REFERRER_REWARD_PERCENTAGE,
      rewardAmount: amount, inviteeRewardPercentage: INVITEE_FIRST_BOOKING_REWARD_PERCENTAGE,
      inviteeRewardAmount: inviteeAmount,
      status: 'qualified', qualifiedAt: new Date() },
  }, { new: true });
  if (!referral) referral = await Referral.findOne({ referredUserId: booking.userId });
  if (!referral) return;

  if (amount > 0) await creditCappedReferralCommission({ userId: referral.referrerUserId, referral,
    bookingId: booking._id, bookingAmount: eligibleAmount, amount });

  if (String(referral.firstBookingId) === String(booking._id)) {
    const credited = await creditInviteeFirstBookingBonus({ userId: booking.userId, referral, bookingAmount: eligibleAmount });
    if (credited) await Referral.updateOne({ _id: referral._id }, { $set: { inviteeRewardedAt: new Date() } });
  }
  await Referral.updateOne(
    { _id: referral._id, status: { $in: ['joined', 'qualified'] } },
    { $set: { status: 'rewarded', rewardedAt: new Date() } }
  );
};

const retryReferralRewardForBooking = async (booking) => {
  if (!booking?._id) return;
  try {
    const eligibleAmount = Math.max(0, toAmount(booking.totalFare) - toAmount(booking.promotionDiscount));
    await rewardReferralForSuccessfulBooking(booking._id, eligibleAmount);
  } catch (error) {
    console.error('[ETS API] Referral reward retry failed:', error.message);
  }
};

// ============================================
// CONFIGURATION (from environment only)
// ============================================

const ETS_API_CONFIG = {
  baseUrl: process.env.ETS_API_URL || 'http://agent.etravelsmart.com/etsAPI/api',
  username: process.env.ETS_API_USERNAME,
  password: process.env.ETS_API_PASSWORD,
  timeout: parseInt(process.env.ETS_API_TIMEOUT) || 30000,
};

// Validate configuration on startup
const isConfigured = () => {
  return !!(ETS_API_CONFIG.baseUrl && ETS_API_CONFIG.username && ETS_API_CONFIG.password);
};

// Log configuration status (never log actual credentials)
if (isConfigured()) {
  console.log('[ETS API] ✅ Configuration loaded successfully');
  console.log('[ETS API] Base URL:', ETS_API_CONFIG.baseUrl);
} else {
  console.warn('[ETS API] ⚠️ Missing configuration - check ETS_API_* environment variables');
}

// ============================================
// AXIOS INSTANCE WITH DIGEST AUTH
// ============================================

let digestAuth = null;

const getDigestAuth = () => {
  if (!digestAuth && isConfigured()) {
    digestAuth = new AxiosDigestAuth({
      username: ETS_API_CONFIG.username,
      password: ETS_API_CONFIG.password,
    });
  }
  return digestAuth;
};

// ============================================
// SECURITY UTILITIES
// ============================================

/**
 * Sanitize string input to prevent injection attacks
 * @param {string} input - Raw input string
 * @returns {string} Sanitized string
 */
const sanitizeString = (input) => {
  if (typeof input !== 'string') return '';
  // Remove potentially dangerous characters while preserving valid city names
  return input
    .trim()
    .replace(/[<>\"\'\\]/g, '') // Remove quotes, backslashes, angle brackets
    .substring(0, 100); // Limit length
};

/**
 * Validate date format (yyyy-MM-dd)
 * @param {string} date - Date string
 * @returns {boolean} Is valid
 */
const isValidDate = (date) => {
  if (!date || typeof date !== 'string') return false;
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(date)) return false;
  const parsed = new Date(date);
  return !isNaN(parsed.getTime());
};

/**
 * Validate inventory type
 * @param {string|number} type - Inventory type
 * @returns {boolean} Is valid
 */
const isValidInventoryType = (type) => {
  const num = parseInt(type);
  return !isNaN(num) && num >= 0 && num <= 999;
};

/**
 * Validate route schedule ID
 * @param {string} id - Route schedule ID
 * @returns {boolean} Is valid
 */
const isValidRouteScheduleId = (id) => {
  if (!id || typeof id !== 'string') return false;
  // Route schedule IDs are typically numeric or alphanumeric
  return /^[a-zA-Z0-9_-]{1,50}$/.test(id);
};

/**
 * Validate phone number (Indian format)
 * @param {string} phone - Phone number
 * @returns {boolean} Is valid
 */
const isValidPhone = (phone) => {
  if (!phone || typeof phone !== 'string') return false;
  return /^[6-9]\d{9}$/.test(phone.replace(/\s/g, ''));
};

/**
 * Validate email
 * @param {string} email - Email address
 * @returns {boolean} Is valid
 */
const isValidEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 100;
};

/**
 * Validate ETS ticket number format
 * @param {string} ticketNo - ETS ticket number
 * @returns {boolean} Is valid
 */
const isValidETSTicketNumber = (ticketNo) => {
  if (!ticketNo || typeof ticketNo !== 'string') return false;
  const trimmed = ticketNo.trim();
  if (trimmed.length < 1 || trimmed.length > 50) return false;
  return /^[A-Za-z0-9\-_]+$/.test(trimmed);
};

/**
 * Validate block ticket key
 * @param {string} key - Block ticket key
 * @returns {boolean} Is valid
 */
const isValidBlockTicketKey = (key) => {
  if (!key || typeof key !== 'string') return false;
  const trimmed = key.trim();
  if (trimmed.length < 1 || trimmed.length > 500) return false;
  // Allow alphanumeric, hyphens, underscores, equals, plus, slashes (base64/UUID formats)
  return /^[A-Za-z0-9\-_=+/:.]+$/.test(trimmed);
};

// ============================================
// RATE LIMITING
// ============================================

const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 30; // Max requests per window

/**
 * Simple in-memory rate limiting
 */
const rateLimit = (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  
  if (!rateLimitStore.has(ip)) {
    rateLimitStore.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
  } else {
    const record = rateLimitStore.get(ip);
    if (now > record.resetTime) {
      record.count = 1;
      record.resetTime = now + RATE_LIMIT_WINDOW;
    } else {
      record.count++;
    }
    
    if (record.count > RATE_LIMIT_MAX_REQUESTS) {
      return res.status(429).json({
        apiStatus: { success: false, message: 'Too many requests. Please try again later.' }
      });
    }
  }
  next();
};

// Clean up rate limit store periodically
const rateLimitCleanup = setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimitStore.entries()) {
    if (now > record.resetTime) {
      rateLimitStore.delete(ip);
    }
  }
}, 60000);
rateLimitCleanup.unref?.();

// ============================================
// MIDDLEWARE
// ============================================

/**
 * Verify ETS API configuration
 */
const checkConfig = (req, res, next) => {
  if (!isConfigured()) {
    console.error('[ETS API] Missing configuration');
    return res.status(503).json({
      apiStatus: { success: false, message: 'Bus service temporarily unavailable' }
    });
  }
  next();
};

/**
 * Generate unique request ID for tracing
 */
const generateRequestId = () => {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};

/**
 * Log API requests (without sensitive data)
 */
const requestLogger = (req, res, next) => {
  // Generate request ID for tracing
  req.requestId = generateRequestId();
  res.setHeader('X-Request-Id', req.requestId);
  
  const sanitizedQuery = { ...req.query };
  // Remove any potentially sensitive fields from logging
  delete sanitizedQuery.customerPhone;
  delete sanitizedQuery.customerEmail;
  delete sanitizedQuery.paymentId;
  delete sanitizedQuery.ticketNo;
  delete sanitizedQuery.ETSTNumber;
  delete sanitizedQuery.bookingId;
  
  console.log(`[ETS API] ${req.method} ${req.path}`, {
    requestId: req.requestId,
    timestamp: new Date().toISOString(),
    query: Object.keys(sanitizedQuery).length > 0 ? sanitizedQuery : undefined,
    body: req.body ? '[PRESENT]' : undefined,
  });
  next();
};

/**
 * Add security headers to responses
 */
const securityHeaders = (req, res, next) => {
  // Prevent caching of sensitive data
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
};

// Apply middleware to all routes
router.use(rateLimit);
router.use(checkConfig);
router.use(securityHeaders);
router.use(requestLogger);

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Make authenticated request to ETS API
 * @param {Object} options - Request options
 * @returns {Promise<Object>} API response
 */
const makeETSRequest = async (options) => {
  const auth = getDigestAuth();
  if (!auth) {
    throw new Error('API not configured');
  }

  const response = await auth.request({
    timeout: ETS_API_CONFIG.timeout,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    ...options,
  });

  return response.data;
};

const read = (object, ...keys) => {
  for (const key of keys) {
    if (object?.[key] !== undefined && object?.[key] !== null) return object[key];
  }
  return undefined;
};

const BUS_BLOCK_TTL_MS = (Number.parseInt(process.env.BUS_BLOCK_TTL_MINUTES, 10) || 12) * 60 * 1000;
const busBlockStore = new Map();

const dispatchBookingConfirmationSms = (bookingId) => {
  setImmediate(() => {
    smsService.sendBookingConfirmation(bookingId).catch((error) => {
      console.error('[SMS] Booking confirmation dispatch failed:', error.message);
    });
  });
};

const normalizeBlockTicketKey = (value) => String(value || '').trim();

const pruneBusBlocks = () => {
  const now = Date.now();
  for (const [key, value] of busBlockStore.entries()) {
    if (value.expiresAt <= now) busBlockStore.delete(key);
  }
};

const getBusBlock = (blockTicketKey) => {
  pruneBusBlocks();
  const key = normalizeBlockTicketKey(blockTicketKey);
  return busBlockStore.get(key) || busBlockStore.get(key.toUpperCase()) || null;
};

const storeBusBlock = (blockTicketKey, metadata) => {
  const key = normalizeBlockTicketKey(blockTicketKey);
  if (!key) return null;
  pruneBusBlocks();
  const record = {
    ...metadata,
    blockTicketKey: key,
    createdAt: Date.now(),
    expiresAt: Date.now() + BUS_BLOCK_TTL_MS,
  };
  busBlockStore.set(key, record);
  busBlockStore.set(key.toUpperCase(), record);
  return record;
};

const getAssuranceFeePerSeat = () => toAmount(process.env.BUS_ASSURANCE_FEE_PER_SEAT || 24);

const isTruthy = (value) => value === true || value === 'true' || value === 1 || value === '1';

const getSeatKey = (seat) => String(
  read(seat, 'id', 'seatNbr', 'seatNo', 'seatNumber', 'seatName', 'name') || ''
).trim();

const getSeatFareAmount = (seat) => {
  const fare = toAmount(read(seat, 'fare', 'baseFare', 'price'));
  const tax = toAmount(read(seat, 'serviceTaxAmount', 'tax'));
  const operatorCharge = toAmount(read(seat, 'operatorServiceChargeAbsolute', 'operatorServiceCharge'));
  const total = toAmount(read(seat, 'totalFareWithTaxes', 'totalFare', 'price'));
  return total || fare + tax + operatorCharge;
};

const stampProviderSeatFares = (passengers, providerSeats) => {
  const seatsByKey = new Map();
  (providerSeats || []).forEach((seat) => {
    const key = getSeatKey(seat);
    if (key) seatsByKey.set(key, seat);
  });

  let requiredAmount = 0;
  const stampedPassengers = passengers.map((passenger) => {
    const seatNbr = String(passenger.seatNbr || '').trim();
    const providerSeat = seatsByKey.get(seatNbr);

    if (!providerSeat) {
      const error = new Error(`Selected seat ${seatNbr || ''} is no longer available`);
      error.status = 409;
      throw error;
    }

    if (providerSeat.available === false || providerSeat.available === 'false') {
      const error = new Error(`Selected seat ${seatNbr} is already booked`);
      error.status = 409;
      throw error;
    }

    const fare = toAmount(read(providerSeat, 'fare', 'baseFare', 'price'));
    const serviceTaxAmount = toAmount(read(providerSeat, 'serviceTaxAmount', 'tax'));
    const operatorServiceChargeAbsolute = toAmount(read(providerSeat, 'operatorServiceChargeAbsolute', 'operatorServiceCharge'));
    const totalFareWithTaxes = getSeatFareAmount(providerSeat);

    if (totalFareWithTaxes <= 0) {
      const error = new Error(`Unable to verify fare for seat ${seatNbr}`);
      error.status = 409;
      throw error;
    }

    requiredAmount += totalFareWithTaxes;

    return {
      ...passenger,
      seatNbr,
      fare: Math.round(fare * 100) / 100,
      serviceTaxAmount: Math.round(serviceTaxAmount * 100) / 100,
      operatorServiceChargeAbsolute: Math.round(operatorServiceChargeAbsolute * 100) / 100,
      totalFareWithTaxes: Math.round(totalFareWithTaxes * 100) / 100,
      ladiesSeat: isTruthy(read(providerSeat, 'ladiesSeat', 'isLadiesSeat')) || passenger.ladiesSeat || false,
      ac: isTruthy(read(providerSeat, 'ac')) || passenger.ac || false,
      sleeper: isTruthy(read(providerSeat, 'sleeper')) || passenger.sleeper || false,
    };
  });

  return {
    passengers: stampedPassengers,
    seatFareAmount: Math.round(requiredAmount * 100) / 100,
  };
};

const getRtcFareAmount = (payload) => toAmount(
  read(payload, 'updatedFare', 'totalFare', 'totalFareWithTaxes', 'fare', 'amount') ||
  read(payload?.Result, 'updatedFare', 'totalFare', 'totalFareWithTaxes', 'fare', 'amount')
);

const cleanupBusBlocks = setInterval(pruneBusBlocks, 60000);
cleanupBusBlocks.unref?.();

/**
 * Determine boarding point source based on inventory type
 * Per ETS API Documentation:
 * - inventoryType 0, 1: Use boarding points from getAvailableBuses response
 * - inventoryType 2, 3, 5, 6: Use boarding points from getBusLayout response
 * - inventoryType 1: Boarding time may be null in layout; prefer search results for time
 * - To display complete boarding name with landmarks, map using boardingId from both responses
 * 
 * @param {number} inventoryType - Inventory type from bus response
 * @returns {Object} Configuration for boarding points
 */
const getBoardingPointConfig = (inventoryType) => {
  const type = parseInt(inventoryType);
  
  // Inventory types 2, 3, 5, 6: Use boarding points from getBusLayout
  // NOTE: For inventoryType 6 (MSRTC buses), MUST use layout response
  const useLayoutBoarding = [2, 3, 5, 6].includes(type);
  
  return {
    inventoryType: type,
    useLayoutForBoardingPoints: useLayoutBoarding,
    useSearchForBoardingPoints: !useLayoutBoarding,
    // For type 1: Both methods have boarding points but time is null in layout
    // Prefer search results for complete data including time
    preferSearchForTime: type === 1,
    // For complete boarding name with landmarks, map using boardingId
    canMapWithBoardingId: type === 1,
    // For MSRTC (type 6), always use layout
    isMSRTC: type === 6,
    // Notes for frontend
    notes: useLayoutBoarding
      ? 'Boarding/dropping points MUST be fetched from bus layout response'
      : 'Boarding/dropping points available in search results',
    recommendation: type === 1
      ? 'Use search results for boarding time; can map with layout using boardingId for landmarks'
      : null,
  };
};

/**
 * Handle API errors consistently
 * @param {Error} error - Error object
 * @param {string} operation - Operation name for logging
 * @param {Object} res - Express response object
 */
const handleApiError = (error, operation, res) => {
  console.error(`[ETS API] ${operation} error:`, {
    message: error.message,
    status: error.response?.status,
    data: error.response?.data?.apiStatus || 'No additional info',
  });

  if (error instanceof PaymentSecurityError || (error.status && !error.response)) {
    return res.status(error.status || 400).json({
      apiStatus: {
        success: false,
        message: error.message || `Failed to ${operation.toLowerCase()}`,
      },
    });
  }

  // Return ETS API error if available
  if (error.response?.data?.apiStatus) {
    return res.status(error.response.status || 500).json(error.response.data);
  }

  // Generic error response (don't leak internal details)
  const statusCode = error.response?.status || 500;
  res.status(statusCode).json({
    apiStatus: { 
      success: false, 
      message: statusCode === 401 
        ? 'Authentication failed' 
        : `Failed to ${operation.toLowerCase()}`
    }
  });
};

// ============================================
// API ROUTES
// ============================================

/**
 * Get all stations/cities
 * GET /ets/getStations
 * 
 * Returns list of all available stations for bus booking
 */
router.get('/ets/getStations', async (req, res) => {
  try {
    const data = await makeETSRequest({
      method: 'GET',
      url: `${ETS_API_CONFIG.baseUrl}/getStations`,
    });
    
    res.json(data);
  } catch (error) {
    handleApiError(error, 'Get stations', res);
  }
});

/**
 * Search available buses
 * GET /ets/getAvailableBuses
 * 
 * Query params: 
 * - sourceCity: Source city name (required)
 * - destinationCity: Destination city name (required)
 * - doj: Date of journey in yyyy-MM-dd format (required)
 * 
 * Response includes boarding point configuration based on inventory type
 */
router.get('/ets/getAvailableBuses', async (req, res) => {
  try {
    const { sourceCity, destinationCity, doj } = req.query;
    
    // Validate required parameters
    if (!sourceCity || !destinationCity || !doj) {
      return res.status(400).json({
        apiStatus: { 
          success: false, 
          message: 'Missing required parameters: sourceCity, destinationCity, doj' 
        }
      });
    }

    // Validate date format
    if (!isValidDate(doj)) {
      return res.status(400).json({
        apiStatus: { success: false, message: 'Invalid date format. Use yyyy-MM-dd' }
      });
    }

    // Sanitize inputs
    const sanitizedSource = sanitizeString(sourceCity);
    const sanitizedDest = sanitizeString(destinationCity);

    if (!sanitizedSource || !sanitizedDest) {
      return res.status(400).json({
        apiStatus: { success: false, message: 'Invalid city names provided' }
      });
    }

    const data = await makeETSRequest({
      method: 'GET',
      url: `${ETS_API_CONFIG.baseUrl}/getAvailableBuses`,
      params: {
        sourceCity: sanitizedSource,
        destinationCity: sanitizedDest,
        doj,
      },
    });

    // Enhance response with boarding point configuration for each bus
    if (data.apiAvailableBuses && Array.isArray(data.apiAvailableBuses)) {
      data.apiAvailableBuses = data.apiAvailableBuses.map(bus => ({
        ...bus,
        _boardingPointConfig: getBoardingPointConfig(bus.inventoryType),
      }));
    }
    
    res.json(data);
  } catch (error) {
    handleApiError(error, 'Search buses', res);
  }
});

/**
 * Get bus seat layout
 * GET /ets/getBusLayout
 * 
 * Query params:
 * - sourceCity: Source city name (required)
 * - destinationCity: Destination city name (required)
 * - doj: Date of journey in yyyy-MM-dd format (required)
 * - inventoryType: Inventory type from search results (required)
 * - routeScheduleId: Route schedule ID from search results (required)
 * 
 * NOTE: For inventoryType 2, 3, 5, 6 - boarding/dropping points are in this response
 *       For inventoryType 0, 1 - use boarding/dropping from search results
 */
router.get('/ets/getBusLayout', async (req, res) => {
  try {
    const { sourceCity, destinationCity, doj, inventoryType, routeScheduleId } = req.query;
    
    // Validate required parameters
    if (!sourceCity || !destinationCity || !doj || inventoryType === undefined || !routeScheduleId) {
      return res.status(400).json({
        apiStatus: { 
          success: false, 
          message: 'Missing required parameters: sourceCity, destinationCity, doj, inventoryType, routeScheduleId' 
        }
      });
    }

    // Validate date format
    if (!isValidDate(doj)) {
      return res.status(400).json({
        apiStatus: { success: false, message: 'Invalid date format. Use yyyy-MM-dd' }
      });
    }

    // Validate inventory type
    if (!isValidInventoryType(inventoryType)) {
      return res.status(400).json({
        apiStatus: { success: false, message: 'Invalid inventory type' }
      });
    }

    // Validate route schedule ID
    if (!isValidRouteScheduleId(routeScheduleId)) {
      return res.status(400).json({
        apiStatus: { success: false, message: 'Invalid route schedule ID' }
      });
    }

    // Sanitize city inputs
    const sanitizedSource = sanitizeString(sourceCity);
    const sanitizedDest = sanitizeString(destinationCity);

    if (!sanitizedSource || !sanitizedDest) {
      return res.status(400).json({
        apiStatus: { success: false, message: 'Invalid city names provided' }
      });
    }

    const data = await makeETSRequest({
      method: 'GET',
      url: `${ETS_API_CONFIG.baseUrl}/getBusLayout`,
      params: {
        sourceCity: sanitizedSource,
        destinationCity: sanitizedDest,
        doj,
        inventoryType,
        routeScheduleId,
      },
    });

    // Add boarding point config to response
    data._boardingPointConfig = getBoardingPointConfig(inventoryType);
    
    res.json(data);
  } catch (error) {
    handleApiError(error, 'Get bus layout', res);
  }
});

/**
 * Block ticket (reserve seats for 10 minutes)
 * POST /ets/blockTicket
 * 
 * Request body should contain passenger and seat details
 * 
 * IMPORTANT: For ladies seat, ensure passenger sex is 'F' and title is 'Mrs/Ms'
 * Always include idType and idNumber fields even if empty
 */
router.post('/ets/blockTicket', requireBookingAvailability, async (req, res) => {
  try {
    const {
      sourceCity,
      destinationCity,
      doj,
      routeScheduleId,
      boardingPoint,
      customerName,
      customerEmail,
      customerPhone,
      blockSeatPaxDetails,
      inventoryType,
      assuranceOpted,
      isRTC,
    } = req.body;

    // Validate required fields
    if (!sourceCity || !destinationCity || !doj || !routeScheduleId || !customerName || 
        !customerEmail || !customerPhone || !blockSeatPaxDetails || inventoryType === undefined) {
      return res.status(400).json({
        apiStatus: { 
          success: false, 
          message: 'Missing required booking parameters' 
        }
      });
    }

    // Validate date
    if (!isValidDate(doj)) {
      return res.status(400).json({
        apiStatus: { success: false, message: 'Invalid date format' }
      });
    }

    // Validate customer details
    if (!isValidEmail(customerEmail)) {
      return res.status(400).json({
        apiStatus: { success: false, message: 'Invalid email address' }
      });
    }

    if (!isValidPhone(customerPhone)) {
      return res.status(400).json({
        apiStatus: { success: false, message: 'Invalid phone number' }
      });
    }

    if (!isValidInventoryType(inventoryType) || !isValidRouteScheduleId(String(routeScheduleId))) {
      return res.status(400).json({
        apiStatus: { success: false, message: 'Invalid bus inventory or schedule details' }
      });
    }

    // Validate passenger details
    if (!Array.isArray(blockSeatPaxDetails) || blockSeatPaxDetails.length === 0) {
      return res.status(400).json({
        apiStatus: { success: false, message: 'At least one passenger is required' }
      });
    }

    // Validate each passenger
    const hasPrimary = blockSeatPaxDetails.some(pax => pax.primary === true);
    if (!hasPrimary) {
      return res.status(400).json({
        apiStatus: { 
          success: false, 
          message: 'One passenger must be marked as primary' 
        }
      });
    }

    // Validate boarding point based on inventory type
    const boardingConfig = getBoardingPointConfig(inventoryType);
    if (!boardingPoint || !boardingPoint.id) {
      // Boarding point is typically required
      console.warn('[ETS API] No boarding point provided');
    }

    const sanitizedSource = sanitizeString(sourceCity);
    const sanitizedDest = sanitizeString(destinationCity);

    if (!sanitizedSource || !sanitizedDest) {
      return res.status(400).json({
        apiStatus: { success: false, message: 'Invalid city names provided' }
      });
    }

    const layoutData = await makeETSRequest({
      method: 'GET',
      url: `${ETS_API_CONFIG.baseUrl}/getBusLayout`,
      params: {
        sourceCity: sanitizedSource,
        destinationCity: sanitizedDest,
        doj,
        inventoryType,
        routeScheduleId,
      },
    });

    const providerSeats = Array.isArray(layoutData.seats)
      ? layoutData.seats
      : Array.isArray(layoutData.Seats)
        ? layoutData.Seats
        : [];

    const sanitizedBody = {
      ...req.body,
      sourceCity: sanitizedSource,
      destinationCity: sanitizedDest,
      customerName: sanitizeString(customerName),
      customerLastName: sanitizeString(req.body.customerLastName || ''),
      customerEmail: customerEmail.toLowerCase().trim(),
      customerPhone: customerPhone.replace(/\s/g, ''),
      customerAddress: sanitizeString(req.body.customerAddress || ''),
      blockSeatPaxDetails: blockSeatPaxDetails.map(pax => ({
        ...pax,
        name: sanitizeString(pax.name || ''),
        lastName: sanitizeString(pax.lastName || ''),
        email: pax.email ? pax.email.toLowerCase().trim() : '',
        mobile: pax.mobile ? pax.mobile.replace(/\s/g, '') : '',
        // Ensure required fields are present
        idType: pax.idType || 'PAN_CARD',
        idNumber: pax.idNumber || '',
        nameOnId: sanitizeString(pax.nameOnId || pax.name || ''),
      })),
    };

    const fareVerification = stampProviderSeatFares(sanitizedBody.blockSeatPaxDetails, providerSeats);
    const assuranceAmount = isTruthy(assuranceOpted)
      ? getAssuranceFeePerSeat() * fareVerification.passengers.length
      : 0;
    const requiredAmount = Math.round((fareVerification.seatFareAmount + assuranceAmount) * 100) / 100;
    sanitizedBody.blockSeatPaxDetails = fareVerification.passengers;

    const data = await makeETSRequest({
      method: 'POST',
      url: `${ETS_API_CONFIG.baseUrl}/blockTicket`,
      data: sanitizedBody,
    });

    const blockTicketKey = read(data, 'blockTicketKey', 'BlockTicketKey', 'blockKey');
    if (blockTicketKey && data.apiStatus?.success !== false) {
      storeBusBlock(blockTicketKey, {
        requiredAmount,
        seatFareAmount: fareVerification.seatFareAmount,
        assuranceAmount,
        seatCount: fareVerification.passengers.length,
        sourceCity: sanitizedSource,
        destinationCity: sanitizedDest,
        doj,
        routeScheduleId,
        inventoryType,
        isRTC: isTruthy(isRTC),
      });
    }

    res.json({
      ...data,
      requiredAmount,
      requiredAmountPaise: Math.round(requiredAmount * 100),
      seatFareAmount: fareVerification.seatFareAmount,
      assuranceAmount,
    });
  } catch (error) {
    handleApiError(error, 'Block ticket', res);
  }
});

/**
 * Get RTC updated fare (for RTC services only)
 * GET /ets/getRtcUpdatedFare
 * 
 * Query params: blockTicketKey
 * 
 * NOTE: Call this ONLY for RTC services (where isRTC: true in search response)
 * Call after blockTicket and before seatBooking
 */
router.get('/ets/getRtcUpdatedFare', async (req, res) => {
  try {
    const { blockTicketKey } = req.query;
    
    if (!blockTicketKey) {
      return res.status(400).json({
        apiStatus: { success: false, message: 'Missing blockTicketKey parameter' }
      });
    }

    if (!isValidBlockTicketKey(blockTicketKey)) {
      return res.status(400).json({
        apiStatus: { success: false, message: 'Invalid block ticket key format' }
      });
    }

    const data = await makeETSRequest({
      method: 'GET',
      url: `${ETS_API_CONFIG.baseUrl}/getRtcUpdatedFare`,
      params: { blockTicketKey: blockTicketKey.toUpperCase() },
    });

    const block = getBusBlock(blockTicketKey);
    const updatedFareAmount = getRtcFareAmount(data);
    if (block && updatedFareAmount > 0) {
      block.seatFareAmount = updatedFareAmount;
      block.requiredAmount = Math.round((updatedFareAmount + toAmount(block.assuranceAmount)) * 100) / 100;
      block.rtcFareUpdatedAt = Date.now();
    }
    
    res.json({
      ...data,
      requiredAmount: block?.requiredAmount,
      requiredAmountPaise: block ? Math.round(block.requiredAmount * 100) : undefined,
    });
  } catch (error) {
    handleApiError(error, 'Get RTC updated fare', res);
  }
});

/**
 * Book seat (confirm booking after payment)
 * GET /ets/seatBooking
 * 
 * Query params: blockTicketKey
 * 
 * IMPORTANT: Call this ONLY after successful payment
 * For RTC services, call getRtcUpdatedFare first
 */
router.get('/ets/seatBooking', requireBookingAvailability, async (req, res) => {
  let returnCouponReserved = false;
  let providerCallStarted = false;
  let settlementValidated = false;
  let bookingClaimed = false;
  let settlement = null;
  let providerResponse = null;
  let cardRefundAttempted = false;
  let cardRefundSucceeded = null;
  let returnCouponToRedeem = null;
  let promotionReservation = null;
  let promotionReserved = false;
  let promotionBookingId = '';
  try {
    let appliedPromotion = null;
    let referralBookingAmount = 0;
    const { blockTicketKey, paymentId } = req.query;
    
    if (!blockTicketKey) {
      return res.status(400).json({
        apiStatus: { success: false, message: 'Missing blockTicketKey parameter' }
      });
    }

    if (!isValidBlockTicketKey(blockTicketKey)) {
      return res.status(400).json({
        apiStatus: { success: false, message: 'Invalid block ticket key format' }
      });
    }

    if (process.env.BUS_REQUIRE_PAYMENT !== 'false') {
      if (!paymentId) {
        return res.status(402).json({
          apiStatus: { success: false, message: 'Verified payment is required before bus booking' }
        });
      }

      const block = getBusBlock(blockTicketKey);
      if (!block) {
        throw new PaymentSecurityError('Bus booking session expired. Any captured payment is being reversed; please select seats again.', 409);
      }

      if (block.isRTC && !block.rtcFareUpdatedAt) {
        const rtcData = await makeETSRequest({
          method: 'GET',
          url: `${ETS_API_CONFIG.baseUrl}/getRtcUpdatedFare`,
          params: { blockTicketKey: blockTicketKey.toUpperCase() },
        });
        const updatedFareAmount = getRtcFareAmount(rtcData);
        if (updatedFareAmount > 0) {
          block.seatFareAmount = updatedFareAmount;
          block.requiredAmount = Math.round((updatedFareAmount + toAmount(block.assuranceAmount)) * 100) / 100;
          block.rtcFareUpdatedAt = Date.now();
        }
      }

      if (String(paymentId).startsWith('WALLET-')) {
        const bookingId = String(req.query.walletBookingId || '');
        if (String(paymentId) !== `WALLET-${bookingId}`) throw new PaymentSecurityError('Wallet payment reference is invalid', 400);
        const requestedWalletAmount = toAmount(req.query.walletAmount);
        settlement = { bookingId, paymentId: String(paymentId), paymentOrderId: '', paymentMethod: 'wallet',
          walletAmount: requestedWalletAmount, cardAmount: 0 };
        // Once the debit is tied to this booking and block, an invalid or
        // expired coupon must not strand wallet funds.
        const booking = await Booking.findById(bookingId).select('providerReferenceHash status ticketNo pnr paymentId refundStatus paymentStatus failureReason totalFare promotionDiscount');
        if (booking?.status === 'confirmed' && booking.ticketNo && booking.paymentId === String(paymentId)) {
          await retryReferralRewardForBooking(booking);
          dispatchBookingConfirmationSms(booking._id);
          return res.json({ apiStatus: { success: true, message: 'SUCCESS' }, etstnumber: booking.ticketNo,
            opPNR: booking.pnr, idempotent: true });
        }
        if (booking?.status === 'failed' && booking.paymentId === String(paymentId)) {
          return res.status(409).json({ apiStatus: { success: false, code: 'BOOKING_FAILED',
            message: booking.failureReason || 'This booking already failed; any applicable refund has already been started.' },
            paymentStatus: booking.paymentStatus, refundStatus: booking.refundStatus });
        }
        if (booking?.providerReferenceHash === hashReference(String(blockTicketKey))) settlementValidated = true;
        const adjustments = await getBookingAdjustments({
          bookingId,
          walletAmount: req.query.walletAmount,
          promoCode: req.query.promoCode,
          promotionId: req.query.promotionId,
          blockAmount: block.requiredAmount,
          blockTicketKey,
        });
        promotionBookingId = bookingId;
        appliedPromotion = adjustments;
        promotionReservation = adjustments.promotionReservation;
        referralBookingAmount = Math.max(0, toAmount(block.requiredAmount) - adjustments.promotionCredit);
        returnCouponToRedeem = adjustments.returnCouponId;
        if (adjustments.walletCredit + adjustments.promotionCredit < toAmount(block.requiredAmount)) {
          throw new PaymentSecurityError('Wallet and promotion credit do not cover the bus fare', 402);
        }
        settlement = { bookingId, paymentId: String(paymentId), paymentOrderId: '', paymentMethod: 'wallet',
          walletAmount: adjustments.walletCredit, cardAmount: 0, adjustments };
      } else {
        const paymentDetails = await paymentService.fetchPaymentDetails(String(paymentId));
        let orderDetails = null;
        if (paymentDetails.order_id) {
          orderDetails = await paymentService.fetchOrderDetails(paymentDetails.order_id);
          assertOrderContextMatches(orderDetails, {
            serviceType: 'bus',
            pricingRef: normalizeBlockTicketKey(blockTicketKey),
          });
        }
        const notes = orderDetails?.notes || {};
        const bookingId = String(notes.wallet_booking_id || '');
        if (!mongoose.isValidObjectId(bookingId)) throw new PaymentSecurityError('A valid Sancharie booking reference is required', 400);
        const linkedBooking = await Booking.findById(bookingId).select('providerReferenceHash status paymentStatus ticketNo pnr paymentId refundStatus failureReason totalFare promotionDiscount');
        if (linkedBooking?.status === 'confirmed' && linkedBooking.ticketNo && linkedBooking.paymentId === String(paymentId)) {
          await retryReferralRewardForBooking(linkedBooking);
          dispatchBookingConfirmationSms(linkedBooking._id);
          return res.json({ apiStatus: { success: true, message: 'SUCCESS' }, etstnumber: linkedBooking.ticketNo,
            opPNR: linkedBooking.pnr, idempotent: true });
        }
        if (linkedBooking?.status === 'failed' && linkedBooking.paymentId === String(paymentId)) {
          return res.status(409).json({ apiStatus: { success: false, code: 'BOOKING_FAILED',
            message: linkedBooking.failureReason || 'This booking already failed; any applicable refund has already been started.' },
            paymentStatus: linkedBooking.paymentStatus, refundStatus: linkedBooking.refundStatus });
        }
        if (!linkedBooking || linkedBooking.providerReferenceHash !== hashReference(String(blockTicketKey)) ||
            !['pending', 'confirmed'].includes(linkedBooking.status) ||
            !['pending', 'completed'].includes(linkedBooking.paymentStatus)) {
          throw new PaymentSecurityError('Payment does not match an active bus booking', 402);
        }
        const notesWalletAmount = toAmount(notes.wallet_amount);
        if (orderDetails && paymentDetails.status === 'captured' && paymentDetails.captured === true &&
            paymentDetails.amount === orderDetails.amount && paymentDetails.currency === 'INR' && orderDetails.currency === 'INR') {
          settlement = { bookingId, paymentId: String(paymentId), paymentOrderId: paymentDetails.order_id || '',
            paymentMethod: notesWalletAmount > 0 ? 'wallet+razorpay' : 'razorpay', walletAmount: notesWalletAmount,
            cardAmount: Number(paymentDetails.amount) / 100, cardPayment: paymentDetails };
          settlementValidated = true;
        }
        const adjustments = await getBookingAdjustments({
          bookingId: notes.wallet_booking_id,
          walletAmount: notes.wallet_amount,
          promoCode: notes.promo_code,
          promotionId: notes.promotion_id,
          blockAmount: block.requiredAmount,
          blockTicketKey,
        });
        promotionBookingId = String(notes.wallet_booking_id || '');
        appliedPromotion = adjustments;
        promotionReservation = adjustments.promotionReservation;
        referralBookingAmount = Math.max(0, toAmount(block.requiredAmount) - adjustments.promotionCredit);
        returnCouponToRedeem = adjustments.returnCouponId;
        const cardAmountRequired = Math.max(0, toAmount(block.requiredAmount) - adjustments.walletCredit - adjustments.promotionCredit);
        if (cardAmountRequired > 0) {
          assertCapturedPaymentCovers(paymentDetails, cardAmountRequired, 'bus booking');
          if (Number(paymentDetails.amount) !== Math.round(cardAmountRequired * 100)) {
            throw new PaymentSecurityError('Payment amount does not match the remaining bus fare', 402);
          }
        }
        settlement = { bookingId, paymentId: String(paymentId), paymentOrderId: paymentDetails.order_id || '',
          paymentMethod: adjustments.walletCredit > 0 ? 'wallet+razorpay' : 'razorpay',
          walletAmount: adjustments.walletCredit, cardAmount: cardAmountRequired, cardPayment: paymentDetails, adjustments };
      }
      settlementValidated = Boolean(settlement);
      assertPaymentNotConsumed(String(paymentId), { serviceType: 'bus',
        blockTicketKey: normalizeBlockTicketKey(blockTicketKey) });
    }

    if (settlement?.bookingId && mongoose.isValidObjectId(settlement.bookingId)) {
      const claimed = await Booking.findOneAndUpdate(
        { _id: settlement.bookingId, status: 'pending', providerReferenceHash: hashReference(String(blockTicketKey)),
          providerStatus: { $in: ['', 'payment_pending', 'payment_verified'] } },
        { $set: { providerStatus: 'confirming', paymentStatus: 'completed',
          paymentId: settlement.paymentId || '', paymentOrderId: settlement.paymentOrderId || '',
          paymentMethod: settlement.paymentMethod || '', failureStage: '', failureReason: '' } },
        { new: true }
      );
      if (!claimed) {
        const existing = await Booking.findById(settlement.bookingId).select('status providerStatus ticketNo pnr paymentId refundStatus failureReason paymentStatus totalFare promotionDiscount');
        if (existing?.status === 'confirmed' && existing.ticketNo) {
          await retryReferralRewardForBooking(existing);
          dispatchBookingConfirmationSms(existing._id);
          return res.json({ apiStatus: { success: true, message: 'SUCCESS' }, etstnumber: existing.ticketNo,
            opPNR: existing.pnr, idempotent: true });
        }
        if (existing && ['confirming', 'confirmation_unknown'].includes(existing.providerStatus)) {
          return res.status(202).json({ apiStatus: { success: false, code: 'BOOKING_CONFIRMATION_PENDING',
            message: 'The operator is still confirming this booking. Do not pay again.' } });
        }
        if (existing?.status === 'failed' && existing.paymentId === settlement.paymentId) {
          return res.status(409).json({ apiStatus: { success: false, code: 'BOOKING_FAILED',
            message: existing.failureReason || 'This booking already failed; any applicable refund has already been started.' },
            paymentStatus: existing.paymentStatus, refundStatus: existing.refundStatus });
        }
        throw new PaymentSecurityError('This booking attempt cannot be confirmed again. Please contact support.', 409);
      }
      bookingClaimed = true;
    }

    if (returnCouponToRedeem) {
      const reservation = await Coupon.updateOne({ _id: returnCouponToRedeem, usageCount: { $lt: 1 } }, { $inc: { usageCount: 1 } });
      if (reservation.modifiedCount !== 1) throw new PaymentSecurityError('This return offer has already been used', 409);
      returnCouponReserved = true;
    } else if (promotionReservation) {
      const Model = promotionReservation.type === 'coupon' ? Coupon : Discount;
      const now = new Date();
      const filter = { _id: promotionReservation.id, enabled: true, startDate: { $lte: now }, endDate: { $gte: now } };
      const activePromotion = await Model.findById(promotionReservation.id).select('usageLimit').lean();
      if (Number(activePromotion?.usageLimit) > 0) filter.usageCount = { $lt: Number(activePromotion.usageLimit) };
      const reservation = await Model.updateOne(filter, { $inc: { usageCount: 1 } });
      if (reservation.modifiedCount !== 1) throw new PaymentSecurityError('This promotion is no longer available', 409);
      promotionReserved = true;
    }

    providerCallStarted = true;
    const data = await makeETSRequest({
      method: 'GET',
      url: `${ETS_API_CONFIG.baseUrl}/seatBooking`,
      params: { blockTicketKey: blockTicketKey},
    });
    providerResponse = data;

    if (data.apiStatus?.success === true && !read(data, 'etstnumber', 'ETSTNumber', 'ticketNo')) {
      if (settlement?.bookingId) await updateBusBookingFromOperator({ bookingId: settlement.bookingId,
        data: {}, paymentId: settlement.paymentId, paymentOrderId: settlement.paymentOrderId,
        paymentMethod: settlement.paymentMethod,
        failure: { pending: true, paymentStatus: 'completed', reason: 'The operator accepted the booking but has not returned a ticket number yet.' } });
      return res.status(202).json({ apiStatus: { success: false, code: 'BOOKING_CONFIRMATION_PENDING',
        message: 'The operator is processing the ticket. Do not pay again; confirmation is being checked.' } });
    }

    // Log successful booking (for audit)
    if (data.apiStatus?.success && read(data, 'etstnumber', 'ETSTNumber', 'ticketNo')) {
      if (settlement?.bookingId) {
        await updateBusBookingFromOperator({ bookingId: settlement.bookingId, data,
          paymentId: settlement.paymentId, paymentOrderId: settlement.paymentOrderId,
          paymentMethod: settlement.paymentMethod, appliedPromotion });
      }
      if (mongoose.isValidObjectId(promotionBookingId)) {
        try {
          await rewardReferralForSuccessfulBooking(promotionBookingId, referralBookingAmount);
        } catch (error) {
          console.error('[ETS API] Referral commission could not be processed:', error.message);
        }
      }
      if (mongoose.isValidObjectId(promotionBookingId) && appliedPromotion?.promotionCredit > 0) {
        try {
          await Booking.updateOne({ _id: promotionBookingId }, { $set: {
            promotionCode: appliedPromotion.promotionCode || '',
            promotionName: appliedPromotion.promotionName || '',
            promotionDiscount: appliedPromotion.promotionCredit,
          } });
        } catch (error) {
          console.error('[ETS API] Could not save the applied promotion to the booking record:', error.message);
        }
      }
      if (paymentId) {
        markPaymentConsumed(String(paymentId), {
          serviceType: 'bus',
          blockTicketKey: normalizeBlockTicketKey(blockTicketKey),
        });
      }
      console.log('[ETS API] Booking confirmed:', {
        etstnumber: data.etstnumber,
        opPNR: data.opPNR,
        timestamp: new Date().toISOString(),
      });
    } else {
      // A well-formed negative supplier response means no ticket was issued,
      // so reverse both settlement legs. Network errors are treated as
      // ambiguous below and are never refunded blindly.
      if (returnCouponReserved) {
        await Coupon.updateOne({ _id: returnCouponToRedeem, usageCount: { $gt: 0 } }, { $inc: { usageCount: -1 } });
        returnCouponReserved = false;
      }
      if (promotionReserved) { await releasePromotionReservation(promotionReservation); promotionReserved = false; }
      let walletRestored = true;
      if (settlement?.walletAmount > 0) {
        try { walletRestored = await reverseWalletDebit(settlement.bookingId, settlement.walletAmount); }
        catch (restoreError) { walletRestored = false; console.error('[ETS API] Wallet reversal failed:', restoreError.message); }
      }
      let cardRefunded = cardRefundSucceeded !== false;
      let refundStatus = settlement?.walletAmount > 0 && !walletRestored ? 'wallet_refund_pending' : '';
      if (settlement?.cardAmount > 0 && settlement?.paymentId && !settlement.paymentId.startsWith('WALLET-')) {
        cardRefundAttempted = true;
        try {
          const refund = await paymentService.refundPayment(settlement.paymentId,
            Number(settlement.cardPayment.amount) / 100, { reason: 'bus_booking_failed', booking_id: settlement.bookingId });
          cardRefundSucceeded = true;
          refundStatus = refund?.status || 'processed';
        } catch (refundError) {
          cardRefundSucceeded = false;
          cardRefunded = false;
          refundStatus = 'refund_pending';
          console.error('[ETS API] Automatic card refund failed:', refundError.message);
        }
      }
      if (settlement?.bookingId) {
        await updateBusBookingFromOperator({ bookingId: settlement.bookingId, data: {},
          paymentId: settlement.paymentId, paymentOrderId: settlement.paymentOrderId,
          paymentMethod: settlement.paymentMethod, refundStatus,
          failure: { reason: data.apiStatus?.message || 'The bus operator rejected the booking',
            paymentStatus: walletRestored && cardRefunded
              ? (settlement.walletAmount > 0 || settlement.cardAmount > 0 ? 'refunded' : 'failed')
              : 'completed' } });
      }
    }
    
    res.json(data);
  } catch (error) {
    const definiteProviderRejection = Boolean(error.response && error.response.status >= 400 && error.response.status < 500);
    const providerReturnedFailure = providerResponse?.apiStatus?.success === false;
    if (providerCallStarted && settlement?.bookingId && !definiteProviderRejection && !providerReturnedFailure) {
      // A timeout or connection break can happen after the operator created a
      // ticket. Keep the attempt pending and let reconciliation/support check
      // the supplier before retrying or refunding.
      try {
        await updateBusBookingFromOperator({ bookingId: settlement.bookingId, data: {},
          paymentId: settlement.paymentId, paymentOrderId: settlement.paymentOrderId,
          paymentMethod: settlement.paymentMethod,
          failure: { pending: true, paymentStatus: 'completed', reason: 'The operator response was interrupted; confirmation is being checked.' } });
      } catch (stateError) {
        console.error('[ETS API] Could not persist pending operator confirmation:', stateError.message);
      }
      return res.status(202).json({ apiStatus: { success: false, code: 'BOOKING_CONFIRMATION_PENDING',
        message: 'Payment was received. The operator confirmation is still being checked; do not pay again.' } });
    }
    if (!settlementValidated && !providerCallStarted && req.query.paymentId) {
      // Errors before the supplier call (expired in-memory seat block, RTC
      // fare refresh failure, etc.) are safe to compensate, but only after
      // reconstructing and binding the captured payment/debit to this exact
      // persisted Sancharie booking and block reference.
      try {
        const attemptedPaymentId = String(req.query.paymentId);
        const attemptedBlockKey = String(req.query.blockTicketKey || '');
        if (attemptedPaymentId.startsWith('WALLET-')) {
          const bookingId = String(req.query.walletBookingId || '');
          const amount = toAmount(req.query.walletAmount);
          const booking = await Booking.findById(bookingId).select('userId providerReferenceHash status ticketNo pnr paymentId refundStatus paymentStatus failureReason totalFare promotionDiscount');
          if (booking?.status === 'confirmed' && booking.ticketNo && booking.paymentId === attemptedPaymentId) {
            await retryReferralRewardForBooking(booking);
            dispatchBookingConfirmationSms(booking._id);
            return res.json({ apiStatus: { success: true, message: 'SUCCESS' }, etstnumber: booking.ticketNo,
              opPNR: booking.pnr, idempotent: true });
          }
          if (booking?.status === 'failed' && booking.paymentId === attemptedPaymentId) {
            return res.status(409).json({ apiStatus: { success: false, code: 'BOOKING_FAILED',
              message: booking.failureReason || 'This booking already failed; any applicable refund has already been started.' },
              paymentStatus: booking.paymentStatus, refundStatus: booking.refundStatus });
          }
          const account = booking && amount > 0 ? await User.findOne({ _id: booking.userId, walletTransactions: { $elemMatch: {
            type: 'debit', bookingId: String(bookingId), amount,
          } } }).select('_id') : amount === 0;
          if (booking && account && booking.providerReferenceHash === hashReference(attemptedBlockKey)) {
            settlement = { bookingId, paymentId: attemptedPaymentId, paymentOrderId: '', paymentMethod: 'wallet',
              walletAmount: amount, cardAmount: 0 };
            settlementValidated = true;
          }
        } else {
          const paymentDetails = await paymentService.fetchPaymentDetails(attemptedPaymentId);
          const orderDetails = paymentDetails.order_id ? await paymentService.fetchOrderDetails(paymentDetails.order_id) : null;
          const notes = orderDetails?.notes || {};
          const bookingId = String(notes.wallet_booking_id || '');
          const booking = mongoose.isValidObjectId(bookingId)
            ? await Booking.findById(bookingId).select('providerReferenceHash status paymentStatus ticketNo pnr paymentId refundStatus failureReason totalFare promotionDiscount')
            : null;
          if (booking?.status === 'confirmed' && booking.ticketNo && booking.paymentId === attemptedPaymentId) {
            await retryReferralRewardForBooking(booking);
            dispatchBookingConfirmationSms(booking._id);
            return res.json({ apiStatus: { success: true, message: 'SUCCESS' }, etstnumber: booking.ticketNo,
              opPNR: booking.pnr, idempotent: true });
          }
          if (booking?.status === 'failed' && booking.paymentId === attemptedPaymentId) {
            return res.status(409).json({ apiStatus: { success: false, code: 'BOOKING_FAILED',
              message: booking.failureReason || 'This booking already failed; any applicable refund has already been started.' },
              paymentStatus: booking.paymentStatus, refundStatus: booking.refundStatus });
          }
          if (booking && orderDetails && notes.service_type === 'bus' &&
              notes.pricing_ref_hash === hashReference(attemptedBlockKey) &&
              booking.providerReferenceHash === hashReference(attemptedBlockKey) &&
              paymentDetails.status === 'captured' && paymentDetails.captured === true &&
              paymentDetails.amount === orderDetails.amount && paymentDetails.currency === 'INR' && orderDetails.currency === 'INR') {
            settlement = { bookingId, paymentId: attemptedPaymentId, paymentOrderId: paymentDetails.order_id,
              paymentMethod: Number(notes.wallet_amount) > 0 ? 'wallet+razorpay' : 'razorpay',
              walletAmount: toAmount(notes.wallet_amount), cardAmount: Number(paymentDetails.amount) / 100,
              cardPayment: paymentDetails };
            settlementValidated = true;
          }
        }
      } catch (recoveryError) {
        console.error('[ETS API] Could not safely reconcile pre-provider payment:', recoveryError.message);
      }
    }
    if (settlementValidated && settlement?.bookingId) {
      if (returnCouponReserved) {
        await Coupon.updateOne({ _id: returnCouponToRedeem, usageCount: { $gt: 0 } }, { $inc: { usageCount: -1 } });
      }
      if (promotionReserved) { await releasePromotionReservation(promotionReservation); promotionReserved = false; }
      let walletRestored = true;
      if (settlement.walletAmount > 0) {
        try { walletRestored = await reverseWalletDebit(settlement.bookingId, settlement.walletAmount); }
        catch (restoreError) { walletRestored = false; console.error('[ETS API] Wallet reversal failed:', restoreError.message); }
      }
      let cardRefunded = cardRefundSucceeded !== false;
      let refundStatus = settlement.walletAmount > 0 && !walletRestored ? 'wallet_refund_pending' : '';
      if (!cardRefundAttempted && settlement.cardAmount > 0 && settlement.paymentId && !settlement.paymentId.startsWith('WALLET-')) {
        cardRefundAttempted = true;
        try {
          const refund = await paymentService.refundPayment(settlement.paymentId,
            Number(settlement.cardPayment.amount) / 100, { reason: 'bus_booking_not_submitted', booking_id: settlement.bookingId });
          cardRefundSucceeded = true;
          refundStatus = refund?.status || 'processed';
        } catch (refundError) {
          cardRefundSucceeded = false;
          cardRefunded = false;
          refundStatus = 'refund_pending';
          console.error('[ETS API] Automatic card refund failed:', refundError.message);
        }
      }
      try {
        await updateBusBookingFromOperator({ bookingId: settlement.bookingId, data: {},
          paymentId: settlement.paymentId, paymentOrderId: settlement.paymentOrderId,
          paymentMethod: settlement.paymentMethod, refundStatus,
          failure: { reason: error.message || 'Booking could not be submitted to the bus operator',
            paymentStatus: walletRestored && cardRefunded
              ? (settlement.walletAmount > 0 || settlement.cardAmount > 0 ? 'refunded' : 'failed')
              : 'completed' } });
      } catch (stateError) {
        console.error('[ETS API] Could not persist failed bus booking:', stateError.message);
      }
    }
    handleApiError(error, 'Book seat', res);
  }
});

/**
 * Get booked ticket details
 * GET /ets/getTicketByETSTNumber
 * 
 * Query params: ETSTNumber (ETS ticket number)
 */
router.get('/ets/getTicketByETSTNumber', async (req, res) => {
  try {
    const { ETSTNumber } = req.query;
    
    if (!ETSTNumber) {
      return res.status(400).json({
        apiStatus: { success: false, message: 'Missing ETSTNumber parameter' }
      });
    }

    if (!isValidETSTicketNumber(ETSTNumber)) {
      return res.status(400).json({
        apiStatus: { success: false, message: 'Invalid ETS ticket number format' }
      });
    }

    const data = await makeETSRequest({
      method: 'GET',
      url: `${ETS_API_CONFIG.baseUrl}/getTicketByETSTNumber`,
      params: { ETSTNumber: ETSTNumber.toUpperCase() },
    });
    
    res.json(data);
  } catch (error) {
    handleApiError(error, 'Get ticket details', res);
  }
});

/** Admin-only recovery lookup: verify the selected Sancharie booking against ETS. */
router.get('/ets/adminTicketLookup', authenticateAdmin, requirePermission('bookings:read'), async (req, res) => {
  try {
    const bookingId = String(req.query.bookingId || '').trim();
    const ticketNo = String(req.query.ticketNo || '').trim();
    if (!mongoose.isValidObjectId(bookingId)) {
      return res.status(400).json({ success: false, message: 'A valid Sancharie booking ID is required' });
    }
    if (!isValidETSTicketNumber(ticketNo)) {
      return res.status(400).json({ success: false, message: 'Enter a valid ETS ticket number' });
    }
    const booking = await Booking.findOne({ _id: bookingId, serviceType: 'bus' }).select('ticketNo externalBookingId');
    if (!booking) return res.status(404).json({ success: false, message: 'Bus booking was not found' });
    const storedTicketNo = String(booking.ticketNo || booking.externalBookingId || '').trim();
    if (storedTicketNo && storedTicketNo.toUpperCase() !== ticketNo.toUpperCase()) {
      return res.status(403).json({ success: false, message: 'Ticket number does not match the selected booking' });
    }

    const data = await makeETSRequest({
      method: 'GET',
      url: `${ETS_API_CONFIG.baseUrl}/getTicketByETSTNumber`,
      params: { ETSTNumber: ticketNo.toUpperCase() },
    });
    await recordAdminAction(req, { action: 'verify', resource: 'bookings', resourceId: booking._id,
      summary: 'Verified a bus ticket with ETS', changes: { ticketStatus: data.ticketStatus || 'unknown' } });
    res.setHeader('Cache-Control', 'no-store');
    res.json(data);
  } catch (error) {
    handleApiError(error, 'Verify admin ticket with ETS', res);
  }
});

/**
 * Get live GPS tracking for a confirmed bus booking owned by the signed-in user.
 * GET /ets/getLiveTracking?bookingId=<Sancharie booking id>
 */
router.get('/ets/getLiveTracking', authenticateToken, async (req, res) => {
  try {
    const bookingId = String(req.query.bookingId || '').trim();
    if (!mongoose.isValidObjectId(bookingId)) {
      return res.status(400).json({ success: false, message: 'A valid booking reference is required' });
    }

    const booking = await Booking.findOne({
      _id: bookingId,
      userId: req.user.userId,
      serviceType: 'bus',
    }).select('ticketNo status paymentStatus providerStatus');

    if (!booking) return res.status(404).json({ success: false, message: 'Bus booking was not found' });
    if (booking.status !== 'confirmed' || booking.paymentStatus !== 'completed' || !booking.ticketNo) {
      return res.status(409).json({ success: false, message: 'Live tracking is available only for confirmed, paid bus tickets' });
    }

    const data = await makeETSRequest({
      method: 'GET',
      url: `${ETS_API_CONFIG.baseUrl}/getLiveTracking`,
      params: { ticketNo: booking.ticketNo },
    });

    res.setHeader('Cache-Control', 'no-store');
    res.json(data);
  } catch (error) {
    handleApiError(error, 'Get live bus tracking', res);
  }
});

/**
 * Cancel ticket confirmation (get cancellation details before actual cancel)
 * POST /ets/cancelTicketConfirmation
 * 
 * Request body:
 * - etsTicketNo: ETS ticket number
 * - seatNbrsToCancel: Array of seat numbers to cancel
 */
router.post('/ets/cancelTicketConfirmation', async (req, res) => {
  try {
    const { etsTicketNo, seatNbrsToCancel } = req.body;
    
    if (!etsTicketNo) {
      return res.status(400).json({
        apiStatus: { success: false, message: 'Missing ETS ticket number' }
      });
    }

    if (!isValidETSTicketNumber(etsTicketNo)) {
      return res.status(400).json({
        apiStatus: { success: false, message: 'Invalid ETS ticket number format' }
      });
    }

    if (!seatNbrsToCancel || !Array.isArray(seatNbrsToCancel) || seatNbrsToCancel.length === 0) {
      return res.status(400).json({
        apiStatus: { success: false, message: 'Please specify seat numbers to cancel' }
      });
    }

    // Validate seat numbers format
    const validSeatFormat = seatNbrsToCancel.every(seat => 
      typeof seat === 'string' && /^[A-Z0-9]{1,5}$/.test(seat.toUpperCase())
    );

    if (!validSeatFormat) {
      return res.status(400).json({
        apiStatus: { success: false, message: 'Invalid seat number format' }
      });
    }

    const data = await makeETSRequest({
      method: 'POST',
      url: `${ETS_API_CONFIG.baseUrl}/cancelTicketConfirmation`,
      data: {
        etsTicketNo: etsTicketNo.toUpperCase(),
        seatNbrsToCancel: seatNbrsToCancel.map(s => s.toUpperCase()),
      },
    });

    res.json(data);
  } catch (error) {
    handleApiError(error, 'Cancel ticket confirmation', res);
  }
});

/**
 * Cancel ticket (actual cancellation)
 * POST /ets/cancelTicket
 * 
 * Request body:
 * - etsTicketNo: ETS ticket number
 * - seatNbrsToCancel: Array of seat numbers to cancel
 * 
 * IMPORTANT: Call cancelTicketConfirmation first to get refund details
 */
router.post('/ets/cancelTicket', async (req, res) => {
  try {
    const { etsTicketNo, seatNbrsToCancel } = req.body;
    
    if (!etsTicketNo) {
      return res.status(400).json({
        apiStatus: { success: false, message: 'Missing ETS ticket number' }
      });
    }

    if (!isValidETSTicketNumber(etsTicketNo)) {
      return res.status(400).json({
        apiStatus: { success: false, message: 'Invalid ETS ticket number format' }
      });
    }

    if (!seatNbrsToCancel || !Array.isArray(seatNbrsToCancel) || seatNbrsToCancel.length === 0) {
      return res.status(400).json({
        apiStatus: { success: false, message: 'Please specify seat numbers to cancel' }
      });
    }

    // Validate seat numbers format
    const validSeatFormat = seatNbrsToCancel.every(seat => 
      typeof seat === 'string' && /^[A-Z0-9]{1,5}$/.test(seat.toUpperCase())
    );

    if (!validSeatFormat) {
      return res.status(400).json({
        apiStatus: { success: false, message: 'Invalid seat number format' }
      });
    }

    const data = await makeETSRequest({
      method: 'POST',
      url: `${ETS_API_CONFIG.baseUrl}/cancelTicket`,
      data: {
        etsTicketNo: etsTicketNo.toUpperCase(),
        seatNbrsToCancel: seatNbrsToCancel.map(s => s.toUpperCase()),
      },
    });

    // Log cancellation (for audit)
    if (data.apiStatus?.success) {
      const booking = await Booking.findOne({ serviceType: 'bus', ticketNo: etsTicketNo.toUpperCase() });
      if (booking) {
        const cancelledSeats = new Set(seatNbrsToCancel.map((seat) => String(seat).toUpperCase()));
        const bookedSeats = Array.isArray(booking.seats) ? booking.seats.map((seat) => String(seat).toUpperCase()) : [];
        const isFullCancellation = bookedSeats.length > 0 && bookedSeats.every((seat) => cancelledSeats.has(seat));
        booking.status = isFullCancellation ? 'cancelled' : booking.status;
        booking.refundAmount = Number(data.totalRefundAmount) || 0;
        booking.refundStatus = booking.refundAmount > 0 ? 'processing' : booking.refundStatus;
        if (!isFullCancellation && bookedSeats.length) {
          booking.seats = booking.seats.filter((seat) => !cancelledSeats.has(String(seat).toUpperCase()));
          booking.selectedSeats = booking.seats;
        }
        booking.statusHistory.push({ status: booking.status, paymentStatus: booking.paymentStatus,
          stage: 'operator_cancellation', message: `Cancellation completed for ${[...cancelledSeats].join(', ')}`.slice(0, 500), createdAt: new Date() });
        await booking.save();
      }
      console.log('[ETS API] Ticket cancelled:', {
        etsTicketNo,
        seats: seatNbrsToCancel,
        refundAmount: data.totalRefundAmount,
        timestamp: new Date().toISOString(),
      });
    }

    res.json(data);
  } catch (error) {
    handleApiError(error, 'Cancel ticket', res);
  }
});

/**
 * Get plan and balance information
 * GET /ets/getMyPlanAndBalance
 * 
 * Returns API account details including balance
 */
router.get('/ets/getMyPlanAndBalance', async (req, res) => {
  try {
    const data = await makeETSRequest({
      method: 'GET',
      url: `${ETS_API_CONFIG.baseUrl}/getMyPlanAndBalance`,
    });

    // Don't expose sensitive account details to frontend
    const safeData = {
      apiStatus: data.apiStatus,
      planName: data.planName,
      planDescription: data.planDescription,
      planNature: data.planNature,
      product: data.product,
      // Balance information
      balance: data.balance,
      creditLimit: data.creditLimit,
    };
    
    res.json(safeData);
  } catch (error) {
    handleApiError(error, 'Get plan and balance', res);
  }
});

/**
 * Health check endpoint
 * GET /ets/health
 */
router.get('/ets/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    configured: isConfigured(),
    timestamp: new Date().toISOString(),
    version: '2.1.0', // ETS Live Production Integration
    environment: process.env.NODE_ENV || 'development',
  });
});

/**
 * Get boarding point configuration info
 * GET /ets/boardingPointInfo
 * 
 * Helper endpoint to understand boarding point logic per ETS documentation
 * Reference: http://partners.etravelsmart.com/bus/busApi.htm
 */
router.get('/ets/boardingPointInfo', (req, res) => {
  res.json({
    apiStatus: { success: true, message: 'Boarding point configuration info' },
    config: {
      inventoryTypes: {
        '0': {
          source: 'getAvailableBuses',
          description: 'Use boarding/dropping points from search results',
          action: 'Fetch from getAvailableBuses response directly',
        },
        '1': {
          source: 'getAvailableBuses',
          description: 'Use boarding/dropping points from search results. Time may be null in layout.',
          note: 'For complete boarding name with landmarks, map using boardingId from both responses',
          action: 'Use search results for time; optionally map with layout for landmarks using boardingId',
        },
        '2': {
          source: 'getBusLayout',
          description: 'Use boarding/dropping points from bus layout response',
          action: 'MUST call getBusLayout to get boarding/dropping points',
        },
        '3': {
          source: 'getBusLayout',
          description: 'Use boarding/dropping points from bus layout response',
          action: 'MUST call getBusLayout to get boarding/dropping points',
        },
        '5': {
          source: 'getBusLayout',
          description: 'Use boarding/dropping points from bus layout response',
          action: 'MUST call getBusLayout to get boarding/dropping points',
        },
        '6': {
          source: 'getBusLayout',
          description: 'MSRTC buses - Use boarding/dropping points from bus layout response',
          action: 'MUST call getBusLayout to get boarding/dropping points (MSRTC specific)',
        },
      },
      importantNotes: [
        'If dropping points are null, use destination city as dropping point',
        'For ladies seats, passenger sex must be F and title must be Mrs/Ms',
        'ID proof fields (idType, idNumber) are always required, even if empty',
        'One passenger must be marked as primary: true',
        'Valid idType values: PAN_CARD, VOTER_CARD, PASSPORT, DRIVING_LICENCE, RATION_CARD, AADHAR',
        'For RTC services (isRTC: true), call getRtcUpdatedFare after blockTicket and before seatBooking',
      ],
      bookingFlow: [
        '1. Search buses using getAvailableBuses',
        '2. Get seat layout using getBusLayout',
        '3. Block seats using blockTicket (10 min hold)',
        '4. For RTC buses: Call getRtcUpdatedFare',
        '5. Complete booking using seatBooking',
      ],
      cancellationFlow: [
        '1. Call cancelTicketConfirmation to get refund details',
        '2. Confirm with user about refund amount',
        '3. Call cancelTicket to execute cancellation',
      ],
    },
  });
});

module.exports = router;
module.exports._test = {
  getSeatFareAmount,
  stampProviderSeatFares,
  calculateReferralRewards,
};
