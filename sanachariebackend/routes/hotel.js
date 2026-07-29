const express = require('express');
const paymentService = require('../services/paymentService');
const {
  assertCapturedPaymentCovers,
  assertOrderContextMatches,
  assertPaymentNotConsumed,
  markPaymentConsumed,
} = require('../services/paymentSecurity');
const {
  HotelProviderError,
  getHotelCities,
  getProviderError,
  normalizeHotelInfo,
  normalizeHotelSearchResults,
  normalizeRoomOptions,
  requestHotelProvider,
  shouldUseHotelMock,
} = require('../services/hotelService');

const router = express.Router();

const read = (object, ...keys) => {
  for (const key of keys) {
    if (object?.[key] !== undefined && object?.[key] !== null) return object[key];
  }
  return undefined;
};

const badRequest = (message) => {
  const error = new Error(message);
  error.status = 400;
  return error;
};

const asInteger = (value, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

const asBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'string') return value.toLowerCase() === 'true' || value === '1';
  return Boolean(value);
};

const toIsoDate = (value) => {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
  const date = new Date(`${text}T00:00:00`);
  return Number.isNaN(date.getTime()) ? '' : text;
};

const toProviderDate = (value) => {
  const iso = toIsoDate(value);
  if (!iso) return '';
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
};

const nightsBetween = (checkIn, checkOut) => {
  const start = new Date(`${checkIn}T00:00:00`);
  const end = new Date(`${checkOut}T00:00:00`);
  const diff = Math.round((end.getTime() - start.getTime()) / 86400000);
  return Number.isFinite(diff) ? diff : 0;
};

const sanitizeText = (value, fallback = '') => (
  String(value || fallback).trim().replace(/[<>]/g, '').slice(0, 120)
);

const getUserIp = (req) => {
  const forwardedIp = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const requestedIp = read(req.body, 'UserIp', 'userIp');
  const detectedIp = forwardedIp || req.ip || req.socket?.remoteAddress || '';
  return String(process.env.HOTEL_USER_IP || requestedIp || detectedIp || '127.0.0.1')
    .replace(/^::ffff:/, '')
    .slice(0, 64);
};

const asyncRoute = (handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    const status = error.status || 500;
    const publicMessage = error instanceof HotelProviderError || status < 500
      ? error.message
      : 'Hotel service temporarily unavailable';

    console.error('[Hotel API] request failed:', {
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
    apiStatus: { success: true, message: 'Hotel provider request completed' },
  });
};

const buildRoomGuests = (body) => {
  const supplied = read(body, 'RoomGuests', 'roomGuests');
  if (Array.isArray(supplied) && supplied.length) {
    return supplied.map((room) => ({
      Adult: asInteger(read(room, 'Adult', 'adult', 'adults'), 1, 1, 8),
      Child: asInteger(read(room, 'Child', 'child', 'children'), 0, 0, 6),
      ChildAge: Array.isArray(read(room, 'ChildAge', 'childAge', 'childAges'))
        ? read(room, 'ChildAge', 'childAge', 'childAges').map((age) => asInteger(age, 6, 1, 17))
        : [],
    }));
  }

  const adult = asInteger(read(body, 'Adult', 'adult', 'adults'), 1, 1, 8);
  const child = asInteger(read(body, 'Child', 'child', 'children'), 0, 0, 6);
  const childAges = Array.isArray(read(body, 'ChildAge', 'childAge', 'childAges'))
    ? read(body, 'ChildAge', 'childAge', 'childAges').map((age) => asInteger(age, 6, 1, 17))
    : [];

  return [{ Adult: adult, Child: child, ChildAge: childAges.slice(0, child) }];
};

