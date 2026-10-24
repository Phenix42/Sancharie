/**
 * User Routes - Profile management and bookings
 * 
 * SECURITY:
 * - All routes requiring authentication use JWT verification
 * - JWT_SECRET must be configured in environment variables
 * - Never store sensitive data in JWT payload
 */

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const WalletPromotion = require('../models/WalletPromotion');
const Booking = require('../models/Booking');
const Referral = require('../models/Referral');
const { hashReference } = require('../services/paymentSecurity');
const { reconcileUserBookings } = require('../services/bookingReconciliationService');
const { ApplicationSettings } = require('../models/AdminResources');
const PushSubscription = require('../models/PushSubscription');
const pushNotifications = require('../services/pushNotifications');

const BOOKING_STATUSES = ['confirmed', 'cancelled', 'pending', 'completed', 'failed'];
const PAYMENT_STATUSES = ['pending', 'completed', 'failed', 'refunded'];
const SERVICE_TYPES = ['bus', 'flight', 'hotel'];

const cleanText = (value, maxLength = 500) => String(value || '').trim().slice(0, maxLength);
const newReferralCode = () => `SAN${crypto.randomBytes(5).toString('hex').toUpperCase()}`;

const cleanSeatCoordinate = (value) => {
  const coordinate = Number(value);
  return Number.isFinite(coordinate) && coordinate >= 0
    ? Math.min(100, Math.floor(coordinate))
    : null;
};

const sanitizeSeatDetails = (seatDetails) => (Array.isArray(seatDetails) ? seatDetails : [])
  .slice(0, 16)
  .map((seat) => ({
    seatNumber: cleanText(seat?.seatNumber || seat?.seatName || seat?.id, 50),
    row: cleanSeatCoordinate(seat?.row ?? seat?.rowNo),
    column: cleanSeatCoordinate(seat?.column ?? seat?.columnNo),
    zIndex: Number(seat?.zIndex) === 1 ? 1 : 0,
  }))
  .filter((seat) => seat.seatNumber);

const cleanSeatSpan = (value) => {
  const span = Number(value);
  return Number.isFinite(span) && span >= 1
    ? Math.min(4, Math.floor(span))
    : 1;
};

const sanitizeSeatLayout = (seatLayout) => (Array.isArray(seatLayout) ? seatLayout : [])
  .slice(0, 120)
  .map((seat) => ({
    seatNumber: cleanText(seat?.seatNumber || seat?.seatName || seat?.id, 50),
    row: cleanSeatCoordinate(seat?.row ?? seat?.rowNo),
    column: cleanSeatCoordinate(seat?.column ?? seat?.columnNo),
    zIndex: Number(seat?.zIndex) === 1 ? 1 : 0,
    length: cleanSeatSpan(seat?.length),
    width: cleanSeatSpan(seat?.width),
    sleeper: seat?.sleeper === true,
    available: seat?.available === true,
    ladiesSeat: seat?.ladiesSeat === true,
    malesSeat: seat?.malesSeat === true,
    reservedForSocialDistancing: seat?.reservedForSocialDistancing === true,
  }))
  .filter((seat) => seat.seatNumber && seat.row !== null && seat.column !== null);

