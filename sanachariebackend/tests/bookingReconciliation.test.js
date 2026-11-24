const test = require('node:test');
const assert = require('node:assert/strict');
const { _test } = require('../services/bookingReconciliationService');
const Booking = require('../models/Booking');
const { hashReference } = require('../services/paymentSecurity');

test('provider statuses map to dashboard lifecycle states', () => {
  assert.equal(_test.mapProviderStatus('CONFIRMED'), 'confirmed');
  assert.equal(_test.mapProviderStatus('TRAVELLED'), 'completed');
  assert.equal(_test.mapProviderStatus('SERVICE_CANCELLED'), 'cancelled');
  assert.equal(_test.mapProviderStatus('FAILED'), 'failed');
});

test('refunded Razorpay payments are not treated as unmatched captured bookings', () => {
  assert.equal(_test.capturedPayment({ amount: 99645, amount_refunded: 99645,
    status: 'refunded', captured: true }), false);
  assert.equal(_test.capturedPayment({ amount: 99645, amount_refunded: 0,
    status: 'captured', captured: true }), true);
  assert.equal(_test.capturedPayment({ amount: 99645, amount_refunded: 100,
    status: 'refunded', captured: true }), true);
});

test('unmatched captured payment updates its original booking instead of creating a duplicate', async () => {
  const originalFindOne = Booking.findOne;
  const originalBookingId = '6b02e95b3e71f6e80b168cb1';
  const userId = '6b02d19f3e71f6e80b1688bb';
  const referenceHash = hashReference('bus-block');
  const booking = { status: 'pending', paymentStatus: 'pending', providerStatus: 'payment_pending',
    statusHistory: [], seats: [], selectedSeats: [], baseFare: 0, totalFare: 0 };
  let lookups = 0;
  try {
    Booking.findOne = async (query) => {
      lookups += 1;
      if (lookups === 1) return null;
      assert.equal(query._id, originalBookingId);
      assert.equal(query.userId, userId);
      assert.equal(query.providerReferenceHash, referenceHash);
      return booking;
    };
    const payment = { id: 'pay_captured', order_id: 'order_captured', amount: 89680,
      method: 'upi', created_at: 1795352931, order: { notes: {
        wallet_booking_id: originalBookingId, pricing_ref_hash: referenceHash,
        seats: 'C4', service_type: 'bus',
      } } };
    const result = await _test.recoverUnmatchedPayment({ _id: userId, phone: '9063351811' },
      payment, new Date('2026-11-22T13:30:48Z'), true);
    assert.equal(result.created, false);
    assert.equal(result.updated, true);
    assert.equal(booking.paymentId, 'pay_captured');
    assert.equal(booking.status, 'failed');
    assert.equal(lookups, 2);
  } finally {
    Booking.findOne = originalFindOne;
  }
});

test('one provider ticket links duplicate captured payments and keeps the pre-booking payment primary', () => {
  const ticket = {
    bookingDate: new Date('2026-08-02T04:32:09.000Z'),
    totalFare: 1236.19,
    seats: ['4A'],
    busName: 'FlixBus',
  };
  const makePayment = (id, createdAt) => ({
    id,
    order_id: `order_${id}`,
    amount: 123619,
    created_at: Math.floor(new Date(createdAt).getTime() / 1000),
    order: {
      notes: {
        bus_name: 'FlixBus',
        seats: '4A',
        service_type: 'bus',
        pricing_ref_hash: 'same-provider-attempt',
      },
    },
  });
  const first = makePayment('pay_first', '2026-08-02T04:31:11.000Z');
  const duplicate = makePayment('pay_duplicate', '2026-08-02T04:32:27.000Z');

  const match = _test.matchTicketToPayments(ticket, [first, duplicate]);

  assert.equal(match.primary.id, 'pay_first');
  assert.deepEqual(new Set(match.related.map((payment) => payment.id)), new Set(['pay_first', 'pay_duplicate']));
  assert.equal(match.referenceHash, 'same-provider-attempt');
});

test('mixed wallet and coupon reconciliation matches the remaining captured card amount by block reference', () => {
  const blockKey = 'ets-block-mixed-123';
  const ticket = {
    bookingDate: new Date('2026-08-02T04:32:09.000Z'),
    totalFare: 1000,
    seats: ['4A'],
    busName: 'FlixBus',
    blockKey,
  };
  const match = _test.matchTicketToPayments(ticket, [{
    id: 'pay_mixed_partial',
    order_id: 'order_mixed_partial',
    amount: 40000,
    created_at: Math.floor(new Date('2026-08-02T04:31:11.000Z').getTime() / 1000),
    order: { notes: { service_type: 'bus', pricing_ref_hash: hashReference(blockKey), wallet_amount: '300', promo_code: 'SAVE' } },
  }]);

  assert.equal(match.primary.id, 'pay_mixed_partial');
  assert.equal(match.referenceHash, hashReference(blockKey));
});

test('provider report sanitizer excludes partner account fields', () => {
  const ticket = _test.sanitizeProviderTicket({
    tripRefNumber: 'ETS123',
    pnr: 'PNR123',
    status: 'CONFIRMED',
    bookingDate: '2026-08-02T04:32:09.000Z',
    itineraryInfo: {
      sourceCity: 'Hyderabad',
      destinationCity: 'Bengaluru',
      journeyDate: 'Mon,03-Aug-2026',
      serviceProvider: 'Test Bus',
      service_type: 'Sleeper',
      totalFareWithTaxes: 500,
      travelerDetails: [{ name: 'Passenger', age: 28, gender: 'M', seatNo: 'A1' }],
      partnerUsers: { password: 'must-not-leak' },
    },
  });

  assert.equal(ticket.ticketNo, 'ETS123');
  assert.equal(ticket.journeyDate.toISOString(), '2026-08-03T00:00:00.000Z');
  assert.equal(Object.hasOwn(ticket, 'partnerUsers'), false);
  assert.equal(JSON.stringify(ticket).includes('must-not-leak'), false);
});
