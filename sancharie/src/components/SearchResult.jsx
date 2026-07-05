import React, { useMemo, useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import "./SearchResult.css";
import { MdKeyboardArrowRight } from "react-icons/md";
import { SiGooglemaps } from "react-icons/si";
import { 
  MapPin, 
  Bus, 
  Clock, 
  Shield, 
  Star, 
  Users, 
  X, 
  Thermometer, 
  UserCheck, 
  Plug, 
  Bed,
  Droplets,
  DoorOpen,
  Lamp,
  Cross,
  Hammer,
  Hotel,
  FlameKindling,
  Navigation,
  ChevronRight,
  Info,
  AlertTriangle,
  Home,
  RefreshCw,
  SlidersHorizontal,
  Plane,
  ArrowLeftRight,
  CalendarDays,
  ChevronDown,
  Search,
  Briefcase,
  CircleCheck,
} from "lucide-react";
import SelectSeat from "./selectseat";
import NoResult from "./noresult";
import MiniSeatPreview, { clearSeatLayoutCache, prefetchAllSeatLayouts, subscribeSeatLayout, getMinFareFromCache } from "./MiniSeatPreview";
import Logo from "../assets/logosan.svg";
import SearchBus from "./SearchBus";
import { useBooking } from "../context/BookingContext";
import { bus as busApi, flights as flightApi } from "../services/api";

/* -------------- HELPERS ---------------- */
const timeBucket = (timeString) => {
  if (!timeString) return "before10";
  
  // Handle ETS format "01:30 AM" or "01:30:00 AM"
  if (typeof timeString === 'string' && timeString.includes(':')) {
    const match = timeString.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)/i);
    if (match) {
      let h = parseInt(match[1]);
      const ampm = match[4].toUpperCase();
      if (ampm === 'PM' && h !== 12) h += 12;
      if (ampm === 'AM' && h === 12) h = 0;
      
      if (h < 10) return "before10";
      if (h < 17) return "10to5";
      if (h < 23) return "5to11";
      return "after11";
    }
  }
  
  // Fallback for ISO date strings
  const date = new Date(timeString);
  if (!isNaN(date.getTime())) {
    const h = date.getHours();
    if (h < 10) return "before10";
    if (h < 17) return "10to5";
    if (h < 23) return "5to11";
    return "after11";
  }
  
  return "before10";
};

const formatTime = (dateString) => {
  if (!dateString) return "";
  
  // If it's already in "01:30 AM" format, return as-is (or format consistently)
  if (typeof dateString === 'string' && dateString.includes(':')) {
    const match = dateString.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)/i);
    if (match) {
      const hours = match[1].padStart(2, '0');
      const minutes = match[2];
      const ampm = match[4].toUpperCase();
      return `${hours}:${minutes} ${ampm}`;
    }
  }
  
  // Fallback for ISO date strings
  const date = new Date(dateString);
  if (!isNaN(date.getTime())) {
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  }
  
  return dateString || "";
};

const formatDate = (dateString) => {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });
};

const formatFlightDate = (dateString) => {
  if (!dateString) return "";
  const dateParts = String(dateString).match(/^(\d{4})-(\d{2})-(\d{2})/);
  const date = dateParts
    ? new Date(Number(dateParts[1]), Number(dateParts[2]) - 1, Number(dateParts[3]))
    : new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
};

const formatFlightPrice = (value) => {
  const amount = Number(value || 0);
  return amount.toLocaleString("en-IN", {
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  });
};

const getAirportCode = (value) => {
  const text = String(value || "").trim();
  return text.match(/\(([A-Z]{3})\)$/)?.[1] || text.match(/^([A-Z]{3})\b/)?.[1] || text.slice(0, 3).toUpperCase();
};

const cabinLabels = {
  1: "Economy",
  2: "Premium Economy",
  3: "Business",
  4: "First Class",
};

