const axios = require('axios');

const DEFAULT_BASE_URL = 'https://staging.travelxmlapi.com/V3/hotelservice/Hotelrest';

class HotelProviderError extends Error {
  constructor(message, status = 502, details = null) {
    super(message);
    this.name = 'HotelProviderError';
    this.status = status;
    this.details = details;
  }
}

const read = (object, ...keys) => {
  for (const key of keys) {
    if (object?.[key] !== undefined && object?.[key] !== null) return object[key];
  }
  return undefined;
};

const toArray = (value) => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const toNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const shouldReuseFlightCredentials = () => process.env.HOTEL_API_USE_FLIGHT_CREDENTIALS === 'true';

const getHotelConfig = () => ({
  baseUrl: (process.env.HOTEL_API_BASE_URL || process.env.HOTEL_API_URL || DEFAULT_BASE_URL).replace(/\/+$/, ''),
  username: process.env.HOTEL_API_USERNAME || (shouldReuseFlightCredentials() ? process.env.FLIGHT_API_USERNAME : '') || '',
  password: process.env.HOTEL_API_PASSWORD || (shouldReuseFlightCredentials() ? process.env.FLIGHT_API_PASSWORD : '') || '',
  authMode: process.env.HOTEL_API_AUTH_MODE || 'basic',
  timeout: Number.parseInt(process.env.HOTEL_API_TIMEOUT, 10) || 30000,
});

const isHotelProviderConfigured = () => {
  const config = getHotelConfig();
  return Boolean(config.baseUrl && config.username && config.password);
};

const shouldUseHotelMock = () => (
  process.env.HOTEL_API_USE_MOCK === 'true' ||
  (!isHotelProviderConfigured() && process.env.HOTEL_API_USE_MOCK !== 'false')
);

const getHotelCities = () => {
  try {
    const configured = JSON.parse(process.env.HOTEL_CITY_MAP_JSON || '[]');
    if (Array.isArray(configured) && configured.length) return configured;
  } catch {
    console.warn('[Hotel API] HOTEL_CITY_MAP_JSON is not valid JSON; using bundled development cities');
  }

  return [
    { id: 101, name: 'Hyderabad', state: 'Telangana', countryCode: 'IN', countryName: 'India' },
    { id: 102, name: 'Mumbai', state: 'Maharashtra', countryCode: 'IN', countryName: 'India' },
    { id: 103, name: 'Delhi', state: 'Delhi', countryCode: 'IN', countryName: 'India' },
    { id: 104, name: 'Bengaluru', state: 'Karnataka', countryCode: 'IN', countryName: 'India' },
    { id: 105, name: 'Chennai', state: 'Tamil Nadu', countryCode: 'IN', countryName: 'India' },
    { id: 106, name: 'Goa', state: 'Goa', countryCode: 'IN', countryName: 'India' },
    { id: 107, name: 'Kolkata', state: 'West Bengal', countryCode: 'IN', countryName: 'India' },
    { id: 108, name: 'Jaipur', state: 'Rajasthan', countryCode: 'IN', countryName: 'India' },
  ];
};

const getProviderError = (payload) => {
  const error = payload?.Error || payload?.error;
  if (!error) return null;

  const errorItem = Array.isArray(error) ? error[0] : error;
  const code = Number(errorItem?.ErrorCode ?? errorItem?.errorCode ?? 0);
  const message = errorItem?.ErrorMessage || errorItem?.errorMessage || '';

  if (!code && !message) return null;
  return {
    code: Number.isNaN(code) ? errorItem?.ErrorCode : code,
    message: message || 'The hotel provider rejected the request',
  };
};

