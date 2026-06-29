const test = require('node:test');
const assert = require('node:assert/strict');
const {
  router,
  buildSearchPayload,
  normalizeAirportCode,
  toProviderDate,
} = require('../routes/flight');
const {
  getProviderError,
  normalizeSearchResults,
} = require('../services/flightService');

test('all documented flight operations are exposed by the backend router', () => {
  const paths = router.stack
    .filter((layer) => layer.route)
    .map((layer) => layer.route.path);

  [
    '/search',
    '/calendar-fares',
    '/fare-rule',
    '/fare-confirmation',
    '/ssr',
    '/book',
    '/booking-detail',
    '/cancel-request',
  ].forEach((path) => assert.ok(paths.includes(path), `${path} route is missing`));
});

test('buildSearchPayload converts the browser request to the provider schema', () => {
  const payload = buildSearchPayload({
    body: {
      origin: 'Delhi (DEL)',
      destination: 'Sharjah (SHJ)',
      date: '2026-12-12',
      adult: 2,
      child: 1,
      infant: 1,
    },
    headers: {},
    ip: '127.0.0.1',
    socket: {},
  });

  assert.equal(payload.Adult, 2);
  assert.equal(payload.Child, 1);
  assert.equal(payload.Infant, 1);
  assert.deepEqual(payload.AirSegments, [{
    Origin: 'DEL',
    Destination: 'SHJ',
    PreferredTime: '2026-12-12T00:00:00',
  }]);
});

test('airport and date values are normalized without accepting city names as IATA codes', () => {
  assert.equal(normalizeAirportCode('Delhi (DEL)'), 'DEL');
  assert.equal(normalizeAirportCode('bom'), 'BOM');
  assert.equal(normalizeAirportCode('Delhi'), '');
  assert.equal(toProviderDate('2026-12-12'), '2026-12-12T00:00:00');
  assert.equal(toProviderDate('not-a-date'), '');
});

test('search results retain token, fare IDs, segments, baggage, and lowest price', () => {
  const flights = normalizeSearchResults({
    SearchTokenId: 'token-123',
    Result: [[{
      Segments: [[{
        TotalDuration: 240,
        Duration: 240,
        Airline: { AirlineCode: 'G9', AirlineName: 'Air Arabia', FlightNumber: 464 },
        Origin: {
          AirportCode: 'DEL',
          AirportName: 'Indira Gandhi Airport',
          DepartTime: '2026-12-12T03:15:00',
        },
        Destination: {
          AirportCode: 'SHJ',
          AirportName: 'Sharjah',
          ArrivalTime: '2026-12-12T05:45:00',
        },
      }]],
      FareList: [
        {
          FareId: 'TOB2',
          FareType: 'Value',
          IsRefundable: false,
          PublishedPrice: 20426.29,
          SeatBaggage: [[{ CheckIn: '20 Kg', Cabin: '7 Kg' }]],
        },
        {
          FareId: 'TOB0',
          FareType: 'Basic',
          IsRefundable: false,
          PublishedPrice: 18675.9,
          SeatBaggage: [[{ CheckIn: '0 Kg', Cabin: '7 Kg' }]],
        },
      ],
    }]],
  });

  assert.equal(flights.length, 1);
  assert.equal(flights[0].searchTokenId, 'token-123');
  assert.equal(flights[0].resultIndex, 'TOB0');
  assert.equal(flights[0].price, 18675.9);
  assert.equal(flights[0].flightNumber, 'G9464');
  assert.equal(flights[0].duration, '4h 0m');
  assert.equal(flights[0].stops, 'Non-stop');
  assert.equal(flights[0].fares.length, 2);
  assert.ok(flights[0].amenities.includes('Cabin 7 Kg'));
});

test('provider errors are detected even when the upstream HTTP status is 200', () => {
  assert.equal(getProviderError({ Error: { ErrorCode: 0, ErrorMessage: '' } }), null);
  assert.deepEqual(
    getProviderError({ Error: { ErrorCode: 5, ErrorMessage: 'Invalid token' } }),
    { code: 5, message: 'Invalid token' }
  );
});
