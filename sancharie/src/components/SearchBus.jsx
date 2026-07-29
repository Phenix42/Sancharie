import React, { useState, useRef, useEffect } from "react";
import "./SearchBus.css";
import { busApi } from "../services";
import { ArrowLeftRight, Armchair, BadgeCheck, BedSingle, Building2, CalendarDays, Clock3, MapPin, Search, ShieldCheck, Snowflake } from "lucide-react";

// Import custom icons from assets
import fromIcon from "../assets/searchbar/from.svg";
import toIcon from "../assets/searchbar/to.svg";

const MAX_RECENT_SEARCHES = 5;
const STATION_CACHE_KEY = 'sancharie_bus_stations_cache_v2';
const STATION_CACHE_TTL_MS = 15 * 60 * 1000;

const normalizeText = (value) => String(value || '').trim().replace(/\s+/g, ' ');
const normalizeKey = (value) => normalizeText(value).toLowerCase();
const toDateInputValue = (date) => {
  const localDate = new Date(date);
  localDate.setMinutes(localDate.getMinutes() - localDate.getTimezoneOffset());
  return localDate.toISOString().split('T')[0];
};

const addDays = (date, days) => {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
};

const cityCorrections = {
  hydrabad: 'Hyderabad',
  hyderbad: 'Hyderabad',
  hyderabad: 'Hyderabad',
  secunderabad: 'Hyderabad',
  secundrabad: 'Hyderabad',
  vishakapatnam: 'Visakhapatnam',
  visakapatnam: 'Visakhapatnam',
  vishakhapatnam: 'Visakhapatnam',
  vizag: 'Visakhapatnam',
  visakhapatnam: 'Visakhapatnam',
};

const localityCityMap = [
  {
    city: 'Hyderabad',
    state: 'Telangana',
    aliases: ['Hyderabad', 'Hydrabad', 'Hyderbad'],
    localities: [
      'KPHB',
      'Gachibowli',
      'LB Nagar',
      'Ameerpet',
      'Secunderabad',
      'Miyapur',
      'Kukatpally',
      'Mehdipatnam',
      'Lakdikapul',
      'MGBS',
      'JBS',
      'BHEL',
      'Chanda Nagar',
      'Nampally',
      'Dilsukhnagar',
      'Uppal',
      'Shamshabad',
      'Hitech City',
      'Kondapur',
      'SR Nagar',
      'Abids',
      'ECIL',
      'Kompally',
    ],
  },
  {
    city: 'Visakhapatnam',
    state: 'Andhra Pradesh',
    aliases: ['Visakhapatnam', 'Vishakapatnam', 'Vizag'],
    localities: [
      'MVP Colony',
      'Gajuwaka',
      'NAD Junction',
      'Maddilapalem',
      'Dwaraka Nagar',
      'RTC Complex',
    ],
  },
];

const getCorrectedCity = (name) => {
  const cleaned = normalizeText(name).replace(/\s*\([^)]*\)\s*/g, '');
  const key = normalizeKey(cleaned);
  return cityCorrections[key] || cleaned;
};

const createStationOption = (station, source = 'api') => {
  const rawName = normalizeText(
    station.displayName ||
    station.stationName ||
    station.name ||
    station.cityName ||
    station.CityName ||
    ''
  );
  if (!rawName) return null;

  const stationId = String(station.stationId || station.id || station.code || rawName);
  const state = normalizeText(station.state || station.stateName || station.StateName || station.region || '');
  const city = normalizeText(station.searchCity || station.parentCity || station.cityName || station.city || '');
  const correctedCity = getCorrectedCity(city || rawName);
  const displayName = normalizeText(station.displayName || rawName);
  const kind = station.kind || (displayName.includes('All boarding points') ? 'city' : 'station');
  const subtitle = station.subtitle || (kind === 'city' ? state : correctedCity);
  const aliases = [
    ...(station.aliases || []),
    rawName,
    displayName,
    correctedCity,
    state,
  ].filter(Boolean);

  return {
    displayName,
    name: rawName,
    stationId,
    searchCity: correctedCity,
    state,
    kind,
    subtitle,
    source,
    searchText: `${displayName} ${rawName} ${correctedCity} ${state} ${aliases.join(' ')}`.toLowerCase(),
  };
};