const requestHotelProvider = async (endpoint, payload) => {
  if (shouldUseHotelMock()) {
    return requestHotelMock(endpoint, payload);
  }

  const config = getHotelConfig();
  const normalizedEndpoint = String(endpoint).replace(/^\/+/, '');
  const url = `${config.baseUrl}/${normalizedEndpoint}`;
  const basicAuth = `Basic ${Buffer.from(`${config.username}:${config.password}`).toString('base64')}`;
  const authHeaders = config.authMode === 'headers'
    ? { Username: config.username, Password: config.password }
    : config.authMode === 'both'
      ? { Username: config.username, Password: config.password, Authorization: basicAuth }
      : { Authorization: basicAuth };

  try {
    const response = await axios.post(url, payload, {
      headers: {
        ...authHeaders,
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      timeout: config.timeout,
      decompress: true,
    });

    return response.data;
  } catch (error) {
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      throw new HotelProviderError('The hotel provider timed out', 504);
    }

    if (error.response?.data?.Error) return error.response.data;

    throw new HotelProviderError(
      error.response?.data?.message || 'The hotel provider is temporarily unavailable',
      502,
      { providerStatus: error.response?.status }
    );
  }
};

const firstPrice = (value) => {
  const price = Array.isArray(value) ? value[0] : value;
  return price || {};
};

const getPublishedPrice = (item) => {
  const price = firstPrice(item?.Price || item?.price || item?.HotelPrice);
  return toNumber(
    read(price, 'PublishedPriceRoundedOff', 'PublishedPriceRoundedO', 'PublishedPrice', 'OfferedPriceRoundedOff', 'OfferedPrice') ||
    read(item, 'PublishedPriceRoundedOff', 'PublishedPrice', 'OfferedPriceRoundedOff', 'OfferedPrice')
  );
};

const normalizeHotelSearchResults = (payload) => {
  const searchToken = payload?.Search_Token || payload?.SearchToken || payload?.Search_TokenId || '';
  return toArray(payload?.Result).map((hotel, index) => {
    const price = firstPrice(hotel?.Price);
    const rating = Number(read(hotel, 'StarRating', 'starRating') || 0);
    return {
      id: `${searchToken || 'hotel'}-${read(hotel, 'ResultIndex') ?? index}`,
      resultIndex: read(hotel, 'ResultIndex') ?? index,
      searchToken,
      hotelCode: String(read(hotel, 'HotelCode', 'hotelCode') || ''),
      name: read(hotel, 'HotelName', 'hotelName') || 'Hotel',
      category: read(hotel, 'HotelCategory', 'category') || '',
      rating,
      description: read(hotel, 'HotelDescription', 'Description') || '',
      promotion: read(hotel, 'HotelPromotion', 'promotion') || '',
      policy: read(hotel, 'HotelPolicy', 'policy') || '',
      picture: read(hotel, 'HotelPicture', 'Hotel Picture', 'picture') || '',
      address: read(hotel, 'HotelAddress', 'Hotel Address', 'Address') || '',
      contactNo: read(hotel, 'HotelContactNo', 'Hotel Contact No') || '',
      map: read(hotel, 'HotelMap', 'Hotel Map') || '',
      latitude: read(hotel, 'Latitude') || '',
      longitude: read(hotel, 'Longitude') || '',
      location: read(hotel, 'HotelLocation', 'Hotel Location') || '',
      currency: read(price, 'CurrencyCode') || payload?.Currency || 'INR',
      price: getPublishedPrice(hotel),
      taxes: toNumber(read(price, 'Tax', 'ServiceTax')),
      raw: hotel,
    };
  });
};

const normalizeHotelInfo = (payload) => {
  const result = Array.isArray(payload?.Result) ? payload.Result[0] : payload?.Result;
  if (!result) return null;

  return {
    hotelCode: String(read(result, 'HotelCode') || ''),
    name: read(result, 'HotelName') || 'Hotel',
    rating: Number(read(result, 'StarRating') || 0),
    url: read(result, 'HotelURL') || '',
    description: read(result, 'Description', 'HotelDescription') || '',
    attractions: toArray(read(result, 'Attractions')).filter(Boolean),
    facilities: toArray(read(result, 'HotelFacilities')).filter(Boolean),
    policy: read(result, 'HotelPolicy') || '',
    specialInstructions: read(result, 'SpecialInstructions') || '',
    picture: read(result, 'HotelPicture') || '',
    images: toArray(read(result, 'Images')).filter(Boolean),
    address: read(result, 'Address') || '',
    countryName: read(result, 'CountryName') || '',
    pinCode: read(result, 'PinCode') || '',
    contactNo: read(result, 'HotelContactNo') || '',
    email: read(result, 'Email') || '',
    latitude: read(result, 'Latitude') || '',
    longitude: read(result, 'Longitude') || '',
    roomFacilities: toArray(read(result, 'RoomFacilities')).filter(Boolean),
    services: read(result, 'Services') || '',
    raw: result,
  };
};

