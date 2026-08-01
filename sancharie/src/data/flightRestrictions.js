export const RESTRICTED_FLIGHT_COUNTRY_CODES = Object.freeze([
  'PK',
]);

const restrictedCountryCodes = new Set(RESTRICTED_FLIGHT_COUNTRY_CODES);

export const isRestrictedFlightCountry = (countryCode) => (
  restrictedCountryCodes.has(String(countryCode || '').trim().toUpperCase())
);

export const filterAllowedFlightAirports = (airports = []) => (
  airports.filter((airport) => !isRestrictedFlightCountry(airport?.country))
);

