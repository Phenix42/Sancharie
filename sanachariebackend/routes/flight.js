const express = require('express');
const jwt = require('jsonwebtoken');
const paymentService = require('../services/paymentService');
const {
  FlightProviderError,
  getProviderError,
  normalizeCalendarFares,
  normalizeSearchResults,
  requestFlightProvider,
} = require('../services/flightService');

const router = express.Router();

const authenticateTransaction = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Please sign in before booking a flight',
      apiStatus: { success: false, message: 'Please sign in before booking a flight' },
    });
  }

  if (!process.env.JWT_SECRET) {
    return res.status(503).json({
      success: false,
      message: 'Booking authentication is not configured',
      apiStatus: { success: false, message: 'Booking authentication is not configured' },
    });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    return next();
  } catch {
    return res.status(403).json({
      success: false,
      message: 'Your session has expired. Please sign in again',
      apiStatus: { success: false, message: 'Your session has expired. Please sign in again' },
    });
  }
};

const read = (object, ...keys) => {
  for (const key of keys) {
    if (object?.[key] !== undefined && object?.[key] !== null) return object[key];
  }
  return undefined;
};

const asInteger = (value, fallback, min = 0, max = 9) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

const asBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'string') return value.toLowerCase() === 'true' || value === '1';
  return Boolean(value);
};

const normalizeAirportCode = (value) => {
  const text = String(value || '').trim().toUpperCase();
  const parenthesizedCode = text.match(/\(([A-Z]{3})\)\s*$/)?.[1];
  if (parenthesizedCode) return parenthesizedCode;
  if (/^[A-Z]{3}$/.test(text)) return text;
  return '';
};

const toProviderDate = (value) => {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(text)) return '';
  return text.includes('T') ? text : `${text}T00:00:00`;
};

const getUserIp = (req) => {
  const requestedIp = read(req.body, 'UserIp', 'userIp');
  const forwardedIp = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const detectedIp = forwardedIp || req.ip || req.socket?.remoteAddress || '';
  const ip = String(process.env.FLIGHT_USER_IP || requestedIp || detectedIp || '127.0.0.1');
  return ip.replace(/^::ffff:/, '').slice(0, 64);
};

const badRequest = (message) => {
  const error = new Error(message);
  error.status = 400;
  return error;
};

const asyncRoute = (handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    const status = error.status || 500;
    const publicMessage = error instanceof FlightProviderError || status < 500
      ? error.message
      : 'Flight service temporarily unavailable';

    console.error('[Flight API] request failed:', {
      path: req.path,
      status,
      message: error.message,
      providerStatus: error.details?.providerStatus,
    });

    res.status(status).json({
      success: false,
      message: publicMessage,
      apiStatus: { success: false, message: publicMessage },
    });
  }
};

const sendProviderResponse = (res, payload, extra = {}) => {
  const providerError = getProviderError(payload);

  if (providerError) {
    return res.status(422).json({
      ...payload,
      ...extra,
      success: false,
      message: providerError.message,
      apiStatus: {
        success: false,
        code: providerError.code,
        message: providerError.message,
      },
    });
  }

  return res.json({
    ...payload,
    ...extra,
    success: true,
    apiStatus: { success: true, message: 'Flight provider request completed' },
  });
};

const buildAirSegments = (body) => {
  const suppliedSegments = read(body, 'AirSegments', 'airSegments');
  const candidates = Array.isArray(suppliedSegments) && suppliedSegments.length
    ? suppliedSegments
    : [{
        Origin: read(body, 'Origin', 'origin', 'from', 'fromId'),
        Destination: read(body, 'Destination', 'destination', 'to', 'toId'),
        PreferredTime: read(body, 'PreferredTime', 'preferredTime', 'date'),
      }];

  return candidates.map((segment) => ({
    Origin: normalizeAirportCode(read(segment, 'Origin', 'origin')),
    Destination: normalizeAirportCode(read(segment, 'Destination', 'destination')),
    PreferredTime: toProviderDate(read(segment, 'PreferredTime', 'preferredTime', 'date')),
  }));
};

const validateAirSegments = (segments) => {
  if (!segments.length) throw badRequest('At least one flight segment is required');

  segments.forEach((segment, index) => {
    if (!segment.Origin || !segment.Destination) {
      throw badRequest(`Segment ${index + 1} must use valid three-letter IATA airport codes`);
    }
    if (segment.Origin === segment.Destination) {
      throw badRequest(`Segment ${index + 1} origin and destination must be different`);
    }
    if (!segment.PreferredTime) {
      throw badRequest(`Segment ${index + 1} must include a valid travel date`);
    }
  });
};