const parseJourneyDate = (value) => {
  const text = cleanText(value, 100);
  const dayFirstMatch = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\D|$)/);

  if (dayFirstMatch) {
    const [, day, month, year] = dayFirstMatch;
    const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    if (parsed.getUTCFullYear() === Number(year) &&
        parsed.getUTCMonth() === Number(month) - 1 &&
        parsed.getUTCDate() === Number(day)) return parsed;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const serializeBooking = (booking) => ({
  id: booking._id,
  bookingId: booking.bookingId,
  clientReference: booking.clientReference,
  serviceType: booking.serviceType,
  pnr: booking.pnr,
  ticketNo: booking.ticketNo,
  externalBookingId: booking.externalBookingId,
  busName: booking.busName,
  busType: booking.busType,
  busNumber: booking.busNumber,
  source: booking.source,
  destination: booking.destination,
  fromCity: booking.fromCity || booking.source,
  toCity: booking.toCity || booking.destination,
  journeyDate: booking.journeyDate,
  departureTime: booking.departureTime,
  arrivalTime: booking.arrivalTime,
  boardingPoint: booking.boardingPoint,
  droppingPoint: booking.droppingPoint,
  seats: booking.seats,
  selectedSeats: booking.selectedSeats?.length ? booking.selectedSeats : booking.seats,
  seatDetails: booking.seatDetails || [],
  seatLayout: booking.seatLayout || [],
  hasUpperDeck: booking.hasUpperDeck === true,
  passengers: booking.passengers,
  baseFare: booking.baseFare,
  serviceTax: booking.serviceTax,
  totalFare: booking.totalFare,
  status: booking.status,
  providerStatus: booking.providerStatus,
  failureStage: booking.failureStage,
  failureReason: booking.failureReason,
  statusHistory: booking.statusHistory,
  paymentStatus: booking.paymentStatus,
  paymentId: booking.paymentId,
  paymentOrderId: booking.paymentOrderId,
  relatedPaymentIds: booking.relatedPaymentIds,
  paymentIssue: booking.paymentIssue,
  paymentNote: booking.paymentNote,
  paymentMethod: booking.paymentMethod,
  cancellationReason: booking.cancellationReason,
  refundAmount: booking.refundAmount,
  refundStatus: booking.refundStatus,
  confirmedAt: booking.confirmedAt,
  failedAt: booking.failedAt,
  reconciliationSource: booking.reconciliationSource,
  lastReconciledAt: booking.lastReconciledAt,
  createdAt: booking.createdAt,
  updatedAt: booking.updatedAt
});

// ============================================
// SECURITY: JWT Configuration
// ============================================
// NEVER use fallback secrets in production
const JWT_SECRET = process.env.JWT_SECRET;

// Validate JWT_SECRET is configured
if (!JWT_SECRET) {
  console.error('❌ SECURITY ERROR: JWT_SECRET not configured in environment variables!');
  console.error('   Set JWT_SECRET in .env file before starting the server.');
}

/**
 * Middleware to verify JWT token
 * SECURITY: Validates token and attaches user to request
 */
const authenticateToken = (req, res, next) => {
  // Check if JWT_SECRET is configured
  if (!JWT_SECRET) {
    console.error('Authentication failed: JWT_SECRET not configured');
    return res.status(500).json({ 
      success: false, 
      message: 'Server configuration error' 
    });
  }

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, async (err, user) => {
    if (err) {
      // SECURITY: Don't reveal specific error details
      return res.status(403).json({ success: false, message: 'Invalid or expired token' });
    }
    try {
      const account = await User.findById(user.userId).select('accountActive');
      if (!account || account.accountActive === false) {
        return res.status(401).json({ success: false, message: 'User account is unavailable' });
      }
      req.user = user;
      next();
    } catch (error) {
      next(error);
    }
  });
};

router.get('/push/public-key', (req, res) => {
  if (!pushNotifications.isConfigured()) return res.status(503).json({ success: false, message: 'Push notifications are not configured' });
  res.set('Cache-Control', 'public, max-age=3600');
  res.json({ success: true, publicKey: pushNotifications.publicKey });
});

router.post('/push/subscriptions', authenticateToken, async (req, res, next) => {
  try {
    const subscription = req.body?.subscription;
    const endpoint = String(subscription?.endpoint || '');
    const p256dh = String(subscription?.keys?.p256dh || '');
    const auth = String(subscription?.keys?.auth || '');
    if (!pushNotifications.isConfigured()) return res.status(503).json({ success: false, message: 'Push notifications are not configured' });
    if (!/^https:\/\//.test(endpoint) || endpoint.length > 2048 || p256dh.length < 20 || auth.length < 10) {
      return res.status(400).json({ success: false, message: 'Invalid browser push subscription' });
    }
    await PushSubscription.findOneAndUpdate({ endpoint }, {
      $set: { userId: req.user.userId, endpoint, keys: { p256dh, auth }, expirationTime: subscription.expirationTime || null },
    }, { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true });
    res.json({ success: true, message: 'Push notifications enabled' });
  } catch (error) { next(error); }
});

router.delete('/push/subscriptions', authenticateToken, async (req, res, next) => {
  try {
    const endpoint = String(req.body?.endpoint || '');
    if (!endpoint || endpoint.length > 2048) return res.status(400).json({ success: false, message: 'Valid push endpoint required' });
    await PushSubscription.deleteOne({ userId: req.user.userId, endpoint });
    res.json({ success: true, message: 'Push notifications disabled' });
  } catch (error) { next(error); }
});

router.get('/referrals/me', authenticateToken, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId).select('referralCode');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (!user.referralCode) { user.referralCode = newReferralCode(); await user.save(); }
    const [invited, qualified] = await Promise.all([
      Referral.countDocuments({ referrerUserId: user._id }),
      Referral.countDocuments({ referrerUserId: user._id, status: { $in: ['qualified', 'rewarded'] } }),
    ]);
    res.json({ success: true, code: user.referralCode, invited, qualified });
  } catch (error) { next(error); }
});

/**
 * POST /user/login-complete
 * Called after OTP verification to create/get user and generate JWT
 * 
 * SECURITY:
 * - Only called after successful OTP verification
 * - JWT includes only non-sensitive user identifiers
 * - Token expiry set to limit exposure window
 */
