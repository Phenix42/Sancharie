const axios = require('axios');

const DEFAULT_BASE_URL = 'https://www.api.bdsd.technology/api';

class FlightProviderError extends Error {
  constructor(message, status = 502, details = null) {
    super(message);
    this.name = 'FlightProviderError';
    this.status = status;
    this.details = details;
  }
}

const getFlightConfig = () => ({
  baseUrl: (process.env.FLIGHT_API_BASE_URL || process.env.FLIGHT_API_URL || DEFAULT_BASE_URL)
    .replace(/\/+$/, ''),
  username: process.env.FLIGHT_API_USERNAME || '',
  password: process.env.FLIGHT_API_PASSWORD || '',
  timeout: Number.parseInt(process.env.FLIGHT_API_TIMEOUT, 10) || 30000,
});

const getProviderError = (payload) => {
  const error = payload?.Error || payload?.error;
  if (!error) return null;

  const errorCode = Number(error.ErrorCode ?? error.errorCode ?? 0);
  const errorMessage = error.ErrorMessage || error.errorMessage || '';

  if (errorCode === 0 && !errorMessage) return null;

  return {
    code: Number.isNaN(errorCode) ? error.ErrorCode : errorCode,
    message: errorMessage || 'The flight provider rejected the request',
  };
};

const requestFlightProvider = async (endpoint, payload) => {
  const config = getFlightConfig();

  if (!config.username || !config.password) {
    throw new FlightProviderError('Flight provider credentials are not configured', 503);
  }

  const normalizedEndpoint = String(endpoint).replace(/^\/+/, '');
  const url = `${config.baseUrl}/airservice/rest/${normalizedEndpoint}`;

  try {
    const response = await axios.post(url, payload, {
      headers: {
        Username: config.username,
        Password: config.password,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: config.timeout,
    });

    return response.data;
  } catch (error) {
    if (error instanceof FlightProviderError) throw error;

    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      throw new FlightProviderError('The flight provider timed out', 504);
    }

    // This provider sometimes returns its normal Error envelope with HTTP 4xx.
    // Preserve that payload so callers receive the real provider code/message.
    if (error.response?.data?.Error) {
      return error.response.data;
    }

    const providerMessage =
      error.response?.data?.message ||
      'The flight provider is temporarily unavailable';

    throw new FlightProviderError(providerMessage, 502, {
      providerStatus: error.response?.status,
    });
  }
};

const flattenItineraries = (result) => {
  const itineraries = [];

  const visit = (value) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    if (value && typeof value === 'object' && Array.isArray(value.Segments)) {
      itineraries.push(value);
    }
  };

  visit(result);
  return itineraries;
};

const formatDuration = (minutes) => {
  const totalMinutes = Number(minutes);
  if (!Number.isFinite(totalMinutes) || totalMinutes < 0) return '';

  const hours = Math.floor(totalMinutes / 60);
  const remainder = Math.round(totalMinutes % 60);
  return `${hours}h ${remainder}m`;
};

const getFarePrice = (fare) => Number(
  fare?.PublishedPrice ??
  fare?.Fare?.PublishedPrice ??
  fare?.OfferedPrice ??
  fare?.Fare?.OfferedPrice ??
  0
);

const normalizeFare = (fare) => ({
  resultIndex: fare?.FareId || fare?.ResultIndex || '',
  fareType: fare?.FareType || '',
  cabinClass: fare?.CabinClass || '',
  refundable: Boolean(fare?.IsRefundable),
  publishedPrice: getFarePrice(fare),
  offeredPrice: Number(fare?.OfferedPrice ?? fare?.Fare?.OfferedPrice ?? getFarePrice(fare)),
  airlineRemark: fare?.AirlineRemark || '',
  seatBaggage: fare?.SeatBaggage || [],
  fare: fare?.Fare || {},
  fareBreakdown: fare?.FareBreakdown || {},
  source: fare?.Source || '',
});

const normalizeSearchResults = (payload) => {
  const searchTokenId = payload?.SearchTokenId || '';
  const itineraries = flattenItineraries(payload?.Result);

  return itineraries.map((itinerary, itineraryIndex) => {
    const journeys = itinerary.Segments
      .filter(Array.isArray)
      .map((segments) => segments.filter(Boolean));
    const segments = journeys.flat();
    const firstSegment = segments[0] || {};
    const lastSegment = segments[segments.length - 1] || {};
    const fares = (itinerary.FareList || []).map(normalizeFare);
    const selectedFare = fares.reduce((lowest, fare) => {
      if (!lowest) return fare;
      if (!fare.publishedPrice) return lowest;
      if (!lowest.publishedPrice) return fare;
      return fare.publishedPrice < lowest.publishedPrice ? fare : lowest;
    }, null) || normalizeFare({});

    const totalDuration = Number(
      firstSegment.TotalDuration ??
      segments.reduce((sum, segment) => sum + Number(segment.Duration || 0) + Number(segment.LayoverTime || 0), 0)
    );
    const stopsCount = journeys.reduce(
      (count, journey) => count + Math.max(0, journey.length - 1),
      0
    );
    const baggage = selectedFare.seatBaggage.flat(Infinity).filter(Boolean);
    const amenities = [...new Set([
      ...baggage.map((item) => item.CheckIn && `Check-in ${item.CheckIn}`),
      ...baggage.map((item) => item.Cabin && `Cabin ${item.Cabin}`),
      selectedFare.refundable ? 'Refundable' : 'Non-refundable',
    ].filter(Boolean))];
    const airline = firstSegment.Airline || {};
    const origin = firstSegment.Origin || {};
    const destination = lastSegment.Destination || {};

    return {
      id: `${searchTokenId || 'flight'}-${selectedFare.resultIndex || itineraryIndex}`,
      searchTokenId,
      resultIndex: selectedFare.resultIndex,
      carrier: airline.AirlineName || airline.AirlineCode || 'Airline',
      airlineCode: airline.AirlineCode || '',
      flightNumber: `${airline.AirlineCode || ''}${airline.FlightNumber || ''}`,
      from: origin.AirportCode || origin.CityCode || '',
      to: destination.AirportCode || destination.CityCode || '',
      departureAirport: [origin.AirportCode, origin.AirportName].filter(Boolean).join(' · '),
      arrivalAirport: [destination.AirportCode, destination.AirportName].filter(Boolean).join(' · '),
      departureTime: origin.DepartTime || '',
      arrivalTime: destination.ArrivalTime || '',
      duration: formatDuration(totalDuration),
      durationMinutes: totalDuration,
      price: selectedFare.publishedPrice || Number(itinerary.MinPublishedPrice || 0),
      offeredPrice: selectedFare.offeredPrice,
      currency: 'INR',
      stops: stopsCount === 0 ? 'Non-stop' : `${stopsCount} stop${stopsCount === 1 ? '' : 's'}`,
      stopsCount,
      refundable: selectedFare.refundable,
      fareType: selectedFare.fareType,
      cabinClass: selectedFare.cabinClass,
      amenities,
      fares,
      journeys,
      segments,
    };
  });
};

module.exports = {
  FlightProviderError,
  flattenItineraries,
  formatDuration,
  getFlightConfig,
  getProviderError,
  normalizeFare,
  normalizeSearchResults,
  requestFlightProvider,
};