const getCuratedBusStations = () => localityCityMap.flatMap(({ city, state, aliases, localities }) => [
  createStationOption({
    displayName: `${city} (All boarding points)`,
    stationName: city,
    stationId: `${city.toUpperCase().replace(/\s+/g, '_')}_ALL`,
    searchCity: city,
    state,
    kind: 'city',
    subtitle: state,
    aliases,
  }, 'curated'),
  ...localities.map((locality) => createStationOption({
    displayName: locality,
    stationName: locality,
    stationId: `${city.toUpperCase().replace(/\s+/g, '_')}_${locality.toUpperCase().replace(/\s+/g, '_')}`,
    searchCity: city,
    state,
    kind: 'boarding',
    subtitle: city,
    aliases: [city, state, ...aliases],
  }, 'curated')),
]).filter(Boolean);

const buildStationIndex = (options) => {
  const map = new Map();
  const deduped = [];
  const seen = new Set();

  options.filter(Boolean).forEach((option) => {
    const uniqueKey = `${normalizeKey(option.displayName)}|${normalizeKey(option.searchCity)}`;
    if (!seen.has(uniqueKey)) {
      seen.add(uniqueKey);
      deduped.push(option);
    }

    [
      option.displayName,
      option.name,
      option.stationId,
      option.searchCity,
      ...(option.displayName.includes('(') ? [option.displayName.replace(/\s*\([^)]*\)\s*/g, '')] : []),
    ].filter(Boolean).forEach((key) => {
      if (!map.has(normalizeKey(key))) {
        map.set(normalizeKey(key), option);
      }
    });
  });

  return { map, options: deduped };
};

const readStationCache = () => {
  try {
    const cached = JSON.parse(localStorage.getItem(STATION_CACHE_KEY) || 'null');
    if (!cached?.timestamp || !Array.isArray(cached.options)) return null;
    return cached;
  } catch {
    return null;
  }
};

const writeStationCache = (options) => {
  try {
    localStorage.setItem(STATION_CACHE_KEY, JSON.stringify({
      timestamp: Date.now(),
      options,
    }));
  } catch {
    // Cache is best-effort only.
  }
};