router.post('/login-complete', async (req, res) => {
  try {
    // Check if JWT_SECRET is configured
    if (!JWT_SECRET) {
      console.error('Login failed: JWT_SECRET not configured');
      return res.status(500).json({ 
        success: false, 
        message: 'Server configuration error' 
      });
    }

    const { phone } = req.body;
    const requestedReferralCode = cleanText(req.body?.referralCode, 20).toUpperCase();

    if (!phone) {
      return res.status(400).json({ success: false, message: 'Phone number required' });
    }

    // Validate phone format
    if (!/^[6-9]\d{9}$/.test(phone)) {
      return res.status(400).json({ success: false, message: 'Invalid phone number format' });
    }

    // Find or create user
    let user = await User.findOne({ phone });
    let isNewUser = false;

    if (!user) {
      const settings = await ApplicationSettings.findOne({ key: 'global' }).select('registrationEnabled maintenanceMode').lean();
      if (settings?.maintenanceMode || settings?.registrationEnabled === false) {
        return res.status(403).json({ success: false, message: 'New account registration is temporarily unavailable' });
      }
      // Create new user
      try {
        let referrer = null;
        if (/^SAN[A-F0-9]{10}$/.test(requestedReferralCode)) {
          referrer = await User.findOne({ referralCode: requestedReferralCode, accountActive: true }).select('_id phone');
          if (referrer?.phone === phone) referrer = null;
        }
        user = new User({ phone, referralCode: newReferralCode(), referredBy: referrer?._id || null });
        await user.save();
        if (referrer) await Referral.create({ referrerUserId: referrer._id, referredUserId: user._id, code: requestedReferralCode });
        isNewUser = true;
        console.log(`✅ New user created: ${phone}`);
      } catch (saveError) {
        // Handle duplicate key error (race condition)
        if (saveError.code === 11000) {
          user = await User.findOne({ phone });
          if (!user) {
            throw saveError;
          }
          console.log(`✅ User found after race condition: ${phone}`);
        } else {
          throw saveError;
        }
      }
    } else {
      if (!user.accountActive) {
        return res.status(403).json({ success: false, message: 'This account is currently disabled' });
      }
      // Update last login
      user.lastLogin = new Date();
      if (!user.referralCode) user.referralCode = newReferralCode();
      await user.save();
      console.log(`✅ User logged in: ${phone}`);
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, phone: user.phone },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      message: isNewUser ? 'Account created successfully' : 'Login successful',
      isNewUser,
      isProfileComplete: user.isProfileComplete,
      token,
      user: {
        id: user._id,
        phone: user.phone,
        name: user.name,
        email: user.email,
        age: user.age,
        gender: user.gender,
        isProfileComplete: user.isProfileComplete
      }
    });
  } catch (error) {
    console.error('Login complete error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /user/profile
 * Get user profile (requires auth)
 */
router.get('/wallet', authenticateToken, async (req, res) => {
  try {
    const [account, promotion] = await Promise.all([
      User.findById(req.user.userId).select('walletBalance walletTransactions walletMinimumBookingAmount walletPromotionClaims'),
      WalletPromotion.findOne({ enabled: true }).sort({ createdAt: -1 }).select('rewardAmount minimumBookingAmount recipientLimit claimedCount _id'),
    ]);
    if (!account) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, balance: account.walletBalance || 0, minimumBookingAmount: account.walletMinimumBookingAmount || 0, transactions: (account.walletTransactions || []).slice(-50).reverse(), promotion: promotion ? { rewardAmount: promotion.rewardAmount, minimumBookingAmount: promotion.minimumBookingAmount, recipientLimit: promotion.recipientLimit, claimedCount: promotion.claimedCount, available: promotion.claimedCount < promotion.recipientLimit, claimed: account.walletPromotionClaims?.includes(String(promotion._id)) || false } : null });
  } catch (error) {
    console.error('Get wallet error:', error);
    res.status(500).json({ success: false, message: 'Could not load your wallet' });
  }
});

