const RESTRICTED_FLIGHT_COUNTRIES = new Set([
  'PK',
]);

// IATA airports in Pakistan. Codes are retained here because provider segment
// payloads do not always include a country code.
const RESTRICTED_FLIGHT_AIRPORTS = new Set([
  'BHV',
  'CJL',
  'DBA',
  'DEA',
  'GIL',
  'GWD',
  'HDD',
  'ISB',
  'KDD',
  'KDU',
  'KHI',
  'LHE',
  'LYP',
  'MFG',
  'MUX',
  'PEW',
  'PZH',
  'RYK',
  'SKT',
  'SKZ',
  'TUK',
  'UET',
  'WNS',
]);

const normalizeCode = (value) => String(value || '').trim().toUpperCase();

const isRestrictedAirportCode = (value) => (
  RESTRICTED_FLIGHT_AIRPORTS.has(normalizeCode(value))
);

const isRestrictedAirport = (airport) => {
  if (!airport || typeof airport !== 'object') return false;

  const countryCode = normalizeCode(
    airport.CountryCode ?? airport.countryCode ?? airport.Country ?? airport.country
  );
  const airportCode = normalizeCode(
    airport.AirportCode ?? airport.airportCode ?? airport.CityCode ?? airport.cityCode
  );

  return RESTRICTED_FLIGHT_COUNTRIES.has(countryCode) || isRestrictedAirportCode(airportCode);
};

const hasRestrictedFlightSegment = (segment) => (
  isRestrictedAirport(segment?.Origin ?? segment?.origin) ||
  isRestrictedAirport(segment?.Destination ?? segment?.destination)
);

module.exports = {
  RESTRICTED_FLIGHT_AIRPORTS,
  RESTRICTED_FLIGHT_COUNTRIES,
  hasRestrictedFlightSegment,
  isRestrictedAirport,
  isRestrictedAirportCode,
};

