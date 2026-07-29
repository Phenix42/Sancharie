const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PaymentSecurityError,
  assertCapturedPaymentCovers,
  assertOrderContextMatches,
  hashReference,
} = require('../services/paymentSecurity');
const busRoute = require('../routes/bus');
const {
  getTotalSelectedPrice,
} = require('../routes/hotel');

test('captured payment must cover the backend-calculated amount', () => {
  assert.doesNotThrow(() => {
    assertCapturedPaymentCovers(
      { id: 'pay_ok', amount: 56000, currency: 'INR', captured: true, status: 'captured' },
      560,
      'bus booking'
    );
  });

  assert.throws(
    () => assertCapturedPaymentCovers(
      { id: 'pay_low', amount: 100, captured: true, status: 'captured' },
      560,
      'bus booking'
    ),
    (error) => error instanceof PaymentSecurityError && error.status === 402
  );

  assert.throws(
    () => assertCapturedPaymentCovers(
      { id: 'pay_usd', amount: 56000, currency: 'USD', captured: true, status: 'captured' },
      560,
      'bus booking'
    ),
    PaymentSecurityError
  );
});

test('payment order context rejects cross-booking reuse when notes are present', () => {
  assert.doesNotThrow(() => {
    assertOrderContextMatches(
      { notes: { service_type: 'flight', pricing_ref_hash: hashReference('token-1:fare-1') } },
      { serviceType: 'flight', pricingRef: 'token-1:fare-1' }
    );
  });

  assert.throws(
    () => assertOrderContextMatches(
      { notes: { service_type: 'hotel', pricing_ref_hash: hashReference('hotel-1') } },
      { serviceType: 'flight', pricingRef: 'token-1:fare-1' }
    ),
    PaymentSecurityError
  );
});

test('bus block request stamps supplier seat fares over client-supplied fares', () => {
  const result = busRoute._test.stampProviderSeatFares(
    [{
      seatNbr: 'A1',
      fare: 1,
      serviceTaxAmount: 0,
      totalFareWithTaxes: 1,
    }],
    [{
      id: 'A1',
      available: true,
      fare: 500,
      serviceTaxAmount: 60,
      operatorServiceChargeAbsolute: 0,
      totalFareWithTaxes: 560,
    }]
  );

  assert.equal(result.seatFareAmount, 560);
  assert.equal(result.passengers[0].fare, 500);
  assert.equal(result.passengers[0].serviceTaxAmount, 60);
  assert.equal(result.passengers[0].totalFareWithTaxes, 560);
});

test('hotel amount calculation uses provider room prices', () => {
  assert.equal(getTotalSelectedPrice([{
    Price: {
      PublishedPriceRoundedOff: 4200,
      OfferedPriceRoundedOff: 3900,
    },
  }]), 4200);
});