const collectProviderOptions = (value, options = []) => {
  if (Array.isArray(value)) {
    value.forEach((item) => collectProviderOptions(item, options));
  } else if (value && typeof value === 'object') {
    if (value.Key || value.Code) options.push(value);
    Object.values(value).forEach((item) => collectProviderOptions(item, options));
  }
  return options;
};

const buildSearchPayload = (req) => {
  const body = req.body || {};
  const airSegments = buildAirSegments(body);
  validateAirSegments(airSegments);

  const adult = asInteger(read(body, 'Adult', 'adult'), 1, 1);
  const child = asInteger(read(body, 'Child', 'child'), 0);
  const infant = asInteger(read(body, 'Infant', 'infant'), 0);

  if (adult + child + infant > 9) throw badRequest('A maximum of 9 passengers is allowed');
  if (infant > adult) throw badRequest('The infant count cannot exceed the adult count');

  return {
    UserIp: getUserIp(req),
    Adult: adult,
    Child: child,
    Infant: infant,
    DirectFlight: asBoolean(read(body, 'DirectFlight', 'directFlight')),
    JourneyType: asInteger(read(body, 'JourneyType', 'journeyType'), airSegments.length > 1 ? 2 : 1, 1, 5),
    PreferredCarriers: read(body, 'PreferredCarriers', 'preferredCarriers') || [],
    CabinClass: asInteger(read(body, 'CabinClass', 'cabinClass'), 1, 1, 6),
    SeriesFare: read(body, 'SeriesFare', 'seriesFare') ?? null,
    AirSegments: airSegments,
  };
};

const buildTokenPayload = (req) => {
  const searchTokenId = read(req.body, 'SearchTokenId', 'searchTokenId');
  const resultIndex = read(req.body, 'ResultIndex', 'resultIndex', 'fareId');

  if (!searchTokenId) throw badRequest('SearchTokenId is required');
  if (!resultIndex) throw badRequest('ResultIndex is required');

  return {
    UserIp: getUserIp(req),
    SearchTokenId: String(searchTokenId),
    ResultIndex: String(resultIndex),
  };
};

const searchHandler = asyncRoute(async (req, res) => {
  const providerPayload = await requestFlightProvider('search', buildSearchPayload(req));
  const flights = normalizeSearchResults(providerPayload);

  return sendProviderResponse(res, providerPayload, {
    searchTokenId: providerPayload?.SearchTokenId || '',
    flights,
    source: 'provider',
  });
});

const calendarFareHandler = asyncRoute(async (req, res) => {
  const body = req.body || {};
  const airSegments = buildAirSegments(body);
  validateAirSegments(airSegments);
  const adult = asInteger(read(body, 'Adult', 'adult'), 1, 1);
  const child = asInteger(read(body, 'Child', 'child'), 0);
  const infant = asInteger(read(body, 'Infant', 'infant'), 0);

  const providerPayload = await requestFlightProvider('getcalendarfare', {
    UserIp: getUserIp(req),
    Adult: adult,
    Child: child,
    Infant: infant,
    DirectFlight: asBoolean(read(body, 'DirectFlight', 'directFlight')),
    JourneyType: asInteger(read(body, 'JourneyType', 'journeyType'), 1, 1, 5),
    PreferredCarriers: read(body, 'PreferredCarriers', 'preferredCarriers') ?? null,
    CabinClass: asInteger(read(body, 'CabinClass', 'cabinClass'), 1, 1, 6),
    AirSegments: airSegments,
    Sources: read(body, 'Sources', 'sources') ?? null,
  });

  return sendProviderResponse(res, providerPayload, {
    calendarFares: normalizeCalendarFares(providerPayload),
    rawCalendarFares: providerPayload?.Result || [],
    searchTokenId: providerPayload?.SearchTokenId || '',
  });
});

const tokenEndpointHandler = (providerEndpoint) => asyncRoute(async (req, res) => {
  const providerPayload = await requestFlightProvider(providerEndpoint, buildTokenPayload(req));
  return sendProviderResponse(res, providerPayload);
});

