const crypto = require('crypto');

const consumedPayments = new Map();
const CONSUMED_PAYMENT_TTL_MS = 24 * 60 * 60 * 1000;

class PaymentSecurityError extends Error {
  constructor(message, status = 402) {
    super(message);
    this.name = 'PaymentSecurityError';
    this.status = status;
  }
}

const toAmount = (value, fallback = 0) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : fallback;
};

const toPaise = (amount) => Math.round(toAmount(amount) * 100);

const isCaptured = (paymentDetails) => (
  paymentDetails?.captured === true || paymentDetails?.status === 'captured'
);

const assertCapturedPaymentCovers = (paymentDetails, requiredAmount, label = 'booking') => {
  const requiredPaise = toPaise(requiredAmount);
  const paidPaise = Math.round(toAmount(paymentDetails?.amount));

  if (!paymentDetails?.id) {
    throw new PaymentSecurityError(`Verified payment is required before ${label}`, 402);
  }

  if (!isCaptured(paymentDetails)) {
    throw new PaymentSecurityError('Payment has not been captured', 402);
  }

  if (paymentDetails.currency && String(paymentDetails.currency).toUpperCase() !== 'INR') {
    throw new PaymentSecurityError('Payment currency does not match booking currency', 402);
  }

  if (requiredPaise <= 0) {
    throw new PaymentSecurityError(`Unable to verify the latest ${label} amount`, 409);
  }

  if (paidPaise < requiredPaise) {
    throw new PaymentSecurityError(`Payment amount does not cover the latest ${label} price`, 402);
  }

  return {
    paidPaise,
    requiredPaise,
    paidAmount: paidPaise / 100,
    requiredAmount: requiredPaise / 100,
  };
};

const hashReference = (value) => crypto
  .createHash('sha256')
  .update(String(value || ''))
  .digest('hex');

const normalizeServiceType = (value) => String(value || '').trim().toLowerCase();

const assertOrderContextMatches = (orderDetails, expected = {}) => {
  const notes = orderDetails?.notes || {};
  const expectedServiceType = normalizeServiceType(expected.serviceType);
  const actualServiceType = normalizeServiceType(notes.service_type);

  if (expectedServiceType && actualServiceType && actualServiceType !== expectedServiceType) {
    throw new PaymentSecurityError('Payment order does not match this booking type', 402);
  }

  if (expected.pricingRef && notes.pricing_ref_hash && notes.pricing_ref_hash !== hashReference(expected.pricingRef)) {
    throw new PaymentSecurityError('Payment order does not match this booking', 402);
  }

  return true;
};

const pruneConsumedPayments = () => {
  const now = Date.now();
  for (const [paymentId, metadata] of consumedPayments.entries()) {
    if (now - metadata.consumedAt > CONSUMED_PAYMENT_TTL_MS) {
      consumedPayments.delete(paymentId);
    }
  }
};

const assertPaymentNotConsumed = (paymentId) => {
  pruneConsumedPayments();
  if (consumedPayments.has(paymentId)) {
    throw new PaymentSecurityError('This payment has already been used for a booking', 409);
  }
};

const markPaymentConsumed = (paymentId, metadata = {}) => {
  if (!paymentId) return;
  pruneConsumedPayments();
  consumedPayments.set(String(paymentId), {
    ...metadata,
    consumedAt: Date.now(),
  });
};

module.exports = {
  PaymentSecurityError,
  assertCapturedPaymentCovers,
  assertOrderContextMatches,
  assertPaymentNotConsumed,
  hashReference,
  isCaptured,
  markPaymentConsumed,
  toAmount,
  toPaise,
};
