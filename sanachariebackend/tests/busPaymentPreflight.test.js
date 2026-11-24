const test = require('node:test');
const assert = require('node:assert/strict');
const Booking = require('../models/Booking');
const { ApplicationSettings } = require('../models/AdminResources');
const paymentService = require('../services/paymentService');
const { storeBusBlock } = require('../services/busBlockStore');
const { hashReference } = require('../services/paymentSecurity');
const paymentRoutes = require('../routes/payment');

test('bus payment order rejects a fare mismatch before charging', async () => {
  const originalSettingsFindOne = ApplicationSettings.findOne;
  const originalBookingFindOne = Booking.findOne;
  const originalIsConfigured = paymentService.isConfigured;
  const originalCreateOrder = paymentService.createOrder;
  const bookingId = '6b02ed873e71f6e80b169091';
  const blockTicketKey = 'preflight-test-block';
  let createOrderCalls = 0;
  const handler = paymentRoutes.stack.find((layer) => layer.route?.path === '/create-order').route.stack.at(-1).handle;

  try {
    ApplicationSettings.findOne = () => ({ select: () => ({ lean: async () => null }) });
    Booking.findOne = () => ({ select: async () => ({ _id: bookingId, paymentStatus: 'pending' }) });
    paymentService.isConfigured = () => true;
    paymentService.createOrder = async () => { createOrderCalls += 1; return { id: 'order_test', amount: 50000, currency: 'INR' }; };
    const block = storeBusBlock(blockTicketKey, { requiredAmount: 500, isRTC: false });

    const bookingDetails = { serviceType: 'bus', pricingRef: blockTicketKey,
      wallet_booking_id: bookingId, providerReferenceHash: hashReference(blockTicketKey) };
    const request = async (amount) => {
      const response = { statusCode: 200, body: null,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; } };
      await handler({ body: { amount, bookingDetails } }, response);
      return response;
    };

    const mismatch = await request(499);
    assert.equal(mismatch.statusCode, 409);
    assert.equal(mismatch.body.code, 'BUS_FARE_CHANGED');
    assert.equal(createOrderCalls, 0);

    const exact = await request(500);
    assert.equal(exact.statusCode, 200);
    assert.equal(createOrderCalls, 1);

    block.expiresAt = Date.now() + 90 * 1000;
    const expiring = await request(500);
    assert.equal(expiring.statusCode, 409);
    assert.equal(expiring.body.code, 'BUS_BOOKING_EXPIRED');
    assert.equal(createOrderCalls, 1);
  } finally {
    ApplicationSettings.findOne = originalSettingsFindOne;
    Booking.findOne = originalBookingFindOne;
    paymentService.isConfigured = originalIsConfigured;
    paymentService.createOrder = originalCreateOrder;
  }
});