const buildSearchPayload = (req) => {
  const body = req.body || {};
  const checkIn = toIsoDate(read(body, 'CheckInDate', 'checkInDate', 'checkIn'));
  const checkOut = toIsoDate(read(body, 'CheckOutDate', 'checkOutDate', 'checkOut'));
  const destinationCityId = asInteger(read(body, 'DestinationCityId', 'destinationCityId', 'cityId'), 0, 1);
  const roomGuests = buildRoomGuests(body);
  const nights = nightsBetween(checkIn, checkOut);

  if (!checkIn || !checkOut) throw badRequest('Valid check-in and check-out dates are required');
  if (nights < 1) throw badRequest('Check-out date must be after check-in date');
  if (!destinationCityId) throw badRequest('Destination city ID is required');
  roomGuests.forEach((room, index) => {
    if (room.Child > 0 && room.ChildAge.length < room.Child) {
      throw badRequest(`Child ages are required for room ${index + 1}`);
    }
  });

  return {
    CheckInDate: toProviderDate(checkIn),
    CheckOutDate: toProviderDate(checkOut),
    NoOfNights: nights,
    CountryCode: sanitizeText(read(body, 'CountryCode', 'countryCode'), 'IN').toUpperCase(),
    DestinationCityId: destinationCityId,
    ResultCount: asInteger(read(body, 'ResultCount', 'resultCount'), 100, 1, 1000),
    Currency: sanitizeText(read(body, 'Currency', 'currency'), 'INR').toUpperCase(),
    GuestNationality: sanitizeText(read(body, 'GuestNationality', 'guestNationality'), 'IN').toUpperCase(),
    NoOfRooms: asInteger(read(body, 'NoOfRooms', 'noOfRooms', 'rooms'), roomGuests.length, 1, 6),
    RoomGuests: roomGuests,
    MaxRating: asInteger(read(body, 'MaxRating', 'maxRating'), 5, 0, 5),
    MinRating: asInteger(read(body, 'MinRating', 'minRating'), 0, 0, 5),
    UserIp: getUserIp(req),
  };
};

const buildHotelTokenPayload = (req) => {
  const body = req.body || {};
  const resultIndex = read(body, 'ResultIndex', 'resultIndex');
  const hotelCode = read(body, 'HotelCode', 'hotelCode');
  const searchToken = read(body, 'Search_Token', 'SearchToken', 'searchToken', 'searchTokenId');

  if (resultIndex === undefined || resultIndex === null || resultIndex === '') throw badRequest('ResultIndex is required');
  if (!hotelCode) throw badRequest('HotelCode is required');
  if (!searchToken) throw badRequest('Search_Token is required');

  return {
    UserIp: getUserIp(req),
    ResultIndex: asInteger(resultIndex, 0, 0),
    HotelCode: String(hotelCode),
    Search_Token: String(searchToken),
  };
};

const normalizeRoomDetails = (value) => {
  const rooms = Array.isArray(value) ? value : value ? [value] : [];
  if (!rooms.length) throw badRequest('At least one hotel room detail is required');
  return rooms.map((room) => ({
    ...room,
    Supplements: Array.isArray(room?.Supplements) ? room.Supplements : room?.Supplements || [],
  }));
};

const buildSelectedRoomPayload = (req) => {
  const body = req.body || {};
  const tokenPayload = buildHotelTokenPayload(req);
  const hotelRoomDetails = normalizeRoomDetails(read(body, 'HotelRoomDetails', 'hotelRoomDetails', 'selectedRooms'));

  return {
    ...tokenPayload,
    HotelName: sanitizeText(read(body, 'HotelName', 'hotelName'), 'Selected Hotel'),
    GuestNationality: sanitizeText(read(body, 'GuestNationality', 'guestNationality'), 'IN').toUpperCase(),
    NoOfRooms: asInteger(read(body, 'NoOfRooms', 'noOfRooms'), hotelRoomDetails.length, 1, 6),
    HotelRoomDetails: hotelRoomDetails,
  };
};

const splitName = (name) => {
  const parts = sanitizeText(name, 'Guest').split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || 'Guest',
    lastName: parts.slice(1).join(' ') || 'Traveller',
  };
};

const buildHotelPassengers = (guests, contact = {}) => {
  const supplied = Array.isArray(guests) && guests.length ? guests : [contact];

  return supplied.map((guest, index) => {
    const { firstName, lastName } = splitName(
      read(guest, 'name') || [read(guest, 'firstName'), read(guest, 'lastName')].filter(Boolean).join(' ')
    );
    const paxType = asInteger(read(guest, 'PaxType', 'paxType'), read(guest, 'type') === 'child' ? 2 : 1, 1, 2);

    return {
      Title: sanitizeText(read(guest, 'Title', 'title'), paxType === 1 ? 'Mr' : 'Master').slice(0, 8),
      FirstName: sanitizeText(read(guest, 'FirstName', 'firstName'), firstName),
      MiddleName: sanitizeText(read(guest, 'MiddleName', 'middleName'), ''),
      LastName: sanitizeText(read(guest, 'LastName', 'lastName'), lastName),
      Phoneno: sanitizeText(read(guest, 'Phoneno', 'phone') || contact.phone, ''),
      Email: sanitizeText(read(guest, 'Email', 'email') || contact.email, ''),
      PaxType: paxType,
      LeadPassenger: index === 0,
      Age: asInteger(read(guest, 'Age', 'age'), paxType === 2 ? 8 : 30, 1, 100),
      PassportNo: sanitizeText(read(guest, 'PassportNo', 'passportNo'), ''),
      PassportIssueDate: read(guest, 'PassportIssueDate', 'passportIssueDate') || '0001-01-01T00:00:00',
      PassportExpDate: read(guest, 'PassportExpDate', 'passportExpDate') || '0001-01-01T00:00:00',
    };
  });
};

