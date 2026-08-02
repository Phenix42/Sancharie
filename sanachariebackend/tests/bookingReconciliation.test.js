const test = require('node:test');
const assert = require('node:assert/strict');
const { _test } = require('../services/bookingReconciliationService');

test('provider statuses map to dashboard lifecycle states', () => {
  assert.equal(_test.mapProviderStatus('CONFIRMED'), 'confirmed');
  assert.equal(_test.mapProviderStatus('TRAVELLED'), 'completed');
  assert.equal(_test.mapProviderStatus('SERVICE_CANCELLED'), 'cancelled');
  assert.equal(_test.mapProviderStatus('FAILED'), 'failed');
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