router.post('/wallet/promotion/claim', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const promotion = await WalletPromotion.findOneAndUpdate(
      { enabled: true, claimedUserIds: { $ne: userId }, $expr: { $lt: ['$claimedCount', '$recipientLimit'] } },
      { $inc: { claimedCount: 1 }, $addToSet: { claimedUserIds: userId } },
      { new: true, sort: { createdAt: -1 } }
    );

    if (!promotion) {
      const [account, current] = await Promise.all([
        User.findById(userId).select('walletBalance walletMinimumBookingAmount walletPromotionClaims'),
        WalletPromotion.findOne({ enabled: true }).sort({ createdAt: -1 }).select('_id recipientLimit claimedCount'),
      ]);
      if (!account) return res.status(404).json({ success: false, message: 'User not found' });
      const alreadyClaimedPromotion = current ? account.walletPromotionClaims?.includes(String(current._id)) : false;
      return res.json({ success: true, claimed: false, alreadyClaimed: alreadyClaimedPromotion, exhausted: Boolean(current && current.claimedCount >= current.recipientLimit), balance: account.walletBalance || 0, minimumBookingAmount: account.walletMinimumBookingAmount || 0 });
    }

    const promotionId = String(promotion._id);
    const account = await User.findOneAndUpdate(
      { _id: userId, walletPromotionClaims: { $ne: promotionId } },
      { $inc: { walletBalance: promotion.rewardAmount }, $max: { walletMinimumBookingAmount: promotion.minimumBookingAmount }, $addToSet: { walletPromotionClaims: promotionId }, $push: { walletTransactions: { $each: [{ type: 'promotion_credit', amount: promotion.rewardAmount, promotionId, minimumBookingAmount: promotion.minimumBookingAmount, description: 'Wallet welcome bonus', createdAt: new Date() }], $slice: -100 } } },
      { new: true, projection: { walletBalance: 1, walletMinimumBookingAmount: 1, walletTransactions: { $slice: -50 } } }
    );
    if (!account) return res.status(404).json({ success: false, message: 'Customer account could not be updated' });
    res.json({ success: true, claimed: true, balance: account.walletBalance, minimumBookingAmount: account.walletMinimumBookingAmount, rewardAmount: promotion.rewardAmount, transactions: (account.walletTransactions || []).slice(-50).reverse() });
  } catch (error) {
    console.error('Wallet promotion claim error:', error.message);
    res.status(500).json({ success: false, message: 'Could not claim the wallet promotion' });
  }
});

router.post('/wallet/top-up-order', authenticateToken, async (req, res) => {
  try {
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount < 100 || amount > 50000 || Math.round(amount * 100) !== amount * 100) {
      return res.status(400).json({ success: false, message: 'Add an amount between ₹100 and ₹50,000' });
    }
    const paymentService = require('../services/paymentService');
    if (!paymentService.isConfigured()) return res.status(503).json({ success: false, message: 'Payment service is not configured' });
    const order = await paymentService.createOrder(amount, 'INR', undefined, { purpose: 'wallet_topup', user_id: String(req.user.userId) });
    res.json({ success: true, order: { id: order.id, amount: order.amount, currency: order.currency }, keyId: paymentService.getPublicKeyId() });
  } catch (error) {
    console.error('Wallet top-up order error:', error.message);
    res.status(500).json({ success: false, message: 'Could not start wallet top-up' });
  }
});