const buildBookPayload = (req) => {
  const body = req.body || {};
  const roomPayload = buildSelectedRoomPayload(req);
  const passengers = buildHotelPassengers(read(body, 'HotelPassenger', 'hotelPassenger', 'guests'), read(body, 'contactDetails', 'contact') || {});

  return {
    ...roomPayload,
    HotelRoomDetails: roomPayload.HotelRoomDetails.map((room, index) => ({
      ...room,
      HotelPassenger: room.HotelPassenger || passengers.filter((guest) => index === 0 || guest.PaxType === 1),
    })),
    HotelPassenger: passengers,
    IsVouchered: asBoolean(read(body, 'IsVouchered', 'isVouchered'), true),
  };
};

const getTotalSelectedPrice = (rooms) => rooms.reduce((sum, room) => {
  const price = Array.isArray(room?.Price) ? room.Price[0] : room?.Price || {};
  return sum + Number(
    price.PublishedPriceRoundedOff ||
    price.PublishedPriceRoundedO ||
    price.PublishedPrice ||
    price.OfferedPriceRoundedOff ||
    price.OfferedPrice ||
    0
  );
}, 0);

const getBlockedRoomDetails = (providerPayload) => {
  const result = Array.isArray(providerPayload?.Result) ? providerPayload.Result[0] : providerPayload?.Result;
  return Array.isArray(result?.HotelRoomDetails) ? result.HotelRoomDetails : [];
};

const attachPassengersToRooms = (rooms, previousRooms, passengers) => rooms.map((room, index) => ({
  ...room,
  HotelPassenger: room.HotelPassenger ||
    previousRooms?.[index]?.HotelPassenger ||
    passengers.filter((guest) => index === 0 || guest.PaxType === 1),
}));

const verifyPaymentIfRequired = async (paymentId, amount, pricingRef) => {
  if (process.env.HOTEL_REQUIRE_PAYMENT === 'false' || shouldUseHotelMock()) return;
  if (!paymentId) {
    const error = badRequest('Verified payment is required before hotel booking');
    error.status = 402;
    throw error;
  }

  const paymentDetails = await paymentService.fetchPaymentDetails(String(paymentId));
  assertPaymentNotConsumed(String(paymentId));
  if (paymentDetails.order_id) {
    const orderDetails = await paymentService.fetchOrderDetails(paymentDetails.order_id);
    assertOrderContextMatches(orderDetails, {
      serviceType: 'hotel',
      pricingRef,
    });
  }
  assertCapturedPaymentCovers(paymentDetails, amount, 'hotel booking');
};

router.get('/cities', (req, res) => {
  res.json({
    success: true,
    apiStatus: { success: true, message: 'Hotel city list loaded' },
    cities: getHotelCities(),
    source: process.env.HOTEL_CITY_MAP_JSON ? 'env' : 'development',
  });
});

router.post('/search', asyncRoute(async (req, res) => {
  const payload = buildSearchPayload(req);
  const providerPayload = await requestHotelProvider('search', payload);
  return sendProviderResponse(res, providerPayload, {
    hotels: normalizeHotelSearchResults(providerPayload),
    searchToken: providerPayload?.Search_Token || providerPayload?.SearchToken || '',
    source: shouldUseHotelMock() ? 'mock' : 'provider',
  });
}));

router.post('/info', asyncRoute(async (req, res) => {
  const providerPayload = await requestHotelProvider('hotelinfo', buildHotelTokenPayload(req));
  return sendProviderResponse(res, providerPayload, {
    hotelInfo: normalizeHotelInfo(providerPayload),
  });
}));

router.post('/rooms', asyncRoute(async (req, res) => {
  const providerPayload = await requestHotelProvider('roominfo', buildHotelTokenPayload(req));
  return sendProviderResponse(res, providerPayload, {
    roomOptions: normalizeRoomOptions(providerPayload),
  });
}));

