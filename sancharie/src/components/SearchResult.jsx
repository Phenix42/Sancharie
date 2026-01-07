import React, { useMemo, useState, useEffect } from "react";
import "./SearchResult.css";
import { MdAirlineSeatReclineExtra, MdSpeed } from "react-icons/md";
import { FaWind, FaClock } from "react-icons/fa";
import { SiGooglemaps } from "react-icons/si";
import SelectSeat from "./selectseat";
import NoResult from "./noresult";
import Logo from "../assets/logosancharie.svg";
import { useBooking } from "../context/BookingContext";
import { searchBuses } from "../services/busApi";

/* -------------- HELPERS ---------------- */
const timeBucket = (timeString) => {
  if (!timeString) return "before10";
  const date = new Date(timeString);
  const h = date.getHours();
  if (h < 10) return "before10";
  if (h < 17) return "10to5";
  if (h < 23) return "5to11";
  return "after11";
};

const formatTime = (dateString) => {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

const formatDate = (dateString) => {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });
};

const calculateDuration = (departure, arrival) => {
  if (!departure || !arrival) return "";
  const start = new Date(departure);
  const end = new Date(arrival);
  const diff = Math.abs(end - start);
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}: ${minutes.toString().padStart(2, '0')} hrs`;
};

const calculateDepartureHours = (departureTime) => {
  if (!departureTime) return "";
  const now = new Date();
  const departure = new Date(departureTime);
  const diff = departure - now;
  if (diff < 0) return "Departed";
  const hours = Math.floor(diff / (1000 * 60 * 60));
  return `${hours} Hrs`;
};

export default function SearchResult({ searchParams }) {
  const { state, actions } = useBooking();
  
  /* ---------------- LOCAL STATES ---------------- */
  const [buses, setBuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTokenId, setSearchTokenId] = useState(null);

  /* ---------------- FILTER STATES ---------------- */
  const [maxPrice, setMaxPrice] = useState(5000);
  const [selectedBusTypes, setSelectedBusTypes] = useState([]);
  const [selectedTimes, setSelectedTimes] = useState([]);
  const [selectedOperators, setSelectedOperators] = useState([]);
  const [selectedBoarding, setSelectedBoarding] = useState([]);
  const [selectedDropping, setSelectedDropping] = useState([]);
  
  /* ----------- SELECTSEAT INLINE STATE ----------- */
  const [selectedBus, setSelectedBus] = useState(null);
  
  /* ----------- DATE SELECTOR STATE ----------- */
  const [selectedDateIndex, setSelectedDateIndex] = useState(1); // Default to current search date (index 1)
  const [dateOffset, setDateOffset] = useState(0); // For navigation

  /* ---------------- FETCH BUSES ON MOUNT ---------------- */
  useEffect(() => {
    const fetchBuses = async () => {
      if (!searchParams?.fromId || !searchParams?.toId || !searchParams?.date) {
        setError("Invalid search parameters");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        
        const result = await searchBuses(
          searchParams.fromId,
          searchParams.toId,
          searchParams.date
        );
        
        console.log("Search API returned searchTokenId:", result.searchTokenId);
        
        // Store search token locally and in context
        setSearchTokenId(result.searchTokenId);
        actions.setSearchToken(result.searchTokenId);
        actions.setSearchParams(searchParams);
        actions.setSearchResults(result.results);
        
        setBuses(result.results || []);
      } catch (err) {
        console.error("Search error:", err);
        setError(err.message || "Failed to search buses");
      } finally {
        setLoading(false);
      }
    };

    fetchBuses();
  }, [searchParams]);

  /* ---------------- EXTRACT UNIQUE VALUES FOR FILTERS ---------------- */
  const uniqueOperators = useMemo(() => {
    return [...new Set(buses.map((bus) => bus.TravelName).filter(Boolean))];
  }, [buses]);

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

  /* ---------------- DATE NAVIGATION ---------------- */
  const generateDateRange = () => {
    const dates = [];
    const startDate = searchParams?.date ? new Date(searchParams.date) : new Date();
    
    // Start from dateOffset days before/after the search date
    for (let i = 0; i < 7; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i + dateOffset);
      dates.push({
        date: date.toISOString().split("T")[0],
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
    if (selectedDate && searchParams?.fromId && searchParams?.toId) {
      const newSearchParams = {
        ...searchParams,
        date: selectedDate.date,
      };
      // Refresh the search
      const fetchNewBuses = async () => {
        try {
          setLoading(true);
          setError(null);
          const result = await searchBuses(
            searchParams.fromId,
            searchParams.toId,
            selectedDate.date
          );
          setSearchTokenId(result.searchTokenId);
          actions.setSearchToken(result.searchTokenId);
          actions.setSearchParams(newSearchParams);
          actions.setSearchResults(result.results);
          setBuses(result.results || []);
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
    setSelectedBus(selectedBus === bus.ResultIndex ? null : bus.ResultIndex);
    actions.setSelectedBus(bus);
  };

  /* ---------------- UI ---------------- */
  if (loading) {
    return (
      <div className="sr-page">
        <div className="sr-loading">
          <div className="logo-loader">
            <img src={Logo} alt="Sancharie" className="loader-logo" />
            <div className="loader-ring"></div>
          </div>
          <p className="loader-text">Searching for buses...</p>
          <p className="loader-subtext">{searchParams?.from} → {searchParams?.to}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="sr-page">
        <div className="sr-error">
          <p>Error: {error}</p>
          <button onClick={() => window.location.reload()}>Try Again</button>
        </div>
      </div>
    );
  }

  /* ---------------- NO BUSES FOUND ---------------- */
  if (!loading && buses.length === 0) {
    return <NoResult searchParams={searchParams} />;
  }

  return (
    <div className="sr-page">
      <div className="sr-layout">
        {/* FILTERS */}
        <aside className="filters-panel">
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
              <MdAirlineSeatReclineExtra className="filter-icon" /> Bus Type
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
              <FaClock className="filter-icon" /> Departure Time
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
            {uniqueOperators.slice(0, 10).map((op) => (
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
          </div>

          {/* BOARDING POINT */}
          <div className="filter-block">
            <div className="filter-title">
              <SiGooglemaps className="filter-icon" /> Boarding Point
            </div>
            {uniqueBoardingPoints.slice(0, 8).map((point) => (
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

          {/* DROPPING POINT */}
          <div className="filter-block">
            <div className="filter-title">
              <SiGooglemaps className="filter-icon" /> Dropping Point
            </div>
            {uniqueDroppingPoints.slice(0, 8).map((point) => (
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
        </aside>

        {/* RESULTS */}
        <section className="sr-results">
          {/* ROUTE HEADER */}
          <div className="route-header">
            <h2>{searchParams?.from} → {searchParams?.to}</h2>
            <p>{filteredBuses.length} buses found</p>
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

          {filteredBuses.map((bus) => (
            <React.Fragment key={bus.ResultIndex}>
              <div className="sr-card">
                {/* Left Section - Bus Info */}
                <div className="sr-info">
                  <h4 className="bus-title">
                    {searchParams?.from} TO {searchParams?.to} {bus.BusType}
                  </h4>
                  <p className="depart-label">Depart in {calculateDepartureHours(bus.DepartureTime)}</p>
                  
                  <div className="timeline-row">
                    <div className="time-location">
                      <span className="time">{formatTime(bus.DepartureTime)}</span>
                      <span className="boarding">
                        {bus.BoardingPointsDetails?.[0]?.CityPointName || searchParams?.from}
                      </span>
                    </div>
                    <span className="timeline-line-segment"></span>
                    <span className="duration-badge">
                      {calculateDuration(bus.DepartureTime, bus.ArrivalTime)}
                    </span>
                    <span className="timeline-line-segment"></span>
                    <div className="time-location time-location-end">
                      <span className="time">{formatTime(bus.ArrivalTime)}</span>
                      <span className="dropping">
                        {bus.DroppingPointsDetails?.[0]?.CityPointName || searchParams?.to}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Center Section - Seat Layout */}
                <div className="seat-preview">
                  <div className="seat-layout-container">
                    {/* Upper Deck */}
                    <div className="seat-deck">
                      <div className="deck-label-wrapper">
                        <span className="deck-label-text">Upper</span>
                      </div>
                      <div className="deck-seats">
                        {Array.from({ length: 3 }).map((_, r) => (
                          <div key={r} className="seat-row">
                            {Array.from({ length: 7 }).map((__, c) => (
                              <span 
                                key={c} 
                                className={`seat-cell ${((r * 7 + c) % 5 === 0 || (r * 7 + c) % 7 === 2) ? 'available' : 'booked'}`}
                              ></span>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    {/* Divider Line */}
                    <div className="deck-divider"></div>
                    
                    {/* Lower Deck */}
                    <div className="seat-deck">
                      <div className="deck-label-wrapper">
                        <span className="deck-label-text">Lower</span>
                      </div>
                      <div className="deck-seats">
                        {Array.from({ length: 3 }).map((_, r) => (
                          <div key={r} className="seat-row">
                            {Array.from({ length: 7 }).map((__, c) => (
                              <span 
                                key={c} 
                                className={`seat-cell ${((r + c) % 4 === 0) ? 'available' : 'booked'}`}
                              ></span>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  
                  <button 
                    className="select-seat-btn" 
                    onClick={() => handleBusSelect(bus)}
                  >
                    {selectedBus === bus.ResultIndex ? "HIDE DETAILS" : "SELECT SEAT"}
                  </button>
                </div>

                {/* Vertical Divider */}
                <div className="card-divider"></div>

                {/* Right Section - Price */}
                <div className="price-section">
                  <div className="discount-ribbon">
                    <div className="ribbon-content">
                      <span>Flat </span>
                      <strong>{bus.BusPrice?.Discount || 10}% OFF</strong>
                    </div>
                    <div className="ribbon-zigzag"></div>
                  </div>
                  <p className="starts-from-label">Starts From</p>
                  <div className="price-row">
                    <span className="old-price">₹{bus.BusPrice?.BasePrice || (bus.BusPrice?.PublishedPrice + 100)}</span>
                    <span className="current-price">₹{bus.BusPrice?.PublishedPrice}</span>
                  </div>
                  <button className="seats-available-btn">{bus.AvailableSeats} Seats</button>
                </div>
              </div>

              {/* INLINE SELECTSEAT COMPONENT */}
              {selectedBus === bus.ResultIndex && (
                <SelectSeat 
                  bus={bus} 
                  searchTokenId={searchTokenId}
                  onClose={() => setSelectedBus(null)} 
                />
              )}
            </React.Fragment>
          ))}

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
              }}>
                Clear Filters
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