router.post('/wallet/debit', authenticateToken, async (req, res) => {
  try {
    const amount = Number(req.body?.amount);
    const bookingId = cleanText(req.body?.bookingId, 100);
    const description = cleanText(req.body?.description || 'Wallet payment', 200);
    const requestId = cleanText(req.body?.requestId, 100);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 500000 || Math.round(amount * 100) !== amount * 100) {
      return res.status(400).json({ success: false, message: 'Amount must be between ₹0.01 and ₹500,000 with at most two decimal places' });
    }
    if (!mongoose.isValidObjectId(bookingId)) return res.status(400).json({ success: false, message: 'A valid pending bookingId is required' });
    if (!/^[A-Za-z0-9._:-]{8,100}$/.test(requestId)) return res.status(400).json({ success: false, message: 'A unique requestId (8–100 letters, numbers, dots, underscores, colons or hyphens) is required' });
    const previousAccount = await User.findById(req.user.userId).select('walletBalance walletTransactions walletProcessedDebits');
    if (!previousAccount) return res.status(404).json({ success: false, message: 'User not found' });
    if (previousAccount.walletProcessedDebits?.includes(requestId)) {
      const previousTransaction = previousAccount.walletTransactions?.find((item) => item.requestId === requestId);
      if (previousTransaction && (previousTransaction.amount !== amount || String(previousTransaction.bookingId) !== bookingId)) {
        return res.status(409).json({ success: false, message: 'requestId was already used for a different wallet debit' });
      }
      return res.json({ success: true, idempotent: true, balance: previousAccount.walletBalance || 0, transaction: previousTransaction || null });
    }
    const booking = await Booking.findOne({ _id: bookingId, userId: req.user.userId }).select('bookingId totalFare status paymentStatus');
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (booking.status !== 'pending' || booking.paymentStatus !== 'pending') return res.status(409).json({ success: false, message: 'Wallet debit is only available for an unpaid pending booking' });
    if (amount > Number(booking.totalFare || 0)) return res.status(400).json({ success: false, message: 'Wallet debit cannot exceed the booking amount' });
    const reference = `booking_${booking.bookingId}`;
    const accountRules = await User.findById(req.user.userId).select('walletMinimumBookingAmount');
    const minimumBookingAmount = accountRules?.walletMinimumBookingAmount || 0;
    if (minimumBookingAmount > 0 && Number(booking.totalFare || 0) < minimumBookingAmount) {
      return res.status(409).json({ success: false, code: 'MINIMUM_BOOKING_NOT_MET', minimumBookingAmount, message: `Wallet use requires a booking of at least ₹${minimumBookingAmount}` });
    }

    const transaction = { requestId, type: 'debit', amount, reference, bookingId: String(booking._id), bookingAmount: booking.totalFare, description, createdAt: new Date() };
    const account = await User.findOneAndUpdate(
      { _id: req.user.userId, walletProcessedDebits: { $ne: requestId }, $expr: { $gte: [{ $ifNull: ['$walletBalance', 0] }, amount] } },
      { $inc: { walletBalance: -amount }, $addToSet: { walletProcessedDebits: requestId }, $push: { walletTransactions: { $each: [transaction], $slice: -100 } } },
      { new: true, projection: { walletBalance: 1, walletTransactions: { $slice: -50 } } }
    );
    if (!account) {
      const existing = await User.findById(req.user.userId).select('walletBalance walletTransactions walletProcessedDebits');
      if (!existing) return res.status(404).json({ success: false, message: 'User not found' });
      if (existing.walletProcessedDebits?.includes(requestId)) return res.json({ success: true, idempotent: true, balance: existing.walletBalance || 0, transaction: existing.walletTransactions?.find((item) => item.requestId === requestId) || null });
      return res.status(409).json({ success: false, message: 'Insufficient wallet balance' });
    }
    res.json({ success: true, idempotent: false, balance: account.walletBalance, transaction: account.walletTransactions?.slice(-1)[0] });
  } catch (error) {
    console.error('Wallet debit error:', error.message);
    res.status(500).json({ success: false, message: 'Could not debit your wallet' });
  }
});

router.post('/wallet/restore-debit', authenticateToken, async (req, res) => {
  try {
    const requestId = cleanText(req.body?.requestId, 100);
    if (!/^[A-Za-z0-9._:-]{8,100}$/.test(requestId)) return res.status(400).json({ success: false, message: 'A valid wallet debit requestId is required' });
    const bookingId = requestId.startsWith('wallet-') ? requestId.slice('wallet-'.length) : '';
    if (!mongoose.isValidObjectId(bookingId)) return res.status(400).json({ success: false, message: 'Wallet debit reference is invalid' });
    const booking = await Booking.findOne({ _id: bookingId, userId: req.user.userId }).select('bookingId status paymentStatus');
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (booking.status !== 'pending' || booking.paymentStatus !== 'pending') return res.status(409).json({ success: false, message: 'Wallet funds can only be restored before payment is completed' });

    const refundKey = `refund-${requestId}`;
    const account = await User.findById(req.user.userId).select('walletBalance walletTransactions walletProcessedAdjustments');
    if (!account) return res.status(404).json({ success: false, message: 'User not found' });
    if (account.walletProcessedAdjustments?.includes(refundKey)) return res.json({ success: true, idempotent: true, balance: account.walletBalance || 0 });
    const debit = account.walletTransactions?.find((transaction) => transaction.requestId === requestId && transaction.type === 'debit' && String(transaction.bookingId) === bookingId);
    if (!debit) return res.status(404).json({ success: false, message: 'Wallet debit not found' });

    const restored = await User.findOneAndUpdate(
      { _id: req.user.userId, walletProcessedAdjustments: { $ne: refundKey } },
      { $inc: { walletBalance: debit.amount }, $addToSet: { walletProcessedAdjustments: refundKey }, $push: { walletTransactions: { $each: [{ type: 'credit', amount: debit.amount, requestId: refundKey, bookingId, description: 'Wallet payment reversed', createdAt: new Date() }], $slice: -100 } } },
      { new: true, projection: { walletBalance: 1 } }
    );
    if (!restored) return res.status(409).json({ success: false, message: 'Wallet debit was already restored' });
    return res.json({ success: true, balance: restored.walletBalance });
  } catch (error) {
    console.error('Wallet debit restore error:', error.message);
    return res.status(500).json({ success: false, message: 'Could not restore wallet funds' });
  }
});