const bookHandler = asyncRoute(async (req, res) => {
  const tokenPayload = buildTokenPayload(req);
  const passengers = read(req.body, 'Passengers', 'passengers');
  const paymentId = read(req.body, 'PaymentId', 'paymentId');

  if (!Array.isArray(passengers) || passengers.length === 0) {
    throw badRequest('At least one passenger is required');
  }
  if (passengers.length > 9) throw badRequest('A maximum of 9 passengers is allowed');

  if (process.env.FLIGHT_REQUIRE_PAYMENT !== 'false') {
    if (!paymentId) throw badRequest('Verified payment is required before flight booking');

    const [paymentDetails, confirmation] = await Promise.all([
      paymentService.fetchPaymentDetails(String(paymentId)),
      requestFlightProvider('fareconfirmation', tokenPayload),
    ]);
    const confirmationError = getProviderError(confirmation);

    if (confirmationError) {
      throw new FlightProviderError(confirmationError.message, 422);
    }

    const selectedAncillaries = passengers.flatMap((passenger) => [
      ...(Array.isArray(passenger?.Meal) ? passenger.Meal : []),
      ...(Array.isArray(passenger?.Baggage) ? passenger.Baggage : []),
    ]);
    let ancillaryAmount = 0;

    if (selectedAncillaries.length > 0) {
      const ssr = await requestFlightProvider('ssr', tokenPayload);
      const ssrError = getProviderError(ssr);
      if (ssrError) throw new FlightProviderError(ssrError.message, 422);

      const providerOptions = collectProviderOptions(ssr?.Result);
      selectedAncillaries.forEach((selected) => {
        const selectedKey = selected?.Key || selected?.Code;
        const providerOption = providerOptions.find((option) =>
          (selected?.Key && option.Key === selected.Key) ||
          (!selected?.Key && option.Code === selected?.Code)
        );
        if (!selectedKey || !providerOption) {
          throw badRequest('A selected flight add-on is no longer available');
        }
        ancillaryAmount += Number(providerOption.Price || 0);
      });
    }

    const requiredAmount = Math.round(
      (Number(confirmation?.Result?.Fare?.PublishedPrice || 0) + ancillaryAmount) * 100
    );
    const paidAmount = Number(paymentDetails?.amount || 0);
    const paymentCaptured = paymentDetails?.captured || paymentDetails?.status === 'captured';

    if (!paymentCaptured) {
      const error = badRequest('Payment has not been captured');
      error.status = 402;
      throw error;
    }
    if (!requiredAmount || paidAmount < requiredAmount) {
      const error = badRequest('Payment amount does not cover the latest airline fare');
      error.status = 402;
      throw error;
    }
  }

  const providerPayload = await requestFlightProvider('book', {
    ...tokenPayload,
    Passengers: passengers,
  });

  return sendProviderResponse(res, providerPayload);
});

const bookingDetailHandler = asyncRoute(async (req, res) => {
  const bookingId = read(req.body, 'BookingId', 'bookingId');
  const pnr = read(req.body, 'PNR', 'pnr') || '';
  const searchTokenId = read(req.body, 'SearchTokenId', 'searchTokenId');

  if (!bookingId && !pnr) throw badRequest('BookingId or PNR is required');
  if (!searchTokenId) throw badRequest('SearchTokenId is required');

  const providerPayload = await requestFlightProvider('getbookingdetail', {
    UserIp: getUserIp(req),
    BookingId: bookingId ? String(bookingId) : '',
    PNR: String(pnr),
    SearchTokenId: String(searchTokenId),
  });

  return sendProviderResponse(res, providerPayload);
});

const cancelRequestHandler = asyncRoute(async (req, res) => {
  const bookingId = read(req.body, 'BookingId', 'bookingId');
  const searchTokenId = read(req.body, 'SearchTokenId', 'searchTokenId');

  if (!bookingId) throw badRequest('BookingId is required');
  if (!searchTokenId) throw badRequest('SearchTokenId is required');

  const providerPayload = await requestFlightProvider('cancelrequest', {
    UserIp: getUserIp(req),
    BookingId: String(bookingId),
    SearchTokenId: String(searchTokenId),
    RequestType: String(read(req.body, 'RequestType', 'requestType') || 'FullCancellation'),
    Remark: String(read(req.body, 'Remark', 'remark') || 'Cancel Ticket').slice(0, 250),
  });

  return sendProviderResponse(res, providerPayload);
});

router.post('/search', searchHandler);
router.post('/calendar-fares', calendarFareHandler);
router.post('/getcalendarfare', calendarFareHandler);
router.post('/fare-rule', tokenEndpointHandler('farerule'));
router.post('/farerule', tokenEndpointHandler('farerule'));
router.post('/fare-confirmation', tokenEndpointHandler('fareconfirmation'));
router.post('/fareconfirmation', tokenEndpointHandler('fareconfirmation'));
router.post('/ssr', tokenEndpointHandler('ssr'));
router.post('/book', authenticateTransaction, bookHandler);
router.post('/booking-detail', authenticateTransaction, bookingDetailHandler);
router.post('/getbookingdetail', authenticateTransaction, bookingDetailHandler);
router.post('/cancel-request', authenticateTransaction, cancelRequestHandler);
router.post('/cancelrequest', authenticateTransaction, cancelRequestHandler);

module.exports = {
  router,
  buildAirSegments,
  buildSearchPayload,
  normalizeAirportCode,
  toProviderDate,
};
