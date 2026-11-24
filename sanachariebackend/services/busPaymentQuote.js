const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const User = require('../models/User');
const { ApplicationSettings, Coupon, Discount } = require('../models/AdminResources');
const { hashReference, toAmount, toPaise } = require('./paymentSecurity');

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

const requiredBusCardPaise = (blockAmount, adjustments) => Math.max(0,
  toPaise(blockAmount) - toPaise(adjustments.walletCredit) - toPaise(adjustments.promotionCredit));

module.exports = { getBookingAdjustments, requiredBusCardPaise };