const loadRecentSearches = (mode) => {
  try {
    const saved = localStorage.getItem(`sancharie_recent_searches_${mode}`);
    const parsed = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const SearchBus = ({ onSearch, initialValues, mode = 'bus', compact = false }) => {
  const [{ today, tomorrow, dayAfterTomorrow }] = useState(() => {
    const currentDate = new Date();
    return {
      today: toDateInputValue(currentDate),
      tomorrow: toDateInputValue(addDays(currentDate, 1)),
      dayAfterTomorrow: toDateInputValue(addDays(currentDate, 2)),
    };
  });
  
  // Stations data from API
  const [stationMap, setStationMap] = useState(new Map());
  const [stationOptions, setStationOptions] = useState([]);
  const [stationsLoading, setStationsLoading] = useState(false);
  const stationMapRef = useRef(new Map());
  const stationOptionsRef = useRef([]);
  const stationsLoadedAtRef = useRef(0);
  
  const [recentSearchesByMode, setRecentSearchesByMode] = useState(() => ({
    bus: loadRecentSearches('bus'),
    flight: loadRecentSearches('flight'),
  }));
  const recentSearches = recentSearchesByMode[mode] || [];
  const setRecentSearches = (updater) => {
    setRecentSearchesByMode((previous) => ({
      ...previous,
      [mode]: typeof updater === 'function' ? updater(previous[mode] || []) : updater,
    }));
  };
  const [showRecentFrom, setShowRecentFrom] = useState(false);
  const [showRecentTo, setShowRecentTo] = useState(false);
  
  const [formData, setFormData] = useState({
    from: initialValues?.from || "",
    to: initialValues?.to || "",
    fromId: initialValues?.fromId || "",
    toId: initialValues?.toId || "",
    fromSearchCity: initialValues?.fromSearchCity || initialValues?.fromCity || "",
    toSearchCity: initialValues?.toSearchCity || initialValues?.toCity || "",
    date: initialValues?.date || today,
  });
  const [seatPreference, setSeatPreference] = useState(initialValues?.seatPreference || '');

  const [fromSuggestions, setFromSuggestions] = useState([]);
  const [toSuggestions, setToSuggestions] = useState([]);
  const [showFromDropdown, setShowFromDropdown] = useState(false);
  const [showToDropdown, setShowToDropdown] = useState(false);
  const [stationNotice, setStationNotice] = useState("");
  const [popup, setPopup] = useState({ show: false, message: "" });
  const dateOptions = [
    { key: 'today', value: today, helper: 'Today' },
    { key: 'tomorrow', value: tomorrow },
    { key: 'day-after', value: dayAfterTomorrow },
  ];
  const seatPreferenceOptions = [
    { key: 'Seating', label: 'Seater', icon: Armchair },
    { key: 'Sleeper', label: 'Sleeper', icon: BedSingle },
    { key: 'AC', label: 'AC', icon: Snowflake },
  ];

  const dateRef = useRef(null);
  const fromRef = useRef(null);
  const toRef = useRef(null);
  const recentSearchesKey = `sancharie_recent_searches_${mode}`;

  // Save recent search to localStorage
  const saveRecentSearch = (from, to, fromId = '', toId = '', fromSearchCity = '', toSearchCity = '') => {
    const newSearch = { from, to, fromId, toId, fromSearchCity, toSearchCity, timestamp: Date.now() };
    
    setRecentSearches(prev => {
      // Remove duplicate if exists
      const filtered = prev.filter(
        s => !(s.from === from && s.to === to)
      );
      // Add new search at the beginning and limit to max
      const updated = [newSearch, ...filtered].slice(0, MAX_RECENT_SEARCHES);
      
      // Save to localStorage
      try {
        localStorage.setItem(recentSearchesKey, JSON.stringify(updated));
      } catch (error) {
        console.error('Failed to save recent searches:', error);
      }
      
      return updated;
    });
  };

  const applyStationOptions = (options, loadedAt = Date.now()) => {
    const { map, options: indexedOptions } = buildStationIndex(options);
    stationMapRef.current = map;
    stationOptionsRef.current = indexedOptions;
    stationsLoadedAtRef.current = loadedAt;
    setStationMap(map);
    setStationOptions(indexedOptions);
    return { map, options: indexedOptions };
  };

  const loadStationOptions = async ({ force = false } = {}) => {
    if (mode === 'flight') {
      setStationNotice("");
      const { default: airports } = await import("../data/airports");
      const airportList = airports.map((airport) => createStationOption({
        displayName: airport.display,
        stationName: airport.display,
        stationId: airport.code,
        searchCity: airport.code,
        state: airport.country,
        kind: 'airport',
        subtitle: `${airport.city}, ${airport.country}`,
        aliases: [airport.code, airport.city, airport.name, airport.country],
      }, 'airport'));

      return applyStationOptions(airportList);
    }

    const cached = readStationCache();
    const cacheFresh = cached && Date.now() - cached.timestamp < STATION_CACHE_TTL_MS;
    if (!force && cacheFresh) {
      setStationNotice("Using saved station list");
      return applyStationOptions(cached.options, cached.timestamp);
    }

    setStationsLoading(true);
    try {
      const response = await busApi.getStations();
      const apiOptions = Array.isArray(response?.stationList)
        ? response.stationList.map((station) => createStationOption(station, 'api')).filter(Boolean)
        : [];
      const options = [...getCuratedBusStations(), ...apiOptions];
      writeStationCache(options);
      setStationNotice("");
      return applyStationOptions(options);
    } catch (error) {
      console.error('Failed to fetch stations:', error);
      if (cached?.options?.length) {
        setStationNotice("Using saved station list");
        return applyStationOptions(cached.options, cached.timestamp);
      }
      const fallbackOptions = getCuratedBusStations();
      applyStationOptions(fallbackOptions);
      setStationNotice("Saved popular stations active");
      return { map: stationMapRef.current, options: stationOptionsRef.current };
    } finally {
      setStationsLoading(false);
    }
  };

  const ensureStationsReady = async () => {
    const isStale = Date.now() - stationsLoadedAtRef.current > STATION_CACHE_TTL_MS;
    if (stationOptionsRef.current.length === 0 || (mode === 'bus' && isStale)) {
      return loadStationOptions({ force: mode === 'bus' && isStale });
    }
    return { map: stationMapRef.current, options: stationOptionsRef.current };
  };

  // Fetch stations from API on component mount
  useEffect(() => {
    loadStationOptions();
    // Reload stations only when switching between bus and flight modes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Helper function to find station data by name
  const getStationData = (stationName) => {
    return stationMap.get(normalizeKey(stationName)) || stationMapRef.current.get(normalizeKey(stationName)) || null;
  };

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (fromRef.current && !fromRef.current.contains(e.target)) {
        setShowFromDropdown(false);
      }
      if (toRef.current && !toRef.current.contains(e.target)) {
        setShowToDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filterStations = (input) => {
    if (!input) return [];
    const search = normalizeKey(input);
    const options = stationOptionsRef.current.length ? stationOptionsRef.current : stationOptions;
    return options
      .filter((station) => station.searchText?.includes(search) || normalizeKey(station.displayName).includes(search))
      .sort((a, b) => {
        const aStarts = normalizeKey(a.displayName).startsWith(search) ? 0 : 1;
        const bStarts = normalizeKey(b.displayName).startsWith(search) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        if (a.kind === 'city' && b.kind !== 'city') return -1;
        if (a.kind !== 'city' && b.kind === 'city') return 1;
        return a.displayName.localeCompare(b.displayName);
      })
      .slice(0, 12);
  };

  const formatDate = (date) => {
    if (!date) return "";
    const d = new Date(date);
    return d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const formatDateTile = (date, fallback = '') => {
    if (!date) return { day: '', label: fallback };
    const [year, month, day] = date.split('-').map(Number);
    const d = new Date(year, month - 1, day);
    if (Number.isNaN(d.getTime())) return { day: '', label: fallback };
    return {
      day: String(day),
      label: fallback || d.toLocaleDateString('en-IN', { weekday: 'short' }),
    };
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    const idField = name === 'from' ? 'fromId' : name === 'to' ? 'toId' : null;
    const searchCityField = name === 'from' ? 'fromSearchCity' : name === 'to' ? 'toSearchCity' : null;
    setFormData({
      ...formData,
      [name]: value,
      ...(idField ? { [idField]: '' } : {}),
      ...(searchCityField ? { [searchCityField]: '' } : {}),
    });

    if (name === "from") {
      if (value) {
        const filtered = filterStations(value);
        setFromSuggestions(filtered);
        setShowFromDropdown(filtered.length > 0);
        setShowRecentFrom(false);
      } else {
        setShowRecentFrom(recentSearches.length > 0);
        setFromSuggestions(stationOptionsRef.current.slice(0, 8));
        setShowFromDropdown(true);
      }
    } else if (name === "to") {
      if (value) {
        const filtered = filterStations(value);
        setToSuggestions(filtered);
        setShowToDropdown(filtered.length > 0);
        setShowRecentTo(false);
      } else {
        setShowRecentTo(recentSearches.length > 0);
        setToSuggestions(stationOptionsRef.current.slice(0, 8));
        setShowToDropdown(true);
      }
    }
  };

  const handleSelectCity = (field, station) => {
    const stationInfo = typeof station === 'object' ? station : getStationData(station);
    const displayName = stationInfo?.displayName || stationInfo?.name || station;
    if (field === "from") {
      setFormData({ 
        ...formData, 
        from: displayName,
        fromId: stationInfo?.stationId || "",
        fromSearchCity: stationInfo?.searchCity || displayName,
      });
      setShowFromDropdown(false);
      setFromSuggestions([]);
    } else {
      setFormData({ 
        ...formData, 
        to: displayName,
        toId: stationInfo?.stationId || "",
        toSearchCity: stationInfo?.searchCity || displayName,
      });
      setShowToDropdown(false);
      setToSuggestions([]);
    }
  };

  const handleFocus = (field) => {
    if (field === "from") {
      if (formData.from) {
        const filtered = filterStations(formData.from);
        setFromSuggestions(filtered);
        setShowRecentFrom(false);
      } else {
        // Show recent searches if available, otherwise show popular stations
        setShowRecentFrom(recentSearches.length > 0);
        setFromSuggestions(stationOptionsRef.current.slice(0, 8));
      }
      setShowFromDropdown(true);
    } else if (field === "to") {
      if (formData.to) {
        const filtered = filterStations(formData.to);
        setToSuggestions(filtered);
        setShowRecentTo(false);
      } else {
        // Show recent searches if available, otherwise show popular stations
        setShowRecentTo(recentSearches.length > 0);
        setToSuggestions(stationOptionsRef.current.slice(0, 8));
      }
      setShowToDropdown(true);
    }
  };

  const swapLocations = () => {
    setFormData({
      ...formData,
      from: formData.to,
      to: formData.from,
      fromId: formData.toId,
      toId: formData.fromId,
      fromSearchCity: formData.toSearchCity,
      toSearchCity: formData.fromSearchCity,
    });
  };

  const handleQuickDate = (type) => {
    const selected = dateOptions.find((option) => option.key === type)?.value || today;
    setFormData({ ...formData, date: selected });
  };

  // Handle selecting a recent search
  const handleSelectRecentSearch = (search, field) => {
    if (field === "from") {
      const fromStationInfo = getStationData(search.from);
      const toStationInfo = getStationData(search.to);
      setFormData({
        ...formData,
        from: search.from,
        to: search.to,
        fromId: search.fromId || fromStationInfo?.stationId || "",
        toId: search.toId || toStationInfo?.stationId || "",
        fromSearchCity: search.fromSearchCity || fromStationInfo?.searchCity || search.from,
        toSearchCity: search.toSearchCity || toStationInfo?.searchCity || search.to,
      });
      setShowFromDropdown(false);
      setShowRecentFrom(false);
    } else {
      const toStationInfo = getStationData(search.to);
      setFormData({
        ...formData,
        to: search.to,
        toId: search.toId || toStationInfo?.stationId || "",
        toSearchCity: search.toSearchCity || toStationInfo?.searchCity || search.to,
      });
      setShowToDropdown(false);
      setShowRecentTo(false);
    }
  };

  const handleSearch = async () => {
    if (formData.from && formData.to && formData.date) {
      const { map } = await ensureStationsReady();
      const extractIataCode = (value) => {
        const text = value.trim().toUpperCase();
        return text.match(/\(([A-Z]{3})\)$/)?.[1] || text.match(/^[A-Z]{3}$/)?.[0] || '';
      };
      const fromStationInfo = getStationData(formData.from) || map.get(normalizeKey(formData.from));
      const toStationInfo = getStationData(formData.to) || map.get(normalizeKey(formData.to));
      const typedFromCode = extractIataCode(formData.from);
      const typedToCode = extractIataCode(formData.to);
      const fromId = formData.fromId || fromStationInfo?.stationId || (mode === 'flight' ? typedFromCode : '');
      const toId = formData.toId || toStationInfo?.stationId || (mode === 'flight' ? typedToCode : '');
      const fromSearchCity = formData.fromSearchCity || fromStationInfo?.searchCity || getCorrectedCity(formData.from);
      const toSearchCity = formData.toSearchCity || toStationInfo?.searchCity || getCorrectedCity(formData.to);

      if (mode === 'flight') {
        if (!fromId || !toId) {
          setPopup({ show: true, message: "Please select airports or enter valid 3-letter IATA codes" });
          return;
        }
      } else if (!fromStationInfo || !toStationInfo) {
        setPopup({ show: true, message: "Please select valid cities from the dropdown" });
        return;
      }

      const searchData = {
        ...formData,
        fromId,
        toId,
        fromSearchCity,
        toSearchCity,
        seatPreference,
        busTypes: seatPreference ? [seatPreference] : [],
      };
      // Save to recent searches
      saveRecentSearch(formData.from, formData.to, fromId, toId, fromSearchCity, toSearchCity);
      onSearch(searchData);
    } else {
      setPopup({ show: true, message: "Please fill in From, To locations and Date" });
    }
  };

  return (
    <div className={`search-bus-wrapper ${compact ? 'compact' : ''}`}>
      <div className="search-container-figma">
        {!compact && (
          <div className="search-module-header">
            <div className="search-heading-copy">
              <span className="search-eyebrow">Bus Ticket Booking</span>
              <h2>Search bus tickets</h2>
            </div>
            <div className={`search-module-status ${stationNotice ? 'is-notice' : ''}`} aria-label="Live booking assurance">
              <span className="status-dot" />
              {stationNotice || 'Live fares and seat availability'}
            </div>
          </div>
        )}

        <div className="search-card-figma">
          <div className="search-main-row">
            {/* Origin - Audit Fix: Keep fixed labels */}
            <div className="search-field-figma route-field origin-field" ref={fromRef}>
              <img src={fromIcon} alt="Origin" className="field-icon-img" />
              <div className="field-content-figma">
                <span className="field-label-figma">Origin {mode === 'flight' ? 'Airport' : 'City'}</span>
                <input
                  type="text"
                  name="from"
                  placeholder={mode === 'flight' ? 'From Airport or City' : 'Enter Source'}
                  value={formData.from}
                  onChange={handleChange}
                  onFocus={() => handleFocus("from")}
                  autoComplete="off"
                  className="field-input-figma"
                />
              </div>
              {showFromDropdown && (fromSuggestions.length > 0 || showRecentFrom) && (
                <div className="city-dropdown city-dropdown-origin">
                  {showRecentFrom && recentSearches.length > 0 && (
                    <div className="recent-searches-section">
                      <div className="dropdown-section-header">
                        <Clock3 size={14} aria-hidden="true" />
                        Recent Searches
                      </div>
                      <ul className="recent-list">
                        {recentSearches.map((search, index) => (
                          <li key={`recent-${index}`} onClick={() => handleSelectRecentSearch(search, "from")}>
                            <span className="recent-route">{search.from} → {search.to}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {fromSuggestions.length > 0 && (
                    <div className="suggestions-section">
                      {showRecentFrom && <div className="dropdown-section-header">Popular Cities</div>}
                      <ul className="suggestions-list">
                        {fromSuggestions.map((city, index) => (
                          <li key={`${city.displayName}-${index}`} onClick={() => handleSelectCity("from", city)}>
                            <span className={`suggestion-icon ${city.kind === 'city' ? 'city' : 'boarding'}`} aria-hidden="true">
                              {city.kind === 'city' ? <Building2 size={18} /> : <MapPin size={18} />}
                            </span>
                            <span className="suggestion-copy">
                              <b>{city.displayName}</b>
                              <small>{city.subtitle || city.searchCity}</small>
                            </span>
                            <span className="suggestion-kind">{city.kind === 'city' ? 'City' : 'Stop'}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Swap Button - Audit Fix: Added tooltip for better clarity */}
            <button
              className="swap-btn-figma"
              onClick={swapLocations}
              type="button"
              title="Swap origin and destination"
              aria-label="Swap origin and destination cities"
            >
              <ArrowLeftRight className="swap-icon" size={18} strokeWidth={2.4} aria-hidden="true" />
            </button>

            {/* Destination - Audit Fix: Keep fixed labels */}
            <div className="search-field-figma route-field destination-field" ref={toRef}>
              <img src={toIcon} alt="Destination" className="field-icon-img" />
              <div className="field-content-figma">
                <span className="field-label-figma">Destination {mode === 'flight' ? 'Airport' : 'City'}</span>
                <input
                  type="text"
                  name="to"
                  placeholder={mode === 'flight' ? 'To Airport or City' : 'Enter Destination'}
                  value={formData.to}
                  onChange={handleChange}
                  onFocus={() => handleFocus("to")}
                  autoComplete="off"
                  className="field-input-figma"
                />
              </div>
              {showToDropdown && (toSuggestions.length > 0 || showRecentTo) && (
                <div className="city-dropdown city-dropdown-destination">
                  {showRecentTo && recentSearches.length > 0 && (
                    <div className="recent-searches-section">
                      <div className="dropdown-section-header">
                        <Clock3 size={14} aria-hidden="true" />
                        Recent Searches
                      </div>
                      <ul className="recent-list">
                        {recentSearches.map((search, index) => (
                          <li key={`recent-${index}`} onClick={() => handleSelectRecentSearch(search, "to")}>
                            <span className="recent-route">{search.from} → {search.to}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {toSuggestions.length > 0 && (
                    <div className="suggestions-section">
                      {showRecentTo && <div className="dropdown-section-header">Popular Cities</div>}
                      <ul className="suggestions-list">
                        {toSuggestions.map((city, index) => (
                          <li key={`${city.displayName}-${index}`} onClick={() => handleSelectCity("to", city)}>
                            <span className={`suggestion-icon ${city.kind === 'city' ? 'city' : 'boarding'}`} aria-hidden="true">
                              {city.kind === 'city' ? <Building2 size={18} /> : <MapPin size={18} />}
                            </span>
                            <span className="suggestion-copy">
                              <b>{city.displayName}</b>
                              <small>{city.subtitle || city.searchCity}</small>
                            </span>
                            <span className="suggestion-kind">{city.kind === 'city' ? 'City' : 'Stop'}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Date Section - Audit Fix: Better grouping of date and quick buttons */}
            <div className="date-section-wrapper">
              <div className="quick-dates-figma">
                {dateOptions.map((option) => {
                  const tile = formatDateTile(option.value, option.helper);
                  return (
                    <button
                      key={option.key}
                      type="button"
                      className={`quick-date-btn-figma ${formData.date === option.value ? "active" : ""}`}
                      onClick={() => handleQuickDate(option.key)}
                    >
                      <strong>{tile.day}</strong>
                      <span>{tile.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="search-field-figma date-field" onClick={() => dateRef.current?.showPicker()}>
                <CalendarDays size={20} aria-hidden="true" className="calendar-field-icon" />
                <div className="field-content-figma">
                  <span className="field-label-figma">Departure Date</span>
                  <span className="field-value-figma">{formatDate(formData.date)}</span>
                  <input
                    ref={dateRef}
                    type="date"
                    name="date"
                    value={formData.date}
                    min={today}
                    onChange={handleChange}
                    className="hidden-date-input"
                  />
                </div>
              </div>
            </div>

            {/* Search Button - Audit Fix: Made more prominent */}
            <button className="search-btn-figma search-btn-prominent" onClick={handleSearch} type="button" disabled={stationsLoading}>
              <Search size={20} strokeWidth={2.7} aria-hidden="true" />
              <span>{stationsLoading ? 'Loading stations…' : mode === 'flight' ? 'Search Flights' : 'Search Buses'}</span>
            </button>
          </div>

          {!compact && mode === 'bus' && (
            <div className="seat-preference-row" aria-label="Seat preference">
              <span className="seat-preference-label">Seat Preference</span>
              <div className="seat-preference-options">
                {seatPreferenceOptions.map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    type="button"
                    className={`seat-preference-chip ${seatPreference === key ? 'active' : ''}`}
                    onClick={() => setSeatPreference((current) => current === key ? '' : key)}
                  >
                    <Icon size={17} aria-hidden="true" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {!compact && (
          <div className="search-assurance-row" aria-label="Booking assurances">
            <span><ShieldCheck size={16} /> Secure checkout</span>
            <span><BadgeCheck size={16} /> Verified operators</span>
            <span><Clock3 size={16} /> Instant confirmation</span>
          </div>
        )}
      </div>

      {/* Validation Popup */}
      {popup.show && (
        <div className="popup-overlay" onClick={() => setPopup({ show: false, message: "" })}>
          <div className="popup-container" onClick={(e) => e.stopPropagation()}>
            <div className="popup-icon">⚠️</div>
            <p className="popup-message">{popup.message}</p>
            <button 
              className="popup-btn" 
              onClick={() => setPopup({ show: false, message: "" })}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchBus;
