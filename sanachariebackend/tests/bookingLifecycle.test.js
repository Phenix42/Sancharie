const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Booking = require('../models/Booking');

const makeBooking = (overrides = {}) => new Booking({
  userId: new mongoose.Types.ObjectId(),
  userPhone: '9876543210',
  clientReference: 'bus-test-attempt',
  serviceType: 'bus',
  busName: 'Test Travels',
  busType: 'Sleeper',
  source: 'Hyderabad',
  destination: 'Bengaluru',
  journeyDate: new Date('2026-08-12T00:00:00.000Z'),
  baseFare: 500,
  totalFare: 560,
  ...overrides,
});

test('failed booking attempts are valid dashboard records', () => {
  const booking = makeBooking({
    status: 'failed',
    paymentStatus: 'completed',
    failureStage: 'provider_booking',
    failureReason: 'Provider timed out',
    statusHistory: [{
      status: 'failed',
      paymentStatus: 'completed',
      stage: 'provider_booking',
      message: 'Provider timed out',
    }],
  });

  assert.equal(booking.validateSync(), undefined);
  assert.equal(booking.status, 'failed');
  assert.equal(booking.statusHistory[0].stage, 'provider_booking');
});

test('unknown lifecycle statuses are rejected', () => {
  const booking = makeBooking({ status: 'unknown' });
  const error = booking.validateSync();

  assert.ok(error);
  assert.match(error.errors.status.message, /not a valid enum value/i);
});

test('duplicate payment diagnostics are valid booking details', () => {
  const booking = makeBooking({
    status: 'confirmed',
    paymentStatus: 'completed',
    paymentId: 'pay_primary',
    relatedPaymentIds: ['pay_primary', 'pay_duplicate'],
    paymentIssue: 'duplicate_payment',
    paymentNote: 'Manual refund review is required.',
    providerStatus: 'CONFIRMED',
    reconciliationSource: 'ets_partner_report',
    lastReconciledAt: new Date(),
  });

  assert.equal(booking.validateSync(), undefined);
  assert.equal(booking.relatedPaymentIds.length, 2);
  assert.equal(booking.paymentIssue, 'duplicate_payment');
});