router.post('/wallet/credit', authenticateToken, async (req, res) => {
  try {
    const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body;
    const paymentService = require('../services/paymentService');
    if (!paymentService.verifyPaymentSignature(orderId, paymentId, signature)) {
      return res.status(400).json({ success: false, message: 'Payment verification failed' });
    }
    const [order, paid] = await Promise.all([
      paymentService.fetchOrderDetails(orderId),
      paymentService.fetchPaymentDetails(paymentId),
    ]);
    if (order.notes?.purpose !== 'wallet_topup' || order.notes?.user_id !== String(req.user.userId) ||
        order.currency !== 'INR' || paid.order_id !== orderId || paid.status !== 'captured' || paid.captured !== true ||
        paid.amount !== order.amount || order.amount < 10000 || order.amount > 5000000) {
      return res.status(400).json({ success: false, message: 'Payment does not match this wallet top-up' });
    }
    const amount = order.amount / 100;
    const account = await User.findOneAndUpdate(
      { _id: req.user.userId, walletProcessedOrders: { $ne: orderId } },
      { $inc: { walletBalance: amount }, $addToSet: { walletProcessedOrders: orderId }, $push: { walletTransactions: { $each: [{ type: 'credit', amount, orderId, paymentId, description: 'Wallet top-up', createdAt: new Date() }], $slice: -100 } } },
      { new: true, projection: { walletBalance: 1, walletTransactions: { $slice: -50 } } }
    );
    if (!account) {
      const existing = await User.findById(req.user.userId).select('walletBalance walletTransactions walletProcessedOrders');
      if (existing?.walletProcessedOrders?.includes(orderId)) return res.json({ success: true, balance: existing.walletBalance, transactions: (existing.walletTransactions || []).slice(-50).reverse() });
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, balance: account.walletBalance, transactions: (account.walletTransactions || []).slice(-50).reverse() });
  } catch (error) {
    console.error('Wallet credit error:', error.message);
    res.status(500).json({ success: false, message: 'Could not credit your wallet' });
  }
});

router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        phone: user.phone,
        name: user.name,
        email: user.email,
        age: user.age,
        gender: user.gender,
        isProfileComplete: user.isProfileComplete,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * PUT /user/profile
 * Update user profile (requires auth)
 */
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { name, email, age, gender } = req.body;
    
    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Update fields
    if (name) user.name = name;
    if (email) user.email = email;
    if (age) user.age = parseInt(age);
    if (gender) user.gender = gender;

    // Check if profile is complete
    user.isProfileComplete = user.checkProfileComplete();

    await user.save();

    console.log(`✅ Profile updated for: ${user.phone}`);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        phone: user.phone,
        name: user.name,
        email: user.email,
        age: user.age,
        gender: user.gender,
        isProfileComplete: user.isProfileComplete
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /user/bookings
 * Get user's bookings (requires auth)
 */