router.post('/block-room', asyncRoute(async (req, res) => {
  const providerPayload = await requestHotelProvider('blockroom', buildSelectedRoomPayload(req));
  const blockedRooms = getBlockedRoomDetails(providerPayload);
  const requiredAmount = getTotalSelectedPrice(blockedRooms);
  return sendProviderResponse(res, providerPayload, {
    roomOptions: normalizeRoomOptions(providerPayload),
    block: providerPayload?.Result || null,
    requiredAmount,
    requiredAmountPaise: Math.round(requiredAmount * 100),
  });
}));

router.post('/book', asyncRoute(async (req, res) => {
  const selectedPayload = buildSelectedRoomPayload(req);
  const blockPayload = await requestHotelProvider('blockroom', selectedPayload);
  const blockError = getProviderError(blockPayload);
  if (blockError) throw new HotelProviderError(blockError.message, 422);

  const blockedRooms = getBlockedRoomDetails(blockPayload);
  const requiredAmount = getTotalSelectedPrice(blockedRooms);
  if (!blockedRooms.length || requiredAmount <= 0) {
    const error = badRequest('Unable to verify the latest hotel room price');
    error.status = 409;
    throw error;
  }

  const payload = buildBookPayload(req);
  payload.HotelRoomDetails = attachPassengersToRooms(blockedRooms, payload.HotelRoomDetails, payload.HotelPassenger);
  const paymentId = read(req.body, 'PaymentId', 'paymentId');
  await verifyPaymentIfRequired(
    paymentId,
    requiredAmount,
    `${payload.Search_Token}:${payload.ResultIndex}:${payload.HotelCode}`
  );

  const providerPayload = await requestHotelProvider('book', payload);
  if (paymentId && !getProviderError(providerPayload)) {
    markPaymentConsumed(String(paymentId), {
      serviceType: 'hotel',
      searchToken: payload.Search_Token,
      resultIndex: payload.ResultIndex,
      hotelCode: payload.HotelCode,
    });
  }
  return sendProviderResponse(res, providerPayload, {
    booking: providerPayload?.Result || null,
    bookingId: providerPayload?.BookingId || providerPayload?.Result || '',
    bookingRefNo: providerPayload?.BookingRefNo || '',
    chargedAmount: requiredAmount,
  });
}));

router.post('/generate-voucher', asyncRoute(async (req, res) => {
  const bookingId = read(req.body, 'BookingId', 'bookingId');
  const searchToken = read(req.body, 'Search_Token', 'SearchToken', 'searchToken', 'searchTokenId');
  if (!bookingId) throw badRequest('BookingId is required');
  if (!searchToken) throw badRequest('Search_Token is required');

  const providerPayload = await requestHotelProvider('generate_voucher', {
    BookingId: asInteger(bookingId, 0, 1),
    UserIp: getUserIp(req),
    Search_Token: String(searchToken),
  });

  return sendProviderResponse(res, providerPayload, {
    booking: providerPayload?.Result || null,
  });
}));

router.post('/booking-detail', asyncRoute(async (req, res) => {
  const bookingId = read(req.body, 'BookingId', 'bookingId');
  const searchToken = read(req.body, 'Search_Token', 'SearchToken', 'searchToken', 'searchTokenId');
  if (!bookingId) throw badRequest('BookingId is required');
  if (!searchToken) throw badRequest('Search_Token is required');

  const providerPayload = await requestHotelProvider('getbooking_detail', {
    BookingId: asInteger(bookingId, 0, 1),
    UserIp: getUserIp(req),
    Search_Token: String(searchToken),
  });

  return sendProviderResponse(res, providerPayload, {
    booking: providerPayload?.Result || null,
  });
}));

router.post('/cancel', asyncRoute(async (req, res) => {
  const bookingId = read(req.body, 'BookingId', 'bookingId');
  const searchToken = read(req.body, 'Search_Token', 'SearchToken', 'searchToken', 'searchTokenId');
  if (!bookingId) throw badRequest('BookingId is required');
  if (!searchToken) throw badRequest('Search_Token is required');

  const providerPayload = await requestHotelProvider('cancel', {
    Search_Token: String(searchToken),
    UserIp: getUserIp(req),
    BookingId: asInteger(bookingId, 0, 1),
    BookingMode: 5,
    RequestType: 4,
    Remarks: sanitizeText(read(req.body, 'Remarks', 'remarks'), 'Cancel hotel booking'),
  });

  return sendProviderResponse(res, providerPayload, {
    cancellation: providerPayload?.Result || null,
  });
}));

module.exports = {
  router,
  buildSearchPayload,
  getBlockedRoomDetails,
  getTotalSelectedPrice,
  toProviderDate,
};