const normalizeRoomOptions = (payload) => {
  const result = Array.isArray(payload?.Result) ? payload.Result[0] : payload?.Result;
  const rooms = toArray(result?.HotelRoomDetails);

  return rooms.map((room, index) => {
    const price = firstPrice(room?.Price);
    const bed = firstPrice(room?.BedTypes);
    return {
      id: `${read(room, 'RoomIndex', 'RoomId') || index}-${read(room, 'RatePlanCode') || index}`,
      roomIndex: read(room, 'RoomIndex', 'RoomId') ?? index + 1,
      roomTypeCode: read(room, 'RoomTypeCode') || '',
      roomTypeName: read(room, 'RoomTypeName') || 'Room',
      ratePlanCode: read(room, 'RatePlanCode') || '',
      ratePlan: read(room, 'RatePlan', 'RatePlanName') || '',
      infoSource: read(room, 'InfoSource') || '',
      amenities: toArray(read(room, 'Amenities')).filter(Boolean),
      bedType: read(bed, 'BedTypeName', 'Description') || '',
      lastCancellationDate: read(room, 'LastCancellationDate') || '',
      cancellationPolicies: toArray(read(room, 'CancellationPolicies')),
      cancellationPolicy: read(room, 'CancellationPolicy') || '',
      inclusions: toArray(read(room, 'Inclusion')).filter(Boolean),
      supplements: toArray(read(room, 'HotelSupplements')).filter(Boolean),
      currency: read(price, 'CurrencyCode') || payload?.Currency || 'INR',
      price: getPublishedPrice(room),
      taxes: toNumber(read(price, 'Tax', 'ServiceTax')),
      raw: room,
      hotelRoomDetails: [room],
    };
  });
};

const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const formatProviderDate = (date) => {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return '';
  return `${String(value.getDate()).padStart(2, '0')}/${String(value.getMonth() + 1).padStart(2, '0')}/${value.getFullYear()}`;
};

const makeMockPrice = (amount) => ({
  CurrencyCode: 'INR',
  RoomPrice: amount,
  Tax: Math.round(amount * 0.12),
  ExtraGuestCharge: 0,
  ChildCharge: 0,
  OtherCharges: 0,
  Discount: 0,
  PublishedPrice: Math.round(amount * 1.12),
  PublishedPriceRoundedOff: Math.round(amount * 1.12),
  OfferedPrice: Math.round(amount * 1.08),
  OfferedPriceRoundedOff: Math.round(amount * 1.08),
  AgentCommission: 0,
  AgentMarkUp: 0,
  ServiceTax: Math.round(amount * 0.12),
  TDS: 0,
});

const mockHotelBase = (payload, index) => {
  const city = getHotelCities().find((item) => Number(item.id) === Number(payload.DestinationCityId)) || getHotelCities()[0];
  const names = ['Sancharie Grand', 'The Meridian Courtyard', 'Urban Crest Suites'];
  const areas = ['Financial District', 'City Centre', 'Transit Hub'];
  const pictures = [
    'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=900&q=80',
  ];
  const basePrice = [4200, 5600, 6900][index] || 5200;
  return {
    ResultIndex: index + 1,
    HotelCode: `HTL-${city.id}-${index + 1}`,
    HotelName: `${names[index]} ${city.name}`,
    HotelCategory: index === 0 ? 'Business' : index === 1 ? 'Premium' : 'Luxury',
    StarRating: [4, 5, 5][index],
    HotelDescription: `A verified ${areas[index].toLowerCase()} hotel in ${city.name} with flexible room options and clear booking policies.`,
    HotelPromotion: index === 0 ? 'Breakfast included' : '',
    HotelPolicy: 'Standard check-in is 2 PM and check-out is 11 AM. Valid government ID is required.',
    Price: makeMockPrice(basePrice),
    HotelPicture: pictures[index] || pictures[0],
    HotelAddress: `${areas[index]}, ${city.name}, ${city.state}`,
    HotelContactNo: '+91 98765 43210',
    Latitude: '17.3850',
    Longitude: '78.4867',
    HotelLocation: areas[index],
  };
};