router.get('/bookings', authenticateToken, async (req, res) => {
  try {
    const bookings = await Booking.find({ userId: req.user.userId })
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      bookings: bookings.map(serializeBooking)
    });
  } catch (error) {
    console.error('Get bookings error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * POST /user/bookings
 * Create a new booking (requires auth)
 */
router.post('/bookings', authenticateToken, async (req, res) => {
  try {
    const {
      clientReference, serviceType, type,
      providerReference,
      busName, busType, busNumber,
      source, destination, fromCity, toCity,
      journeyDate, departureTime, arrivalTime,
      boardingPoint, droppingPoint,
      seats, selectedSeats, seatDetails, seatLayout, hasUpperDeck, passengers,
      baseFare, serviceTax, totalFare,
      paymentId, paymentOrderId, paymentStatus, paymentMethod,
      externalBookingId, ticketNo, pnr,
      status, providerStatus, failureStage, failureReason
    } = req.body;

    const normalizedClientReference = cleanText(clientReference, 100);
    if (normalizedClientReference) {
      const existingBooking = await Booking.findOne({
        userId: req.user.userId,
        clientReference: normalizedClientReference
      });

      if (existingBooking) {
        return res.json({
          success: true,
          duplicate: true,
          message: 'Booking attempt already exists',
          booking: serializeBooking(existingBooking)
        });
      }
    }

    const parsedJourneyDate = parseJourneyDate(journeyDate);
    const requiredTextFields = { busName, busType, source, destination };
    const missingFields = Object.entries(requiredTextFields)
      .filter(([, value]) => !cleanText(value, 250))
      .map(([field]) => field);
    const parsedBaseFare = Number(baseFare);
    const parsedTotalFare = Number(totalFare);

    if (missingFields.length || !parsedJourneyDate ||
        !Number.isFinite(parsedBaseFare) || !Number.isFinite(parsedTotalFare) ||
        parsedBaseFare < 0 || parsedTotalFare < 0) {
      return res.status(400).json({
        success: false,
        message: 'Complete and valid booking details are required',
        fields: missingFields
      });
    }

    const normalizedStatus = BOOKING_STATUSES.includes(String(status).toLowerCase())
      ? String(status).toLowerCase()
      : 'confirmed';
    const normalizedPaymentStatus = PAYMENT_STATUSES.includes(String(paymentStatus).toLowerCase())
      ? String(paymentStatus).toLowerCase()
      : 'completed';
    const normalizedSeatDetails = sanitizeSeatDetails(seatDetails);
    const normalizedSeatLayout = sanitizeSeatLayout(seatLayout);
    const requestedServiceType = String(serviceType || type || 'bus').toLowerCase();
    const normalizedServiceType = SERVICE_TYPES.includes(requestedServiceType)
      ? requestedServiceType
      : 'bus';

    const booking = new Booking({
      userId: req.user.userId,
      userPhone: req.user.phone,
      ...(normalizedClientReference ? { clientReference: normalizedClientReference } : {}),
      serviceType: normalizedServiceType,
      providerReferenceHash: providerReference ? hashReference(cleanText(providerReference, 500)) : '',
      busName: cleanText(busName, 250),
      busType: cleanText(busType, 100),
      busNumber: cleanText(busNumber, 100),
      source: cleanText(source, 250),
      destination: cleanText(destination, 250),
      fromCity: cleanText(fromCity || source, 250),
      toCity: cleanText(toCity || destination, 250),
      journeyDate: parsedJourneyDate,
      departureTime: cleanText(departureTime, 100),
      arrivalTime: cleanText(arrivalTime, 100),
      boardingPoint,
      droppingPoint,
      seats: seats || selectedSeats,
      selectedSeats: selectedSeats || seats,
      seatDetails: normalizedSeatDetails,
      seatLayout: normalizedSeatLayout,
      hasUpperDeck: hasUpperDeck === true ||
        normalizedSeatLayout.some((seat) => seat.zIndex === 1) ||
        normalizedSeatDetails.some((seat) => seat.zIndex === 1),
      passengers,
      baseFare: parsedBaseFare,
      serviceTax: Number(serviceTax) || 0,
      totalFare: parsedTotalFare,
      paymentId: cleanText(paymentId, 150),
      paymentOrderId: cleanText(paymentOrderId, 150),
      paymentStatus: normalizedPaymentStatus,
      paymentMethod: cleanText(paymentMethod, 100),
      externalBookingId: cleanText(externalBookingId, 200),
      ticketNo: cleanText(ticketNo, 200),
      pnr: cleanText(pnr, 200),
      status: normalizedStatus,
      providerStatus: cleanText(providerStatus, 100),
      failureStage: normalizedStatus === 'failed' ? cleanText(failureStage, 100) : '',
      failureReason: normalizedStatus === 'failed' ? cleanText(failureReason) : '',
      confirmedAt: normalizedStatus === 'confirmed' ? new Date() : undefined,
      failedAt: normalizedStatus === 'failed' ? new Date() : undefined,
      statusHistory: [{
        status: normalizedStatus,
        paymentStatus: normalizedPaymentStatus,
        stage: cleanText(failureStage || (normalizedStatus === 'confirmed' ? 'confirmed' : 'created'), 100),
        message: normalizedStatus === 'failed' ? cleanText(failureReason) : ''
      }]
    });

    await booking.save();

    console.log(`✅ Booking created: ${booking.bookingId} for ${req.user.phone}`);

    res.json({
      success: true,
      message: 'Booking created successfully',
      booking: serializeBooking(booking)
    });
  } catch (error) {
    if (error.code === 11000 && req.body.clientReference) {
      const existingBooking = await Booking.findOne({
        userId: req.user.userId,
        clientReference: cleanText(req.body.clientReference, 100)
      });
      if (existingBooking) {
        return res.json({
          success: true,
          duplicate: true,
          message: 'Booking attempt already exists',
          booking: serializeBooking(existingBooking)
        });
      }
    }
    console.error('Create booking error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * POST /user/bookings/reconcile
 * Recover provider-issued tickets and captured-payment failures into MongoDB.
 * The service matches only payments belonging to the authenticated customer.
 */
router.post('/bookings/reconcile', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const reconciliation = await reconcileUserBookings(user);
    const bookings = await Booking.find({ userId: user._id }).sort({ createdAt: -1 });
    res.json({
      success: true,
      message: 'Bookings reconciled successfully',
      reconciliation,
      bookings: bookings.map(serializeBooking),
    });
  } catch (error) {
    console.error('Booking reconciliation error:', error.message);
    res.status(502).json({
      success: false,
      message: 'Provider reconciliation is temporarily unavailable. Saved bookings are still available.',
    });
  }
});

/**
 * GET /user/bookings/:id
 * Get specific booking details (requires auth)
 */
router.get('/bookings/:id', authenticateToken, async (req, res) => {
  try {
    const booking = await Booking.findOne({
      _id: req.params.id,
      userId: req.user.userId
    });

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    res.json({
      success: true,
      booking
    });
  } catch (error) {
    console.error('Get booking error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * PUT /user/bookings/:id
 * Update booking (e.g. status after cancellation)
 */
router.put('/bookings/:id', authenticateToken, async (req, res) => {
  try {
    const booking = await Booking.findOne({
      _id: req.params.id,
      userId: req.user.userId
    });

  if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    const previousBookingState = {
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      refundStatus: booking.refundStatus,
    };
    const {
      status, paymentStatus, paymentId, paymentOrderId, paymentMethod,
      externalBookingId, ticketNo, pnr, providerStatus,
      failureStage, failureReason,
      refundAmount, refundStatus, cancellationReason
    } = req.body;

    const normalizedStatus = String(status || '').toLowerCase();
    const normalizedPaymentStatus = String(paymentStatus || '').toLowerCase();

    if (BOOKING_STATUSES.includes(normalizedStatus)) booking.status = normalizedStatus;
    if (PAYMENT_STATUSES.includes(normalizedPaymentStatus)) booking.paymentStatus = normalizedPaymentStatus;
    if (paymentId !== undefined) booking.paymentId = cleanText(paymentId, 150);
    if (paymentOrderId !== undefined) booking.paymentOrderId = cleanText(paymentOrderId, 150);
    if (paymentMethod !== undefined) booking.paymentMethod = cleanText(paymentMethod, 100);
    if (externalBookingId !== undefined) booking.externalBookingId = cleanText(externalBookingId, 200);
    if (ticketNo !== undefined) booking.ticketNo = cleanText(ticketNo, 200);
    if (pnr !== undefined) booking.pnr = cleanText(pnr, 200);
    if (providerStatus !== undefined) booking.providerStatus = cleanText(providerStatus, 100);
    if (failureStage !== undefined) booking.failureStage = cleanText(failureStage, 100);
    if (failureReason !== undefined) booking.failureReason = cleanText(failureReason);
    if (refundAmount !== undefined) booking.refundAmount = refundAmount;
    if (refundStatus !== undefined) booking.refundStatus = cleanText(refundStatus, 100);
    if (cancellationReason !== undefined) booking.cancellationReason = cleanText(cancellationReason);

    if (booking.status === 'confirmed' && normalizedStatus) {
      booking.confirmedAt = booking.confirmedAt || new Date();
      booking.failureStage = '';
      booking.failureReason = '';
    }
    if (booking.status === 'failed' && normalizedStatus) booking.failedAt = new Date();

    if (normalizedStatus || normalizedPaymentStatus || failureReason !== undefined) {
      booking.statusHistory.push({
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        stage: cleanText(failureStage || (booking.status === 'confirmed' ? 'confirmed' : 'updated'), 100),
        message: cleanText(failureReason)
      });
    }

    await booking.save();

    let notification = null;
    if (booking.refundStatus && booking.refundStatus !== previousBookingState.refundStatus) {
      notification = {
        title: 'Refund update',
        body: `Your refund status is now ${booking.refundStatus.replace(/[_-]/g, ' ')}.${booking.refundAmount > 0 ? ` Amount: ₹${booking.refundAmount}.` : ''}`,
        url: '/my-bookings',
        tag: `refund-${booking._id}-${booking.refundStatus}`,
      };
    } else if (booking.status !== previousBookingState.status || booking.paymentStatus !== previousBookingState.paymentStatus) {
      const state = booking.status === 'confirmed' ? 'confirmed' : booking.status === 'failed' ? 'needs attention' : booking.status.replace(/[_-]/g, ' ');
      notification = {
        title: booking.status === 'confirmed' ? 'Booking confirmed' : 'Booking update',
        body: `Your ${booking.serviceType} booking ${booking.bookingId} ${state}.`,
        url: '/my-bookings',
        tag: `booking-${booking._id}-${booking.status}-${booking.paymentStatus}`,
      };
    }
    if (notification) pushNotifications.sendUserNotification(booking.userId, notification).catch(() => {});

    console.log(`✅ Booking updated: ${booking.bookingId} → status: ${booking.status}`);

    res.json({
      success: true,
      message: 'Booking updated successfully',
      booking: serializeBooking(booking)
    });
  } catch (error) {
    console.error('Update booking error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * POST /user/verify-token
 * Verify if token is still valid
 */
router.post('/verify-token', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        phone: user.phone,
        name: user.name,
        email: user.email,
        age: user.age,
        gender: user.gender,
        isProfileComplete: user.isProfileComplete
      }
    });
  } catch (error) {
    console.error('Verify token error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