const calculateDuration = (departure, arrival, durationInMins) => {
  // If durationInMins is provided directly (from ETS API), use it
  if (durationInMins && typeof durationInMins === 'number') {
    const hours = Math.floor(durationInMins / 60);
    const minutes = durationInMins % 60;
    return `${hours}:${minutes.toString().padStart(2, '0')} hrs`;
  }
  
  // Fallback calculation from departure/arrival times
  if (!departure || !arrival) return "";
  const start = new Date(departure);
  const end = new Date(arrival);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return "";
  
  const diff = Math.abs(end - start);
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}:${minutes.toString().padStart(2, '0')} hrs`;
};

/* Small component that subscribes to seat layout cache and shows min fare */
function BusPriceDisplay({ bus }) {
  const [minFare, setMinFare] = useState(() => getMinFareFromCache(bus.ResultIndex));

  useEffect(() => {
    if (minFare != null) return; // Already have it
    const unsubscribe = subscribeSeatLayout(bus.ResultIndex, (seats) => {
      if (!seats || !Array.isArray(seats)) return;
      let min = Infinity;
      for (const seat of seats) {
        if (seat.available !== true) continue;
        const fare = parseFloat(seat.totalFareWithTaxes) || parseFloat(seat.fare) || 0;
        if (fare > 0 && fare < min) min = fare;
      }
      if (min !== Infinity) setMinFare(Math.round(min));
    });
    return unsubscribe;
  }, [bus.ResultIndex, minFare]);

  const displayPrice = minFare || bus.BusPrice?.PublishedPrice;
  const oldPrice = bus.BusPrice?.BasePrice || null;
  const showOld = oldPrice && displayPrice && oldPrice > displayPrice;

  return (
    <div className="price-row">
      {showOld && <span className="old-price">₹{oldPrice}</span>}
      <span className="current-price">₹{displayPrice}</span>
    </div>
  );
}

export default function SearchResult({ searchParams, onSearch, mode = 'bus' }) {
  const { state, actions } = useBooking();
  const navigate = useNavigate();
  const bookingActionsRef = useRef(actions);
  
  // Get session state from context
  const { sessionExpired } = state;
  
  /* ---------------- LOCAL STATES ---------------- */
  const [buses, setBuses] = useState([]);
  const [flights, setFlights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTokenId, setSearchTokenId] = useState(null);
  const [visibleCount, setVisibleCount] = useState(6); // Show 6 buses initially
  const [bookingFlightId, setBookingFlightId] = useState(null);
  const [flightBookingError, setFlightBookingError] = useState('');
  const [flightSort, setFlightSort] = useState('best');
  const [flightStopsFilter, setFlightStopsFilter] = useState('any');
  const [selectedFlightAirlines, setSelectedFlightAirlines] = useState([]);
  const [expandedFlightId, setExpandedFlightId] = useState(null);
  const [summaryOpen, setSummaryOpen] = useState(false);

  /* ---------------- FILTER STATES ---------------- */
  const [maxPrice, setMaxPrice] = useState(5000);
  const [selectedBusTypes, setSelectedBusTypes] = useState([]);
  const [selectedTimes, setSelectedTimes] = useState([]);
  const [selectedOperators, setSelectedOperators] = useState([]);
  const [selectedBoarding, setSelectedBoarding] = useState([]);
  const [selectedDropping, setSelectedDropping] = useState([]);
  const [operatorSearch, setOperatorSearch] = useState("");
  const [boardingSearch, setBoardingSearch] = useState("");
  const [droppingSearch, setDroppingSearch] = useState("");
  
  /* ----------- SELECTSEAT INLINE STATE ----------- */
  const [selectedBus, setSelectedBus] = useState(null);
  const seatLayoutRef = useRef(null);
  
  /* ----------- BUS DETAILS MODAL STATE ----------- */
  const [modalOpen, setModalOpen] = useState(false);
  const [modalBus, setModalBus] = useState(null);
  const [modalTab, setModalTab] = useState('boarding'); // 'boarding', 'cancellation', 'amenities', 'policy'
  const [showAllBoardingPoints, setShowAllBoardingPoints] = useState(false);
  const [showAllDroppingPoints, setShowAllDroppingPoints] = useState(false);
  
  /* ----------- DATE SELECTOR STATE ----------- */
  const [selectedDateIndex, setSelectedDateIndex] = useState(0); // Default to first date (search date)
  const [dateOffset, setDateOffset] = useState(0); // For navigation
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  useEffect(() => {
    bookingActionsRef.current = actions;
  }, [actions]);

  /* ---------------- FETCH BUSES ON MOUNT ---------------- */
  useEffect(() => {
    const fetchBuses = async () => {
      const bookingActions = bookingActionsRef.current;
      if (!searchParams?.from || !searchParams?.to || !searchParams?.date) {
        setError("Invalid search parameters");
        setLoading(false);
        return;
      }

      if (mode === 'flight') {
        setError(null);
        setLoading(true);
        setVisibleCount(6);
        setBuses([]);
        setSearchTokenId(null);
        setFlights([]);
        setFlightSort('best');
        setFlightStopsFilter(searchParams.directFlight ? 'direct' : 'any');
        setSelectedFlightAirlines([]);
        setExpandedFlightId(null);

        try {
          const result = await flightApi.search({
            origin: searchParams.fromId || searchParams.from,
            destination: searchParams.toId || searchParams.to,
            date: searchParams.date,
            airSegments: searchParams.airSegments,
            adult: searchParams.adult || 1,
            child: searchParams.child || 0,
            infant: searchParams.infant || 0,
            cabinClass: searchParams.cabinClass || 1,
            journeyType: searchParams.journeyType || 1,
            preferredCarriers: searchParams.preferredCarriers || [],
            directFlight: Boolean(searchParams.directFlight),
          });
          const flightResults = result.flights || [];
          setFlights(flightResults);
          setSearchTokenId(result.searchTokenId);
          bookingActions.setSearchToken(result.searchTokenId);
          bookingActions.setSearchParams(searchParams);
          bookingActions.setSearchResults(flightResults);
          bookingActions.startSession();
        } catch (err) {
          console.error('Flight search error:', err);
          setError(err.message || 'Failed to search flights');
        } finally {
          setLoading(false);
        }
        return;
      }

      setFlights([]);
      try {
        setLoading(true);
        setError(null);
        setVisibleCount(6); // Reset to 6 when new search
        
        // Clear seat layout cache when search params change
        clearSeatLayoutCache();
        
        // ETS API expects city names (sourceCity, destinationCity)
        const result = await busApi.search(
          searchParams.fromSearchCity || searchParams.fromCity || searchParams.from,
          searchParams.toSearchCity || searchParams.toCity || searchParams.to,
          searchParams.date
        );
        
        console.log("Search API returned searchTokenId:", result.searchTokenId);
        
        // Store search token locally and in context
        setSearchTokenId(result.searchTokenId);
        bookingActions.setSearchToken(result.searchTokenId);
        bookingActions.setSearchParams(searchParams);
        bookingActions.setSearchResults(result.results);
        
        // START SESSION TIMER when search API returns results
        bookingActions.startSession();
        
        setBuses(result.results || []);
        
        // PREFETCH all seat layouts immediately for instant loading
        if (result.results?.length > 0) {
          console.log("Starting seat layout prefetch for", result.results.length, "buses");
          prefetchAllSeatLayouts(result.results);
        }
      } catch (err) {
        console.error("Search error:", err);
        setError(err.message || "Failed to search buses");
      } finally {
        setLoading(false);
      }
    };

    fetchBuses();
  }, [searchParams, mode]);

  // Handle session expiration - go to home
  const handleGoHome = () => {
    actions.resetSession();
    navigate(mode === 'flight' ? '/?mode=flight' : '/');
  };

  // Handle refresh search
  const handleRefreshSearch = () => {
    actions.resetSession();
    // Re-fetch buses (will start new session)
    window.location.reload();
  };

  const handleBookFlight = async (flight) => {
    if (!flight?.searchTokenId || !flight?.resultIndex) {
      setFlightBookingError('This fare is missing booking information. Please search again.');
      return;
    }

    setBookingFlightId(flight.id);
    setFlightBookingError('');

    try {
      let fareRules = null;
      let ssr = null;
      const preparationWarnings = [];

      try {
        fareRules = await flightApi.getFareRules(flight.searchTokenId, flight.resultIndex);
      } catch (fareRuleError) {
        preparationWarnings.push(fareRuleError.message || 'Fare rules could not be loaded');
      }

      const confirmation = await flightApi.confirmFare(flight.searchTokenId, flight.resultIndex);

      try {
        ssr = await flightApi.getSSR(flight.searchTokenId, flight.resultIndex);
      } catch (ssrError) {
        preparationWarnings.push(ssrError.message || 'Seat and meal options could not be loaded');
      }

      navigate('/flight-booking', {
        state: {
          flight,
          searchParams,
          fareRules,
          confirmation,
          ssr,
          preparationWarnings,
        },
      });
    } catch (bookingError) {
      setFlightBookingError(bookingError.message || 'This fare could not be confirmed. Please choose another flight.');
    } finally {
      setBookingFlightId(null);
    }
  };

  /* ---------------- EXTRACT UNIQUE VALUES FOR FILTERS ---------------- */
  const uniqueOperators = useMemo(() => {
    return [...new Set(buses.map((bus) => bus.TravelName).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));
  }, [buses]);

  const filteredOperators = useMemo(() => {
    const query = operatorSearch.trim().toLowerCase();
    if (!query) return uniqueOperators;
    return uniqueOperators.filter((operator) => operator.toLowerCase().includes(query));
  }, [uniqueOperators, operatorSearch]);

  const uniqueBoardingPoints = useMemo(() => {
    const points = new Set();
    buses.forEach((bus) => {
      bus.BoardingPointsDetails?.forEach((bp) => {
        points.add(bp.CityPointName);
      });
    });
    return [...points];
  }, [buses]);

  const uniqueDroppingPoints = useMemo(() => {
    const points = new Set();
    buses.forEach((bus) => {
      bus.DroppingPointsDetails?.forEach((dp) => {
        points.add(dp.CityPointName);
      });
    });
    return [...points];
  }, [buses]);

  /* ---------------- FILTER LOGIC ---------------- */
  const filteredBuses = useMemo(() => {
    return buses.filter((bus) => {
      // Price
      const price = bus.BusPrice?.PublishedPrice || 0;
      if (price > maxPrice) return false;

      // Bus Type (AC/Non-AC, Sleeper/Seater)
      if (selectedBusTypes.length > 0) {
        const busType = bus.BusType?.toLowerCase() || "";
        const hasMatch = selectedBusTypes.some((t) => {
          if (t === "AC") return busType.includes("a/c") || busType.includes("ac");
          if (t === "Non-AC") return busType.includes("non a/c") || busType.includes("non-ac") || (!busType.includes("a/c") && !busType.includes("ac"));
          if (t === "Sleeper") return busType.includes("sleeper");
          if (t === "Seating") return busType.includes("seater") || busType.includes("seat");
          return false;
        });
        if (!hasMatch) return false;
      }

      // Departure Time
      if (selectedTimes.length > 0) {
        const bucket = timeBucket(bus.DepartureTime);
        if (!selectedTimes.includes(bucket)) return false;
      }

      // Operator
      if (selectedOperators.length > 0) {
        if (!selectedOperators.includes(bus.TravelName)) return false;
      }

      // Boarding Point
      if (selectedBoarding.length > 0) {
        const hasBoardingPoint = bus.BoardingPointsDetails?.some((bp) =>
          selectedBoarding.includes(bp.CityPointName)
        );
        if (!hasBoardingPoint) return false;
      }

      // Dropping Point
      if (selectedDropping.length > 0) {
        const hasDroppingPoint = bus.DroppingPointsDetails?.some((dp) =>
          selectedDropping.includes(dp.CityPointName)
        );
        if (!hasDroppingPoint) return false;
      }

      return true;
    });
  }, [buses, maxPrice, selectedBusTypes, selectedTimes, selectedOperators, selectedBoarding, selectedDropping]);

  /* Calculate bus price range and stats */
  const busPriceRange = useMemo(() => {
    const prices = filteredBuses
      .map((bus) => bus.BusPrice?.PublishedPrice || 0)
      .filter((price) => price > 0);
    return {
      min: prices.length ? Math.min(...prices) : 0,
      max: prices.length ? Math.max(...prices) : 0,
    };
  }, [filteredBuses]);

  const flightPriceRange = useMemo(() => {
    const prices = flights.map((flight) => Number(flight.price || 0)).filter((price) => price > 0);
    return {
      min: prices.length ? Math.min(...prices) : 0,
      max: prices.length ? Math.max(...prices) : 0,
    };
  }, [flights]);

  const flightDurationRange = useMemo(() => {
    const durations = flights.map((flight) => Number(flight.durationMinutes || 0)).filter((duration) => duration > 0);
    return {
      min: durations.length ? Math.min(...durations) : 0,
    };
  }, [flights]);

  const flightStopStats = useMemo(() => {
    const getMinPrice = (list) => {
      const prices = list.map((flight) => Number(flight.price || 0)).filter((price) => price > 0);
      return prices.length ? Math.min(...prices) : 0;
    };

    const directFlights = flights.filter((flight) => Number(flight.stopsCount || 0) === 0);
    const oneStopFlights = flights.filter((flight) => Number(flight.stopsCount || 0) <= 1);

    return {
      any: { count: flights.length, minPrice: getMinPrice(flights) },
      direct: { count: directFlights.length, minPrice: getMinPrice(directFlights) },
      oneStop: { count: oneStopFlights.length, minPrice: getMinPrice(oneStopFlights) },
    };
  }, [flights]);

  const flightAirlineOptions = useMemo(() => {
    const airlineMap = new Map();
    flights.forEach((flight) => {
      const name = flight.carrier || 'Airline';
      const current = airlineMap.get(name) || { name, count: 0, minPrice: 0 };
      const price = Number(flight.price || 0);
      airlineMap.set(name, {
        name,
        count: current.count + 1,
        minPrice: !current.minPrice || (price && price < current.minPrice) ? price : current.minPrice,
      });
    });
    return [...airlineMap.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [flights]);

  const filteredFlights = useMemo(() => {
    const filtered = flights.filter((flight) => {
      const stopsCount = Number(flight.stopsCount || 0);
      if (flightStopsFilter === 'direct' && stopsCount !== 0) return false;
      if (flightStopsFilter === 'oneStop' && stopsCount > 1) return false;
      if (selectedFlightAirlines.length > 0 && !selectedFlightAirlines.includes(flight.carrier || 'Airline')) {
        return false;
      }
      return true;
    });

    return [...filtered].sort((a, b) => {
      const priceA = Number(a.price || Number.MAX_SAFE_INTEGER);
      const priceB = Number(b.price || Number.MAX_SAFE_INTEGER);
      const durationA = Number(a.durationMinutes || Number.MAX_SAFE_INTEGER);
      const durationB = Number(b.durationMinutes || Number.MAX_SAFE_INTEGER);
      const stopsA = Number(a.stopsCount || 0);
      const stopsB = Number(b.stopsCount || 0);

      if (flightSort === 'cheapest') return priceA - priceB || durationA - durationB;
      if (flightSort === 'fastest') return durationA - durationB || priceA - priceB;

      return stopsA - stopsB || priceA - priceB || durationA - durationB;
    });
  }, [flights, flightStopsFilter, selectedFlightAirlines, flightSort]);

  const visibleFlights = filteredFlights.slice(0, visibleCount);

  const toggleFlightAirline = (airlineName) => {
    setSelectedFlightAirlines((current) =>
      current.includes(airlineName)
        ? current.filter((name) => name !== airlineName)
        : [...current, airlineName]
    );
  };

  /* ---------------- DATE NAVIGATION ---------------- */
  const generateDateRange = () => {
    const dates = [];
    
    // Parse the search date correctly to avoid timezone issues
    let startDate;
    if (searchParams?.date) {
      // Parse YYYY-MM-DD format correctly in local timezone
      const [year, month, day] = searchParams.date.split('-').map(Number);
      startDate = new Date(year, month - 1, day); // month is 0-indexed
    } else {
      startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
    }
    
    // Start from dateOffset days before/after the search date
    for (let i = 0; i < 7; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i + dateOffset);
      
      // Format date as YYYY-MM-DD in local timezone
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      
      dates.push({
        date: dateStr,
        day: date.toLocaleDateString("en-US", { weekday: "long" }),
        display: date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }).toUpperCase(),
        fullDate: date,
      });
    }
    return dates;
  };

  const dateRange = generateDateRange();

  const handleDateSelect = (index) => {
    setSelectedDateIndex(index);
    const selectedDate = dateRange[index];
    // Trigger a new search with the selected date
    // ETS API uses city names, not IDs
    if (selectedDate && searchParams?.from && searchParams?.to) {
      const newSearchParams = {
        ...searchParams,
        date: selectedDate.date,
      };
      // Refresh the search
      const fetchNewBuses = async () => {
        try {
          setLoading(true);
          setError(null);
          setVisibleCount(6); // Reset to 6 when date changes
          
          // Clear seat layout cache when date changes
          clearSeatLayoutCache();
          
          // ETS API expects city names (sourceCity, destinationCity)
          const result = await busApi.search(
            searchParams.fromSearchCity || searchParams.fromCity || searchParams.from,
            searchParams.toSearchCity || searchParams.toCity || searchParams.to,
            selectedDate.date
          );
          setSearchTokenId(result.searchTokenId);
          actions.setSearchToken(result.searchTokenId);
          actions.setSearchParams(newSearchParams);
          actions.setSearchResults(result.results);
          setBuses(result.results || []);
          
          // PREFETCH all seat layouts immediately for instant loading
          if (result.results?.length > 0) {
            console.log("Starting seat layout prefetch for", result.results.length, "buses");
            prefetchAllSeatLayouts(result.results);
          }
        } catch (err) {
          console.error("Search error:", err);
          setError(err.message || "Failed to search buses");
        } finally {
          setLoading(false);
        }
      };
      fetchNewBuses();
    }
  };

  const handleDateNavPrev = () => {
    setDateOffset(prev => prev - 7);
    setSelectedDateIndex(0);
  };

  const handleDateNavNext = () => {
    setDateOffset(prev => prev + 7);
    setSelectedDateIndex(0);
  };

  const handleBusSelect = (bus) => {
    const isClosing = selectedBus === bus.ResultIndex;
    setSelectedBus(isClosing ? null : bus.ResultIndex);
    actions.setSelectedBus(bus);
    if (!isClosing) {
      // Scroll to seat layout after it renders
      setTimeout(() => {
        seatLayoutRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  };

  /* ----------- MODAL HANDLERS ----------- */
  const openBusDetailsModal = (bus, tab) => {
    setModalBus(bus);
    setModalTab(tab);
    setShowAllBoardingPoints(false);
    setShowAllDroppingPoints(false);
    setModalOpen(true);
    document.body.style.overflow = 'hidden'; // Prevent background scroll
  };

  const closeBusDetailsModal = () => {
    setModalOpen(false);
    setModalBus(null);
    document.body.style.overflow = 'auto';
  };

  /* ----------- AMENITIES DATA ----------- */
  const defaultAmenities = [
    { icon: 'temperature', name: 'Temperature checks' },
    { icon: 'staff', name: 'Trained Staff' },
    { icon: 'charging', name: 'Charging Point' },
    { icon: 'blanket', name: 'Blanket' },
    { icon: 'bottle', name: 'Water Bottle' },
    { icon: 'emergency', name: 'Emergency Exit' },
    { icon: 'reading', name: 'Reading Light' },
    { icon: 'firstaid', name: 'First Aid Box' },
    { icon: 'hammer', name: 'Hammer' },
    { icon: 'pillow', name: 'Pillows' },
    { icon: 'fire', name: 'Fire Extinguisher' },
    { icon: 'gps', name: 'GPS Tracking' },
  ];

  const getAmenityIcon = (iconName) => {
    const iconMap = {
      'temperature': <Thermometer size={20} />,
      'staff': <UserCheck size={20} />,
      'charging': <Plug size={20} />,
      'blanket': <Bed size={20} />,
      'bottle': <Droplets size={20} />,
      'emergency': <DoorOpen size={20} />,
      'reading': <Lamp size={20} />,
      'firstaid': <Cross size={20} />,
      'hammer': <Hammer size={20} />,
      'pillow': <Hotel size={20} />,
      'fire': <FlameKindling size={20} />,
      'gps': <Navigation size={20} />,
    };
    return iconMap[iconName] || <Shield size={20} />;
  };

  /* ---------------- UI ---------------- */
  
  /* ---------------- SESSION EXPIRED POPUP ---------------- */
  if (sessionExpired) {
    return (
      <div className="sr-page">
        <div className="session-expired-overlay">
          <div className="session-expired-popup">
            <div className="session-expired-icon">
              <AlertTriangle size={56} strokeWidth={1.5} />
            </div>
            <h2>Session Expired</h2>
            <p>Your search session has expired after 10 minutes of inactivity. Please start a new search to view the latest bus availability and prices.</p>
            <div className="session-expired-actions">
              <button className="session-btn-primary" onClick={handleGoHome}>
                <Home size={18} />
                Go to Home Page
              </button>
              <button className="session-btn-secondary" onClick={handleRefreshSearch}>
                <RefreshCw size={18} />
                Search Again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="sr-page">
        <div className="sr-loading">
          <div className="logo-loader">
            <img src={Logo} alt="Sancharie" className="loader-logo" />
            <div className="loader-ring"></div>
          </div>
          <p className="loader-text">
            {mode === 'flight' ? 'Searching for flights...' : 'Searching for buses...'}
          </p>
          <p className="loader-subtext">{searchParams?.from} → {searchParams?.to}</p>
        </div>
      </div>
    );
  }

  if (error) {
    const isInvalidCity = error.toLowerCase().includes('city name') || error.toLowerCase().includes('source or destination');
    return (
      <div className="sr-page">
        <div className="sr-error">
          <div className="sr-error-icon">
            <AlertTriangle size={48} strokeWidth={1.5} />
          </div>
          <h2 className="sr-error-title">
            {isInvalidCity ? 'Route Not Found' : 'Something Went Wrong'}
          </h2>
          <p className="sr-error-message">
            {isInvalidCity
              ? "We couldn't recognize the city names you entered. Please check the spelling and try again."
              : error}
          </p>
          {searchParams?.from && searchParams?.to && (
            <div className="sr-error-route">
              <span>{searchParams.from}</span>
              <span className="sr-error-route-arrow">→</span>
              <span>{searchParams.to}</span>
            </div>
          )}
          <div className="sr-error-tips">
            <p className="sr-error-tips-title">Suggestions</p>
            <ul>
              <li>Double-check your source and destination city names</li>
              <li>Use the search bar suggestions to pick a valid city</li>
              <li>Try a different date or route</li>
            </ul>
          </div>
          <div className="sr-error-actions">
            <button className="sr-error-btn-home" onClick={handleGoHome}>
              <Home size={16} />
              Go Home
            </button>
            <button className="sr-error-btn-retry" onClick={() => window.location.reload()}>
              <RefreshCw size={16} />
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ---------------- NO BUSES FOUND ---------------- */
  if (!loading && mode === 'flight') {
    if (flights.length === 0) {
      return (
        <div className="sr-page flight-result-page">
          <div className="flight-placeholder">
            <img src={Logo} alt="Sancharie" className="flight-placeholder-logo" />
            <h2>No flight results found</h2>
            <p>
              We could not find flights for this route right now. Please try another date or route.
            </p>
            <button className="flight-placeholder-button" onClick={handleGoHome}>
              Back to Home
            </button>
          </div>
        </div>
      );
    }

    const firstFlight = flights[0] || {};
    const journeyType = Number(searchParams?.journeyType || 1);
    const flightDateLabel = formatFlightDate(searchParams?.date || firstFlight.departureTime);
    const fromCode = searchParams?.fromId || firstFlight.from || getAirportCode(searchParams?.from);
    const toCode = searchParams?.toId || firstFlight.to || getAirportCode(searchParams?.to);
    const travellerCount =
      Number(searchParams?.adult || 1) + Number(searchParams?.child || 0) + Number(searchParams?.infant || 0);
    const activeFilterCount =
      (flightStopsFilter !== 'any' ? 1 : 0) + selectedFlightAirlines.length;

    const stopFilterOptions = [
      ['any', 'Any', flightStopStats.any],
      ['direct', 'Direct only', flightStopStats.direct],
      ['oneStop', '1 stop max', flightStopStats.oneStop],
    ];

    return (
      <div className="sr-page flight-results-page">
        <section className="flight-modify-panel">
          <div className="flight-search-types" aria-label="Trip type">
            {[
              [2, 'Round-trip'],
              [1, 'One-way'],
              [3, 'Multi-city'],
            ].map(([value, label]) => (
              <span className={`flight-search-type ${journeyType === value ? 'active' : ''}`} key={value}>
                <span className="flight-radio-dot" />
                {label}
              </span>
            ))}
            <span className="flight-cabin-chip">
              {cabinLabels[searchParams?.cabinClass || 1] || 'Economy'} <ChevronDown size={17} />
            </span>
            <button
              type="button"
              className={`flight-direct-toggle ${flightStopsFilter === 'direct' ? 'active' : ''}`}
              onClick={() => {
                setVisibleCount(6);
                setFlightStopsFilter((current) => current === 'direct' ? 'any' : 'direct');
              }}
            >
              <span />
              Direct flights only
            </button>
          </div>

          <div className="flight-modify-bar">
            <div className="flight-modify-field wide">
              <Plane size={22} />
              <span>
                <small>Leaving from</small>
                <b>{fromCode} {searchParams?.from || firstFlight.departureAirport || 'Origin'}</b>
              </span>
            </div>
            <button className="flight-swap-button" type="button" onClick={handleGoHome} aria-label="Edit route">
              <ArrowLeftRight size={23} />
            </button>
            <div className="flight-modify-field wide">
              <Plane size={22} />
              <span>
                <small>Going to</small>
                <b>{toCode} {searchParams?.to || firstFlight.arrivalAirport || 'Destination'}</b>
              </span>
            </div>
            <div className="flight-modify-field">
              <CalendarDays size={22} />
              <span>
                <small>Travel date</small>
                <b>{flightDateLabel || 'Select date'}</b>
              </span>
            </div>
            <div className="flight-modify-field">
              <Users size={22} />
              <span>
                <small>Travelers</small>
                <b>{travellerCount} traveller{travellerCount === 1 ? '' : 's'}</b>
              </span>
            </div>
            <button
              className="flight-modify-search"
              type="button"
              onClick={() => onSearch?.({ ...searchParams, directFlight: flightStopsFilter === 'direct' })}
            >
              <Search size={21} />
              Search
            </button>
          </div>
        </section>

        {flightBookingError && (
          <div className="flight-booking-error" role="alert">{flightBookingError}</div>
        )}

        <div className="flight-results-layout">
          <aside className="flight-filters-panel">
            <div className="flight-summary-card">
              <h3>Search summary</h3>
              <p>Get a quick overview of how stops and airlines affect fares for this search.</p>
              <button type="button" onClick={() => setSummaryOpen((open) => !open)}>
                <Star size={17} /> {summaryOpen ? 'Hide summary' : 'View summary'}
              </button>
              {summaryOpen && (
                <div className="flight-summary-breakdown">
                  <span><b>{flightStopStats.direct.count}</b> direct flights</span>
                  <span><b>₹{formatFlightPrice(flightPriceRange.min)}</b> lowest fare</span>
                  <span><b>{flightAirlineOptions.length}</b> airlines</span>
                </div>
              )}
            </div>

            <div className="flight-filter-heading">
              <h3>Filters</h3>
              <p>Showing {filteredFlights.length} of {flights.length} results</p>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setFlightStopsFilter('any');
                    setSelectedFlightAirlines([]);
                    setVisibleCount(6);
                  }}
                >
                  Clear all
                </button>
              )}
            </div>

            <div className="flight-filter-section">
              <h4>Stops</h4>
              {stopFilterOptions.map(([value, label, stats]) => (
                <button
                  className={`flight-filter-option ${flightStopsFilter === value ? 'active' : ''}`}
                  type="button"
                  key={value}
                  onClick={() => {
                    setFlightStopsFilter(value);
                    setVisibleCount(6);
                  }}
                >
                  <span className="flight-filter-radio" />
                  <span className="flight-filter-copy">
                    <b>{label}</b>
                    <small>{stats.minPrice ? `From ₹${formatFlightPrice(stats.minPrice)}` : 'No fares'}</small>
                  </span>
                  <strong>{stats.count}</strong>
                </button>
              ))}
            </div>

            <div className="flight-filter-section">
              <h4>Airlines</h4>
              {flightAirlineOptions.map((airline) => (
                <button
                  className={`flight-filter-option checkbox ${selectedFlightAirlines.includes(airline.name) ? 'active' : ''}`}
                  type="button"
                  key={airline.name}
                  onClick={() => {
                    toggleFlightAirline(airline.name);
                    setVisibleCount(6);
                  }}
                >
                  <span className="flight-filter-check" />
                  <span className="flight-filter-copy">
                    <b>{airline.name}</b>
                    <small>From ₹{formatFlightPrice(airline.minPrice)}</small>
                  </span>
                  <strong>{airline.count}</strong>
                </button>
              ))}
            </div>
          </aside>

          <main className="flight-list-panel">
            <div className="flight-sort-tabs" role="tablist" aria-label="Sort flights">
              {[
                ['best', 'Best'],
                ['cheapest', 'Cheapest'],
                ['fastest', 'Fastest'],
              ].map(([value, label]) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={flightSort === value}
                  className={flightSort === value ? 'active' : ''}
                  key={value}
                  onClick={() => {
                    setFlightSort(value);
                    setVisibleCount(6);
                  }}
                >
                  {label}
                  {value === 'best' && <Info size={15} />}
                </button>
              ))}
            </div>

            {filteredFlights.length === 0 ? (
              <div className="flight-no-filter-results">
                <h3>No flights match these filters</h3>
                <p>Try clearing stops or airline filters to see more Sancharie fares.</p>
                <button
                  type="button"
                  onClick={() => {
                    setFlightStopsFilter('any');
                    setSelectedFlightAirlines([]);
                  }}
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <div className="flight-results-list">
                {visibleFlights.map((flight, index) => {
                  const price = Number(flight.price || 0);
                  const durationMinutes = Number(flight.durationMinutes || 0);
                  const isDirect = Number(flight.stopsCount || 0) === 0;
                  const isCheapest = price > 0 && price === flightPriceRange.min;
                  const isFastest = durationMinutes > 0 && durationMinutes === flightDurationRange.min;
                  const isExpanded = expandedFlightId === flight.id;
                  const badges = [
                    flightSort === 'best' && index === 0 ? 'Best' : '',
                    isCheapest ? 'Cheapest' : '',
                    isDirect ? 'Cheapest direct' : '',
                    isFastest ? 'Fastest' : '',
                  ].filter(Boolean).slice(0, 3);
                  const hiddenAmenities = Math.max(0, (flight.amenities || []).length - 3);

                  return (
                    <article className="flight-result-card" key={`${flight.id || flight.flightNumber}-${index}`}>
                      <div className="flight-itinerary-side">
                        <div className="flight-badge-row">
                          {badges.map((badge) => (
                            <span className={badge === 'Best' ? 'best' : ''} key={badge}>{badge}</span>
                          ))}
                          <span className="upgrade-badge">
                            {flight.refundable ? 'Refundable fare available' : 'Fare rules available'}
                          </span>
                        </div>

                        <div className="flight-route-row">
                          <div className="flight-airline-mark">
                            {flight.airlineCode || (flight.carrier || 'FL').slice(0, 2).toUpperCase()}
                          </div>
                          <div className="flight-time-block">
                            <strong>{formatTime(flight.departureTime)}</strong>
                            <small>{formatFlightDate(searchParams?.date || flight.departureTime)} · {flight.from || fromCode}</small>
                          </div>
                          <div className="flight-duration-line">
                            <span />
                            <b>{isDirect ? 'Direct' : flight.stops}</b>
                            <span />
                            <small>{flight.duration || calculateDuration(flight.departureTime, flight.arrivalTime, flight.durationMinutes)}</small>
                          </div>
                          <div className="flight-time-block right">
                            <strong>{formatTime(flight.arrivalTime)}</strong>
                            <small>{formatFlightDate(searchParams?.date || flight.arrivalTime)} · {flight.to || toCode}</small>
                          </div>
                        </div>

                        <p className="flight-operator-line">{flight.carrier}{flight.flightNumber ? ` · ${flight.flightNumber}` : ''}</p>
                        {isExpanded && (
                          <div className="flight-fare-details">
                            <span><Briefcase size={15} /> {(flight.amenities || [])[0] || 'Baggage details available at checkout'}</span>
                            <span><CircleCheck size={15} /> {flight.refundable ? 'Refundable fare' : 'Non-refundable fare'}</span>
                            <span><Info size={15} /> Final fare is confirmed before payment</span>
                          </div>
                        )}
                      </div>

                      <div className="flight-fare-side">
                        <div className="flight-fare-family">{flight.fareType || cabinLabels[searchParams?.cabinClass || 1] || 'Eco Value'}</div>
                        <div className="flight-inclusion-icons">
                          {(flight.amenities || ['Baggage included', 'Fare confirmation', 'Secure booking']).slice(0, 3).map((amenity) => (
                            <span title={amenity} key={amenity}>
                              <Briefcase size={18} />
                              <CircleCheck size={12} />
                            </span>
                          ))}
                          {hiddenAmenities > 0 && <b>+{hiddenAmenities}</b>}
                        </div>
                        <div className="flight-price-block">
                          <strong>₹{formatFlightPrice(price)}</strong>
                          <Info size={18} />
                        </div>
                        <div className="flight-card-actions">
                          <button
                            className="flight-more-fares"
                            type="button"
                            onClick={() => setExpandedFlightId((current) => current === flight.id ? null : flight.id)}
                          >
                            More fares <ChevronDown size={17} />
                          </button>
                          <button
                            className="flight-book-btn"
                            type="button"
                            disabled={bookingFlightId === flight.id}
                            onClick={() => handleBookFlight(flight)}
                          >
                            {bookingFlightId === flight.id ? 'Checking fare…' : 'View details'}
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {filteredFlights.length > visibleCount && (
              <div className="load-more-container">
                <button
                  className="load-more-btn"
                  type="button"
                  onClick={() => setVisibleCount((count) => count + 6)}
                >
                  Load More Flights ({filteredFlights.length - visibleCount} remaining)
                </button>
              </div>
            )}
          </main>
        </div>
      </div>
    );
  }

  if (!loading && buses.length === 0) {
    return <NoResult searchParams={searchParams} />;
  }

  return (
    <div className="sr-page">
      <button className="page-back-btn-inline" onClick={() => window.history.back()} title="Back">← Back</button>
      <div className="sr-layout">
        {/* BUS SUMMARY & FILTERS */}
        <aside className="filters-panel">
          {/* BUS SUMMARY PANEL - Similar to flight summary */}
          <div className="flight-summary-card bus-summary-card">
            <h3>Search Summary</h3>
            <p>Overview of available buses for this route.</p>
            <div className="bus-summary-breakdown">
              <span><b>{filteredBuses.length}</b> buses found</span>
              <span><b>₹{busPriceRange.min}</b> lowest fare</span>
            </div>
          </div>

          <div className="filters-header">
            <h4>Filters</h4>
            <span
              className="clear-all"
              onClick={() => {
                setMaxPrice(5000);
                setSelectedBusTypes([]);
                setSelectedTimes([]);
                setSelectedOperators([]);
                setSelectedBoarding([]);
                setSelectedDropping([]);
                setOperatorSearch("");
              }}
            >
              Clear all
            </span>
          </div>

          {/* PRICE */}
          <div className="filter-block">
            <div className="filter-title">Price</div>
            <input
              type="range"
              min="100"
              max="5000"
              value={maxPrice}
              onChange={(e) => setMaxPrice(+e.target.value)}
              className="price-slider"
            />
            <div className="price-values">
              <span>₹100</span>
              <span>₹{maxPrice}</span>
            </div>
          </div>

          {/* BUS TYPE */}
          <div className="filter-block">
            <div className="filter-title">
              <Bus className="filter-icon" size={16} /> Bus Type
            </div>
            <div className="bus-type-grid">
              {["AC", "Non-AC", "Sleeper", "Seating"].map((t) => (
                <div
                  key={t}
                  className={`bus-type-box ${
                    selectedBusTypes.includes(t) ? "active" : ""
                  }`}
                  onClick={() =>
                    setSelectedBusTypes((prev) =>
                      prev.includes(t)
                        ? prev.filter((x) => x !== t)
                        : [...prev, t]
                    )
                  }
                >
                  {t}
                </div>
              ))}
            </div>
          </div>

          {/* DEPARTURE TIME */}
          <div className="filter-block">
            <div className="filter-title">
              <Clock className="filter-icon" size={16} /> Departure Time
            </div>
            <div className="departure-grid">
              {[
                ["before10", "Before 10 AM"],
                ["10to5", "10 AM - 5 PM"],
                ["5to11", "5 PM - 11 PM"],
                ["after11", "After 11 PM"],
              ].map(([key, label]) => (
                <div
                  key={key}
                  className={`departure-box ${
                    selectedTimes.includes(key) ? "active" : ""
                  }`}
                  onClick={() =>
                    setSelectedTimes((prev) =>
                      prev.includes(key)
                        ? prev.filter((x) => x !== key)
                        : [...prev, key]
                    )
                  }
                >
                  {label}
                </div>
              ))}
            </div>
          </div>

          {/* BUS OPERATORS */}
          <div className="filter-block">
            <div className="filter-title">Bus Operators</div>
            <input
              type="text"
              className="filter-search-input"
              placeholder="Search bus operator..."
              value={operatorSearch}
              onChange={(e) => setOperatorSearch(e.target.value)}
            />
            <div className="filter-scroll-list">
              {filteredOperators.map((op) => (
                <label key={op} className="check-row">
                  <input
                    type="checkbox"
                    checked={selectedOperators.includes(op)}
                    onChange={() =>
                      setSelectedOperators((prev) =>
                        prev.includes(op)
                          ? prev.filter((x) => x !== op)
                          : [...prev, op]
                      )
                    }
                  />
                  {op}
                </label>
              ))}
              {filteredOperators.length === 0 && (
                <p className="filter-empty-text">No operators found</p>
              )}
            </div>
          </div>

          {/* BOARDING POINT */}
          <div className="filter-block">
            <div className="filter-title">
              <SiGooglemaps className="filter-icon" /> Boarding Point
            </div>
            <input
              type="text"
              className="filter-search-input"
              placeholder="Search boarding point..."
              value={boardingSearch}
              onChange={(e) => setBoardingSearch(e.target.value)}
            />
            <div className="filter-scroll-list">
              {uniqueBoardingPoints
                .filter((point) => point.toLowerCase().includes(boardingSearch.toLowerCase()))
                .map((point) => (
                <label key={point} className="check-row">
                  <input
                    type="checkbox"
                    checked={selectedBoarding.includes(point)}
                    onChange={() =>
                      setSelectedBoarding((prev) =>
                        prev.includes(point)
                          ? prev.filter((x) => x !== point)
                          : [...prev, point]
                      )
                    }
                  />
                  {point}
                </label>
              ))}
            </div>
          </div>

          {/* DROPPING POINT */}
          <div className="filter-block">
            <div className="filter-title">
              <SiGooglemaps className="filter-icon" /> Dropping Point
            </div>
            <input
              type="text"
              className="filter-search-input"
              placeholder="Search dropping point..."
              value={droppingSearch}
              onChange={(e) => setDroppingSearch(e.target.value)}
            />
            <div className="filter-scroll-list">
              {uniqueDroppingPoints
                .filter((point) => point.toLowerCase().includes(droppingSearch.toLowerCase()))
                .map((point) => (
                <label key={point} className="check-row">
                  <input
                    type="checkbox"
                    checked={selectedDropping.includes(point)}
                    onChange={() =>
                      setSelectedDropping((prev) =>
                        prev.includes(point)
                          ? prev.filter((x) => x !== point)
                          : [...prev, point]
                      )
                    }
                  />
                  {point}
                </label>
              ))}
            </div>
          </div>
        </aside>

        {/* RESULTS */}
        <section className="sr-results">
          {/* SEARCH BAR — hidden on mobile */}
          <div className="sr-search-bar-desktop">
            <SearchBus 
              onSearch={onSearch} 
              initialValues={searchParams}
              compact={true}
            />
          </div>

          {/* DATE SELECTOR */}
          <div className="date-selector">
            <button className="date-nav prev" onClick={handleDateNavPrev}>
              <svg width="19" height="19" viewBox="0 0 19 19" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 15L6 9.5L12 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <div className="date-items-wrapper">
              {dateRange.map((d, index) => (
                <div 
                  key={d.date} 
                  className={`date-item ${index === selectedDateIndex ? "active" : ""}`}
                  onClick={() => handleDateSelect(index)}
                >
                  <span className="day">{d.day}</span>
                  <span className="date">{d.display}</span>
                </div>
              ))}
            </div>
            <button className="date-nav next" onClick={handleDateNavNext}>
              <svg width="19" height="19" viewBox="0 0 19 19" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M7 4L13 9.5L7 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>

          {filteredBuses.slice(0, visibleCount).map((bus) => {
            // Get boarding points for route display
            const boardingPoints = bus.BoardingPointsDetails || [];
            const droppingPoints = bus.DroppingPointsDetails || [];
            const firstBoardingPoint = boardingPoints[0]?.CityPointName || searchParams?.from;
            const lastDroppingPoint = droppingPoints[droppingPoints.length - 1]?.CityPointName || searchParams?.to;
            
            // Get additional stops for display
            const midPoints = boardingPoints.slice(1, 3).map(bp => bp.CityPointName).filter(Boolean);
            const totalStops = boardingPoints.length + droppingPoints.length;
            const otherStopsCount = Math.max(0, totalStops - 4);
            
            // Check if this is the cheapest bus
            const busPrice = bus.BusPrice?.PublishedPrice || 0;
            const isCheapest = busPrice > 0 && busPrice === busPriceRange.min;
            
            return (
            <React.Fragment key={bus.ResultIndex}>
              <div className={`sr-card ${isCheapest ? 'cheapest-bus' : ''}`}>
                {/* Header Row - Operator and Route */}
                <div className="card-header-row">
                  <div className="operator-route">
                    <h3 className="operator-name">{bus.TravelName || 'Bus Operator'}</h3>
                    <div className="route-breadcrumb">
                      <span className="route-label">from:</span>
                      <span className="route-point">{firstBoardingPoint}</span>
                      {midPoints.map((point, idx) => (
                        <React.Fragment key={idx}>
                          <MdKeyboardArrowRight className="route-arrow" />
                          <span className="route-point">{point}</span>
                        </React.Fragment>
                      ))}
                      {otherStopsCount > 0 && (
                        <>
                          <MdKeyboardArrowRight className="route-arrow" />
                          <span className="route-point other-stops">{otherStopsCount} other stops</span>
                        </>
                      )}
                    </div>
                  </div>
                  {isCheapest && (
                    <div className="cheapest-badge">
                      <Star size={14} /> Cheapest
                    </div>
                  )}
                </div>
                
                {/* Main Content Row */}
                <div className="card-main-content">
                  {/* Left Section - Bus Info */}
                  <div className="sr-info">
                    {/* Bus Type */}
                    <p className="bus-type">{bus.BusType || 'A/C Sleeper ( 2 + 1 )'}</p>
                    
                    {/* Time Row - Times with connector */}
                    <div className="time-row">
                      <span className="time">{formatTime(bus.departureTimeRaw || bus.DepartureTime)}</span>
                      <div className="duration-connector">
                        <span className="duration-line-left"></span>
                        <span className="duration-badge">{calculateDuration(bus.DepartureTime, bus.ArrivalTime, bus.durationInMins)}</span>
                        <span className="duration-line-right"></span>
                      </div>
                      <span className="time">{formatTime(bus.arrivalTimeRaw || bus.ArrivalTime)}</span>
                    </div>
                    
                    {/* Location Names Row */}
                    <div className="location-row">
                      <span className="location-name">{firstBoardingPoint}</span>
                      <span className="location-name location-end">{lastDroppingPoint}</span>
                    </div>
                  </div>

                  {/* Center Section - Seat Layout Preview (Real-time from API) */}
                  <div className="seat-preview">
                    <MiniSeatPreview bus={bus} searchTokenId={searchTokenId} />
                  </div>

                  {/* Vertical Divider */}
                  <div className="card-divider"></div>

                  {/* Right Section - Price */}
                  <div className="price-section">
                    <p className="starts-from-label">Starts From</p>
                    <BusPriceDisplay bus={bus} />
                    <button 
                      className="select-seat-btn" 
                      onClick={() => handleBusSelect(bus)}
                    >
                      {selectedBus === bus.ResultIndex ? "HIDE DETAILS" : "SELECT SEAT"}
                    </button>
                    {/* Seats Left Indicator - AbhiBus Style */}
                    <div className="seats-left-indicator">
                      <span className="seats-count">{bus.AvailableSeats || 0} Seats Left</span>
                    </div>
                  </div>
                </div>

                {/* Bus Details Chips Row - AbhiBus Style */}
                <div className="bus-details-chips">
                  <button 
                    className="detail-chip"
                    onClick={() => openBusDetailsModal(bus, 'boarding')}
                  >
                    <MapPin size={14} />
                    <span>Boarding & Dropping</span>
                  </button>
                  <button 
                    className="detail-chip"
                    onClick={() => openBusDetailsModal(bus, 'amenities')}
                  >
                    <Bus size={14} />
                    <span>{(bus.Amenities?.length || 11)}+ Amenities</span>
                  </button>
                  <button 
                    className="detail-chip"
                    onClick={() => openBusDetailsModal(bus, 'cancellation')}
                  >
                    <Clock size={14} />
                    <span>Cancellation</span>
                  </button>
                  <button 
                    className="detail-chip"
                    onClick={() => openBusDetailsModal(bus, 'policy')}
                  >
                    <Shield size={14} />
                    <span>Travel Policy</span>
                  </button>
                </div>
              </div>

              {/* INLINE SELECTSEAT COMPONENT */}
              {selectedBus === bus.ResultIndex && (
                <div ref={seatLayoutRef}>
                  <SelectSeat 
                    bus={bus} 
                    searchTokenId={searchTokenId}
                    onClose={() => setSelectedBus(null)} 
                  />
                </div>
              )}
            </React.Fragment>
          )})}

          {/* LOAD MORE BUTTON */}
          {filteredBuses.length > visibleCount && (
            <div className="load-more-container">
              <button 
                className="load-more-btn"
                onClick={() => setVisibleCount(prev => prev + 6)}
              >
                Load More Buses ({filteredBuses.length - visibleCount} remaining)
              </button>
            </div>
          )}

          {/* NO RESULTS */}
          {filteredBuses.length === 0 && !loading && (
            <div className="no-results">
              <p>No buses match your filters</p>
              <button onClick={() => {
                setMaxPrice(5000);
                setSelectedBusTypes([]);
                setSelectedTimes([]);
                setSelectedOperators([]);
                setSelectedBoarding([]);
                setSelectedDropping([]);
                setOperatorSearch("");
              }}>
                Clear Filters
              </button>
            </div>
          )}
        </section>
      </div>

      {/* MOBILE FILTER FAB */}
      {(() => {
        const activeFilterCount = selectedBusTypes.length + selectedTimes.length + selectedOperators.length + selectedBoarding.length + selectedDropping.length + (maxPrice < 5000 ? 1 : 0);
        return (
          <button className="mobile-filter-fab" onClick={() => setMobileFilterOpen(true)}>
            <SlidersHorizontal size={22} />
            {activeFilterCount > 0 && <span className="filter-count-badge">{activeFilterCount}</span>}
          </button>
        );
      })()}

      {/* MOBILE FILTER BOTTOM SHEET */}
      <div className={`mobile-filter-overlay ${mobileFilterOpen ? 'open' : ''}`} onClick={() => setMobileFilterOpen(false)}>
        <div className="mobile-filter-sheet" onClick={(e) => e.stopPropagation()}>
          <div className="mobile-filter-sheet-header">
            <h3>Filters</h3>
            <button className="mobile-filter-sheet-close" onClick={() => setMobileFilterOpen(false)}>
              <X size={22} />
            </button>
          </div>
          <div className="mobile-filter-sheet-body">
            {/* PRICE */}
            <div className="filter-block">
              <div className="filter-title">Price</div>
              <input type="range" min="100" max="5000" value={maxPrice} onChange={(e) => setMaxPrice(+e.target.value)} className="price-slider" />
              <div className="price-values"><span>₹100</span><span>₹{maxPrice}</span></div>
            </div>
            {/* BUS TYPE */}
            <div className="filter-block">
              <div className="filter-title"><Bus className="filter-icon" size={16} /> Bus Type</div>
              <div className="bus-type-grid">
                {["AC", "Non-AC", "Sleeper", "Seating"].map((t) => (
                  <div key={t} className={`bus-type-box ${selectedBusTypes.includes(t) ? "active" : ""}`}
                    onClick={() => setSelectedBusTypes((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t])}>{t}</div>
                ))}
              </div>
            </div>
            {/* DEPARTURE TIME */}
            <div className="filter-block">
              <div className="filter-title"><Clock className="filter-icon" size={16} /> Departure Time</div>
              <div className="departure-grid">
                {[["before10", "Before 10 AM"], ["10to5", "10 AM - 5 PM"], ["5to11", "5 PM - 11 PM"], ["after11", "After 11 PM"]].map(([key, label]) => (
                  <div key={key} className={`departure-box ${selectedTimes.includes(key) ? "active" : ""}`}
                    onClick={() => setSelectedTimes((prev) => prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key])}>{label}</div>
                ))}
              </div>
            </div>
            {/* OPERATORS */}
            <div className="filter-block">
              <div className="filter-title">Bus Operators</div>
              <input type="text" className="filter-search-input" placeholder="Search bus operator..." value={operatorSearch} onChange={(e) => setOperatorSearch(e.target.value)} />
              <div className="filter-scroll-list">
                {filteredOperators.map((op) => (
                  <label key={op} className="check-row">
                    <input type="checkbox" checked={selectedOperators.includes(op)}
                      onChange={() => setSelectedOperators((prev) => prev.includes(op) ? prev.filter((x) => x !== op) : [...prev, op])} />
                    {op}
                  </label>
                ))}
                {filteredOperators.length === 0 && (
                  <p className="filter-empty-text">No operators found</p>
                )}
              </div>
            </div>
            {/* BOARDING POINT */}
            <div className="filter-block">
              <div className="filter-title"><SiGooglemaps className="filter-icon" /> Boarding Point</div>
              <input type="text" className="filter-search-input" placeholder="Search boarding point..." value={boardingSearch} onChange={(e) => setBoardingSearch(e.target.value)} />
              <div className="filter-scroll-list">
                {uniqueBoardingPoints
                  .filter((point) => point.toLowerCase().includes(boardingSearch.toLowerCase()))
                  .map((point) => (
                  <label key={point} className="check-row">
                    <input type="checkbox" checked={selectedBoarding.includes(point)}
                      onChange={() => setSelectedBoarding((prev) => prev.includes(point) ? prev.filter((x) => x !== point) : [...prev, point])} />
                    {point}
                  </label>
                ))}
              </div>
            </div>
            {/* DROPPING POINT */}
            <div className="filter-block">
              <div className="filter-title"><SiGooglemaps className="filter-icon" /> Dropping Point</div>
              <input type="text" className="filter-search-input" placeholder="Search dropping point..." value={droppingSearch} onChange={(e) => setDroppingSearch(e.target.value)} />
              <div className="filter-scroll-list">
                {uniqueDroppingPoints
                  .filter((point) => point.toLowerCase().includes(droppingSearch.toLowerCase()))
                  .map((point) => (
                  <label key={point} className="check-row">
                    <input type="checkbox" checked={selectedDropping.includes(point)}
                      onChange={() => setSelectedDropping((prev) => prev.includes(point) ? prev.filter((x) => x !== point) : [...prev, point])} />
                    {point}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="mobile-filter-sheet-footer">
            <button className="mobile-filter-clear-btn" onClick={() => {
              setMaxPrice(5000); setSelectedBusTypes([]); setSelectedTimes([]); setSelectedOperators([]); setSelectedBoarding([]); setSelectedDropping([]); setOperatorSearch("");
            }}>Clear All</button>
            <button className="mobile-filter-apply-btn" onClick={() => setMobileFilterOpen(false)}>Apply Filters</button>
          </div>
        </div>
      </div>

      {/* BUS DETAILS MODAL */}
      {modalOpen && modalBus && (
        <div className="bus-details-modal-overlay" onClick={closeBusDetailsModal}>
          <div className="bus-details-modal" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="modal-header">
              <button className="modal-close-btn" onClick={closeBusDetailsModal}>
                <X size={20} />
              </button>
              <h2 className="modal-title">Bus Details</h2>
            </div>

            {/* Bus Info */}
            <div className="modal-bus-info">
              <div className="modal-bus-name">
                <h3>{modalBus.TravelName || 'Bus Operator'}</h3>
                <p>{modalBus.BusType || 'A/C Sleeper ( 2 + 1 )'}</p>
              </div>
            </div>

            {/* Tabs */}
            <div className="modal-tabs">
              <button 
                className={`modal-tab ${modalTab === 'boarding' ? 'active' : ''}`}
                onClick={() => setModalTab('boarding')}
              >
                Boarding/Dropping Point
              </button>
              <button 
                className={`modal-tab ${modalTab === 'cancellation' ? 'active' : ''}`}
                onClick={() => setModalTab('cancellation')}
              >
                Cancellation Policy
              </button>
              <button 
                className={`modal-tab ${modalTab === 'amenities' ? 'active' : ''}`}
                onClick={() => setModalTab('amenities')}
              >
                Amenities
              </button>
              <button 
                className={`modal-tab ${modalTab === 'policy' ? 'active' : ''}`}
                onClick={() => setModalTab('policy')}
              >
                Travel Policy
              </button>
            </div>

            {/* Tab Content */}
            <div className="modal-content">
              {/* Boarding/Dropping Points Tab */}
              {modalTab === 'boarding' && (
                <div className="boarding-dropping-content">
                  <h4 className="content-section-title">Boarding Points</h4>
                  <div className="points-timeline">
                    {(modalBus.BoardingPointsDetails || [])
                      .slice(0, showAllBoardingPoints ? undefined : 5)
                      .map((point, idx, arr) => (
                      <div key={idx} className="timeline-item">
                        <div className="timeline-time">
                          <span className="point-time">{formatTime(point.CityPointTime)}</span>
                          <span className="point-date">{formatDate(point.CityPointTime)}</span>
                        </div>
                        <div className="timeline-marker">
                          <span className="marker-dot"></span>
                          {idx < arr.length - 1 && <span className="marker-line"></span>}
                        </div>
                        <div className="timeline-details">
                          <span className="point-name">{point.CityPointName}</span>
                          <span className="point-address">{point.CityPointAddress || 'Near Main Road'}</span>
                        </div>
                      </div>
                    ))}
                    {(modalBus.BoardingPointsDetails?.length || 0) > 5 && !showAllBoardingPoints && (
                      <button 
                        className="view-more-btn"
                        onClick={() => setShowAllBoardingPoints(true)}
                      >
                        View more Boarding points
                      </button>
                    )}
                    {showAllBoardingPoints && (modalBus.BoardingPointsDetails?.length || 0) > 5 && (
                      <button 
                        className="view-more-btn"
                        onClick={() => setShowAllBoardingPoints(false)}
                      >
                        Show less
                      </button>
                    )}
                  </div>

                  <h4 className="content-section-title">Dropping Points</h4>
                  <div className="points-timeline">
                    {(modalBus.DroppingPointsDetails || [])
                      .slice(0, showAllDroppingPoints ? undefined : 5)
                      .map((point, idx, arr) => (
                      <div key={idx} className="timeline-item">
                        <div className="timeline-time">
                          <span className="point-time">{formatTime(point.CityPointTime)}</span>
                          <span className="point-date">{formatDate(point.CityPointTime)}</span>
                        </div>
                        <div className="timeline-marker">
                          <span className="marker-dot"></span>
                          {idx < arr.length - 1 && <span className="marker-line"></span>}
                        </div>
                        <div className="timeline-details">
                          <span className="point-name">{point.CityPointName}</span>
                          <span className="point-address">{point.CityPointAddress || 'Near Main Road'}</span>
                        </div>
                      </div>
                    ))}
                    {(modalBus.DroppingPointsDetails?.length || 0) > 5 && !showAllDroppingPoints && (
                      <button 
                        className="view-more-btn"
                        onClick={() => setShowAllDroppingPoints(true)}
                      >
                        View more Dropping points
                      </button>
                    )}
                    {showAllDroppingPoints && (modalBus.DroppingPointsDetails?.length || 0) > 5 && (
                      <button 
                        className="view-more-btn"
                        onClick={() => setShowAllDroppingPoints(false)}
                      >
                        Show less
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Cancellation Policy Tab */}
              {modalTab === 'cancellation' && (
                <div className="cancellation-content">
                  <h4 className="content-section-title">Cancellation Policy</h4>
                  <div className="cancellation-table">
                    <div className="table-header">
                      <span>Cancellation Time</span>
                      <span>Refund Amount Details</span>
                    </div>
                    <div className="table-subheader">
                      <span>(Valid from trip start time)</span>
                      <span></span>
                    </div>
                    {(() => {
                      // Get cancellation policies from bus data
                      let policies = modalBus.CancellationPolicy || modalBus.CancellationPolicies || [];
                      
                      // If no policies, use defaults
                      if (!policies || policies.length === 0) {
                        policies = [
                          { cutoffTime: '120', refundInPercentage: '70' },
                          { cutoffTime: '48-120', refundInPercentage: '50' },
                          { cutoffTime: '24-48', refundInPercentage: '30' },
                          { cutoffTime: '0-24', refundInPercentage: '10' },
                        ];
                      }
                      
                      return policies.map((policy, idx) => {
                        const busPrice = modalBus.BusPrice?.PublishedPrice || 500;
                        
                        // Handle ETS format: { cutoffTime: "0-24", refundInPercentage: "10" }
                        if (policy.cutoffTime !== undefined) {
                          const refundPct = parseInt(policy.refundInPercentage) || 0;
                          const refundAmount = Math.round(busPrice * (refundPct / 100));
                          
                          // Parse cutoff time
                          let timeDisplay = policy.cutoffTime;
                          if (policy.cutoffTime === '0-10 minutes') {
                            timeDisplay = 'Within 10 minutes of booking';
                          } else if (policy.cutoffTime.includes('-')) {
                            const [start, end] = policy.cutoffTime.split('-').map(n => parseInt(n));
                            if (start === 0) {
                              timeDisplay = `Less than ${end} hours before departure`;
                            } else {
                              timeDisplay = `${start}-${end} hours before departure`;
                            }
                          } else {
                            const hours = parseInt(policy.cutoffTime);
                            if (hours >= 24) {
                              const days = Math.floor(hours / 24);
                              timeDisplay = `More than ${days} day${days > 1 ? 's' : ''} before departure`;
                            } else {
                              timeDisplay = `More than ${hours} hours before departure`;
                            }
                          }
                          
                          return (
                            <div key={idx} className="table-row">
                              <span className="cancellation-time">{timeDisplay}</span>
                              <span className="refund-amount">
                                ₹{refundAmount} /- @ {refundPct}% refund
                              </span>
                            </div>
                          );
                        }
                        
                        // Handle old format with FromMinutes/ToMinutes
                        const fromMins = policy.FromMinutes || policy.fromMinutes || 0;
                        const refundPct = policy.RefundPercent || policy.refundPercent || 0;
                        const fromHours = Math.floor(fromMins / 60);
                        const refundAmount = Math.round(busPrice * (refundPct / 100));
                        
                        let timeDisplay;
                        if (fromHours >= 24) {
                          const days = Math.floor(fromHours / 24);
                          timeDisplay = `${days} day${days > 1 ? 's' : ''} before departure`;
                        } else {
                          timeDisplay = `${fromHours} hr${fromHours !== 1 ? 's' : ''} before departure`;
                        }
                        
                        return (
                          <div key={idx} className="table-row">
                            <span className="cancellation-time">{timeDisplay}</span>
                            <span className="refund-amount">
                              ₹{refundAmount} /- @ {refundPct}% refund
                            </span>
                          </div>
                        );
                      });
                    })()}
                  </div>
                  <div className="cancellation-notes">
                    <p><Info size={14} /> Refund amount is indicative.</p>
                    <p>• Additional Rs.15 per seat cancellation fee is applicable</p>
                    <p>• Partial cancellation is allowed</p>
                  </div>
                </div>
              )}

              {/* Amenities Tab */}
              {modalTab === 'amenities' && (
                <div className="amenities-content">
                  <h4 className="content-section-title">Amenities</h4>
                  <div className="amenities-grid">
                    {(modalBus.Amenities && modalBus.Amenities.length > 0 
                      ? modalBus.Amenities.map((amenity, idx) => {
                          // Map amenity name to icon
                          const amenityLower = amenity.toLowerCase();
                          let iconName = 'default';
                          if (amenityLower.includes('blanket')) iconName = 'blanket';
                          else if (amenityLower.includes('water')) iconName = 'bottle';
                          else if (amenityLower.includes('wifi')) iconName = 'wifi';
                          else if (amenityLower.includes('charging') || amenityLower.includes('plug')) iconName = 'charging';
                          else if (amenityLower.includes('pillow')) iconName = 'pillow';
                          else if (amenityLower.includes('reading') || amenityLower.includes('light')) iconName = 'reading';
                          else if (amenityLower.includes('hammer')) iconName = 'hammer';
                          else if (amenityLower.includes('fire') || amenityLower.includes('extinguisher')) iconName = 'fire';
                          else if (amenityLower.includes('emergency') || amenityLower.includes('exit')) iconName = 'emergency';
                          else if (amenityLower.includes('gps') || amenityLower.includes('tracking')) iconName = 'gps';
                          else if (amenityLower.includes('first aid') || amenityLower.includes('firstaid')) iconName = 'firstaid';
                          else if (amenityLower.includes('cctv') || amenityLower.includes('camera')) iconName = 'staff';
                          else if (amenityLower.includes('toilet') || amenityLower.includes('washroom')) iconName = 'toilet';
                          else if (amenityLower.includes('air purifier')) iconName = 'temperature';
                          
                          return (
                            <div key={idx} className="amenity-item">
                              <div className="amenity-icon">
                                {getAmenityIcon(iconName)}
                              </div>
                              <span className="amenity-name">{amenity}</span>
                            </div>
                          );
                        })
                      : defaultAmenities.map((amenity, idx) => (
                          <div key={idx} className="amenity-item">
                            <div className="amenity-icon">
                              {getAmenityIcon(amenity.icon)}
                            </div>
                            <span className="amenity-name">{amenity.name}</span>
                          </div>
                        ))
                    )}
                  </div>
                </div>
              )}

              {/* Travel Policy Tab */}
              {modalTab === 'policy' && (
                <div className="policy-content">
                  <h4 className="content-section-title">Travel Policy</h4>
                  
                  <div className="policy-item">
                    <h5>Do I need to buy a ticket for my child?</h5>
                    <p>Children below five years of age can travel for free along with adults. If a separate seat is required for the child, customer must book ticket for the child. Please note that sharing a berth with passengers from a different booking on a double berth is not permitted.</p>
                  </div>
                  
                  <div className="policy-item">
                    <h5>Will I be charged for excess luggage?</h5>
                    <p>Yes, excess luggage is chargeable. You are allowed to carry 2 pieces of luggage, 15 Kgs each. Allowing luggages packed in carton boxes is at the discretion of the bus partner.</p>
                  </div>
                  
                  <div className="policy-item">
                    <h5>Can I travel with my Pet?</h5>
                    <p>Travelling with your pets in the bus is not permitted.</p>
                  </div>
                  
                  <div className="policy-item">
                    <h5>Is there any Alcohol/liquor policy?</h5>
                    <p>Yes. Alcohol/liquor consumption and Carrying it inside the bus is prohibited. Bus partners reserves the right to deboard any passenger with inappropriate behaviour or does not comply with the policy. Refunds will not be processed in such cases.</p>
                  </div>
                  
                  <div className="policy-item">
                    <h5>Will the bus wait if the boarding time has passed?</h5>
                    <p>Bus partner do not wait for the passengers beyond the departure time. There is no refund policy if the passenger missed the bus for arriving late at the boarding point.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