const requestHotelMock = async (endpoint, payload) => {
  const searchToken = payload.Search_Token || payload.SearchToken || `mock_hotel_${Date.now()}`;
  const normalizedEndpoint = String(endpoint).replace(/^\/+/, '');

  if (normalizedEndpoint === 'search') {
    return {
      UserIp: payload.UserIp,
      Search_Token: searchToken,
      Currency: payload.Currency || 'INR',
      Error: { ErrorCode: 0, ErrorMessage: '' },
      Result: [0, 1, 2].map((index) => mockHotelBase(payload, index)),
    };
  }

  const hotelCode = payload.HotelCode || 'HTL-101-1';
  const resultIndex = Number(payload.ResultIndex || 1) - 1;
  const hotel = mockHotelBase({ DestinationCityId: hotelCode.split('-')[1] || 101 }, Math.max(0, resultIndex));

  if (normalizedEndpoint === 'hotelinfo') {
    return {
      UserIp: payload.UserIp,
      Search_Token: searchToken,
      Currency: 'INR',
      Error: { ErrorCode: 0, ErrorMessage: '' },
      Result: {
        ...hotel,
        HotelURL: 'https://sancharie.com',
        Description: `${hotel.HotelDescription} Includes 24-hour reception, high-speed Wi-Fi, workspace-friendly rooms, and concierge support.`,
        Attractions: ['Business district', 'Shopping streets', 'Airport access'],
        HotelFacilities: ['Free Wi-Fi', 'Restaurant', 'Airport transfer', 'Conference room', 'Power backup'],
        SpecialInstructions: 'Early check-in is subject to room availability.',
        Images: [],
        Address: hotel.HotelAddress,
        CountryName: 'India',
        PinCode: '500081',
        Email: 'hotels@sancharie.com',
        RoomFacilities: ['Air conditioning', 'Tea and coffee maker', 'Work desk'],
        Services: 'Front desk, housekeeping, room service',
      },
    };
  }

  const rooms = [
    {
      RoomId: 1,
      RoomStatus: 'Available',
      RoomIndex: 1,
      RoomTypeCode: `${hotelCode}-DLX`,
      RoomTypeName: 'Deluxe Queen Room',
      RatePlanCode: 'BAR-BF',
      RatePlan: 'Best available rate with breakfast',
      InfoSource: 'FixedCombination',
      DayRates: [{ Amount: 4200, Date: formatProviderDate(new Date()) }],
      Price: makeMockPrice(4200),
      RoomPromotion: 'Breakfast included',
      Amenities: ['Free Wi-Fi', 'Breakfast', 'Air conditioning', 'Flexible check-in'],
      SmokingPreference: 0,
      BedTypes: [{ BedTypeCode: 1, BedTypeName: 'Queen bed' }],
      HotelSupplements: [],
      LastCancellationDate: formatProviderDate(addDays(new Date(), 1)),
      CancellationPolicies: [{
        Charge: 0,
        ChargeType: 1,
        Currency: 'INR',
        FromDate: formatProviderDate(new Date()),
        ToDate: formatProviderDate(addDays(new Date(), 1)),
      }],
      CancellationPolicy: 'Free cancellation until the last cancellation date. After that, one night charge may apply.',
      Inclusion: ['Breakfast', 'Wi-Fi'],
    },
    {
      RoomId: 2,
      RoomStatus: 'Available',
      RoomIndex: 2,
      RoomTypeCode: `${hotelCode}-EXE`,
      RoomTypeName: 'Executive King Room',
      RatePlanCode: 'FLEX-BF',
      RatePlan: 'Flexible rate with breakfast',
      InfoSource: 'FixedCombination',
      DayRates: [{ Amount: 5600, Date: formatProviderDate(new Date()) }],
      Price: makeMockPrice(5600),
      RoomPromotion: 'Premium workspace',
      Amenities: ['Free Wi-Fi', 'Breakfast', 'King bed', 'Workspace', 'Late checkout request'],
      SmokingPreference: 0,
      BedTypes: [{ BedTypeCode: 2, BedTypeName: 'King bed' }],
      HotelSupplements: [],
      LastCancellationDate: formatProviderDate(addDays(new Date(), 1)),
      CancellationPolicies: [{
        Charge: 20,
        ChargeType: 2,
        Currency: 'INR',
        FromDate: formatProviderDate(addDays(new Date(), 1)),
        ToDate: formatProviderDate(addDays(new Date(), 7)),
      }],
      CancellationPolicy: '20% cancellation charge after the free-cancellation window.',
      Inclusion: ['Breakfast', 'Wi-Fi', 'Workspace'],
    },
  ];

  if (normalizedEndpoint === 'roominfo' || normalizedEndpoint === 'blockroom') {
    return {
      UserIp: payload.UserIp,
      Search_Token: searchToken,
      Currency: 'INR',
      Error: { ErrorCode: 0, ErrorMessage: '' },
      Result: {
        AvailabilityType: 'Available',
        ResponseStatus: 1,
        IsPriceChanged: false,
        IsCancellationPolicyChanged: false,
        IsUnderCancellationAllowed: true,
        IsPolicyPerStay: false,
        RequireAllPaxDetails: true,
        HotelRoomDetails: normalizedEndpoint === 'blockroom' && payload.HotelRoomDetails?.length ? payload.HotelRoomDetails : rooms,
        RoomCombinations: [{ InfoSource: 'FixedCombination', RoomCombination: [{ RoomIndex: [1] }, { RoomIndex: [2] }] }],
        HotelName: hotel.HotelName,
        AddressLine1: hotel.HotelAddress,
        StarRating: hotel.StarRating,
        HotelPolicyDetail: hotel.HotelPolicy,
        Latitude: hotel.Latitude,
        Longitude: hotel.Longitude,
      },
    };
  }

  if (normalizedEndpoint === 'book' || normalizedEndpoint === 'generate_voucher') {
    const bookingId = Number(payload.BookingId) || Date.now();
    return {
      UserIp: payload.UserIp,
      Search_Token: searchToken,
      Currency: 'INR',
      Error: { ErrorCode: 0, ErrorMessage: '' },
      Result: bookingId,
      VoucherStatus: true,
      ResponseStatus: 1,
      Status: 1,
      HotelBookingStatus: 'Confirmed',
      InvoiceNumber: `INV-${bookingId}`,
      ConfirmationNo: `CNF-${bookingId}`,
      BookingRefNo: `SAN-HOTEL-${bookingId}`,
      BookingId: bookingId,
      IsPriceChanged: false,
      IsCancellationPolicyChanged: false,
    };
  }

  if (normalizedEndpoint === 'getbooking_detail') {
    return {
      UserIp: payload.UserIp,
      Search_Token: searchToken,
      Currency: 'INR',
      Error: { ErrorCode: 0, ErrorMessage: '' },
      Result: payload.BookingId,
      VoucherStatus: true,
      ResponseStatus: 1,
      Status: 1,
      HotelBookingStatus: 'Confirmed',
      InvoiceNumber: `INV-${payload.BookingId}`,
      ConfirmationNo: `CNF-${payload.BookingId}`,
      BookingRefNo: `SAN-HOTEL-${payload.BookingId}`,
      BookingId: payload.BookingId,
    };
  }

  if (normalizedEndpoint === 'cancel') {
    return {
      UserIp: payload.UserIp,
      Search_Token: searchToken,
      Currency: 'INR',
      Error: { ErrorCode: 0, ErrorMessage: '' },
      Result: { CancellationChargeBreakUp: 0, TotalServiceCharge: 0 },
      ResponseStatus: 1,
      ChangeRequestId: Date.now(),
      ChangeRequestStatus: 1,
    };
  }

  throw new HotelProviderError(`Unsupported hotel mock endpoint: ${endpoint}`, 404);
};

module.exports = {
  HotelProviderError,
  getHotelCities,
  getHotelConfig,
  getProviderError,
  isHotelProviderConfigured,
  normalizeHotelInfo,
  normalizeHotelSearchResults,
  normalizeRoomOptions,
  requestHotelProvider,
  shouldUseHotelMock,
};
