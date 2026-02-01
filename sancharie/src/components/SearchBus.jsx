import React, { useState, useRef, useEffect } from "react";
import "./SearchBus.css";
import { busApi } from "../services";

// Import custom icons from assets
import fromIcon from "../assets/searchbar/from.svg";
import toIcon from "../assets/searchbar/to.svg";
import swapIcon from "../assets/searchbar/swap.svg";
import calIcon from "../assets/searchbar/cal.svg";

// Search icon SVG component
const SearchIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/>
    <path d="M21 21l-4.35-4.35"/>
  </svg>
);

const SearchBus = ({ onSearch }) => {
  // Get current date in YYYY-MM-DD format
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  
  // Stations data from API
  const [stations, setStations] = useState([]);
  const [stationMap, setStationMap] = useState(new Map());
  const [stationNames, setStationNames] = useState([]);
  const [isLoadingStations, setIsLoadingStations] = useState(true);
  
  const [formData, setFormData] = useState({
    from: "",
    to: "",
    fromId: "",
    toId: "",
    date: today,
  });

  const [fromSuggestions, setFromSuggestions] = useState([]);
  const [toSuggestions, setToSuggestions] = useState([]);
  const [showFromDropdown, setShowFromDropdown] = useState(false);
  const [showToDropdown, setShowToDropdown] = useState(false);
  const [popup, setPopup] = useState({ show: false, message: "" });
  const [quickDate, setQuickDate] = useState("today");

  const dateRef = useRef(null);
  const fromRef = useRef(null);
  const toRef = useRef(null);

  // Fetch stations from API on component mount
  useEffect(() => {
    const fetchStations = async () => {
      try {
        setIsLoadingStations(true);
        const response = await busApi.getStations();
        
        if (response?.stationList && Array.isArray(response.stationList)) {
          const stationList = response.stationList;
          setStations(stationList);
          
          // Create station map for quick lookup
          const map = new Map();
          stationList.forEach((station) => {
            const stationName = station.stationName?.trim() || '';
            if (stationName) {
              map.set(stationName.toLowerCase(), {
                name: stationName,
                stationId: station.stationId,
              });
            }
          });
          setStationMap(map);
          
          // Extract station names
          const names = stationList
            .map((station) => station.stationName?.trim())
            .filter(Boolean);
          setStationNames(names);
        }
      } catch (error) {
        console.error('Failed to fetch stations:', error);
        setPopup({ show: true, message: "Failed to load stations. Please refresh the page." });
      } finally {
        setIsLoadingStations(false);
      }
    };
    
    fetchStations();
  }, []);

  // Helper function to find station data by name
  const getStationData = (stationName) => {
    return stationMap.get(stationName.toLowerCase()) || null;
  };

  // Update quick date selection when date changes
  useEffect(() => {
    if (formData.date === today) {
      setQuickDate("today");
    } else if (formData.date === tomorrow) {
      setQuickDate("tomorrow");
    } else {
      setQuickDate("");
    }
  }, [formData.date, today, tomorrow]);

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
    return stationNames.filter((station) =>
      station.toLowerCase().startsWith(input.toLowerCase())
    );
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

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });

    if (name === "from") {
      const filtered = filterStations(value);
      setFromSuggestions(filtered);
      setShowFromDropdown(filtered.length > 0 && value.length > 0);
    } else if (name === "to") {
      const filtered = filterStations(value);
      setToSuggestions(filtered);
      setShowToDropdown(filtered.length > 0 && value.length > 0);
    }
  };

  const handleSelectCity = (field, station) => {
    const stationInfo = getStationData(station);
    if (field === "from") {
      setFormData({ 
        ...formData, 
        from: station,
        fromId: stationInfo?.stationId || ""
      });
      setShowFromDropdown(false);
      setFromSuggestions([]);
    } else {
      setFormData({ 
        ...formData, 
        to: station,
        toId: stationInfo?.stationId || ""
      });
      setShowToDropdown(false);
      setToSuggestions([]);
    }
  };

  const handleFocus = (field) => {
    if (field === "from") {
      const filtered = formData.from ? filterStations(formData.from) : stationNames.slice(0, 8);
      setFromSuggestions(filtered);
      setShowFromDropdown(true);
    } else if (field === "to") {
      const filtered = formData.to ? filterStations(formData.to) : stationNames.slice(0, 8);
      setToSuggestions(filtered);
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
    });
  };

  const handleQuickDate = (type) => {
    if (type === "today") {
      setFormData({ ...formData, date: today });
      setQuickDate("today");
    } else {
      setFormData({ ...formData, date: tomorrow });
      setQuickDate("tomorrow");
    }
  };

  const handleSearch = () => {
    if (formData.from && formData.to && formData.date) {
      // ETS API uses city names directly, so we just need valid names
      // Ensure user selected from dropdown (stationId will be set)
      if (!stationMap.has(formData.from.toLowerCase()) || !stationMap.has(formData.to.toLowerCase())) {
        setPopup({ show: true, message: "Please select valid cities from the dropdown" });
        return;
      }
      onSearch(formData);
    } else {
      setPopup({ show: true, message: "Please fill in From, To locations and Date" });
    }
  };

  return (
    <div className="search-bus-wrapper">
      <div className="search-container-figma">
        <div className="search-card-figma">
          {/* Origin */}
          <div className="search-field-figma" ref={fromRef}>
            <img src={fromIcon} alt="Origin" className="field-icon-img" />
            <div className="field-content-figma">
              <span className="field-label-figma">Origin</span>
              <input
                type="text"
                name="from"
                placeholder="Select city"
                value={formData.from}
                onChange={handleChange}
                onFocus={() => handleFocus("from")}
                autoComplete="off"
                className="field-input-figma"
              />
            </div>
            {showFromDropdown && fromSuggestions.length > 0 && (
              <ul className="city-dropdown">
                {fromSuggestions.map((city, index) => (
                  <li key={index} onClick={() => handleSelectCity("from", city)}>
                    {city}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Swap Button */}
          <button className="swap-btn-figma" onClick={swapLocations} type="button">
            <img src={swapIcon} alt="Swap" className="swap-icon-img" />
          </button>

          {/* Destination */}
          <div className="search-field-figma" ref={toRef}>
            <img src={toIcon} alt="Destination" className="field-icon-img" />
            <div className="field-content-figma">
              <span className="field-label-figma">Destination</span>
              <input
                type="text"
                name="to"
                placeholder="Select city"
                value={formData.to}
                onChange={handleChange}
                onFocus={() => handleFocus("to")}
                autoComplete="off"
                className="field-input-figma"
              />
            </div>
            {showToDropdown && toSuggestions.length > 0 && (
              <ul className="city-dropdown">
                {toSuggestions.map((city, index) => (
                  <li key={index} onClick={() => handleSelectCity("to", city)}>
                    {city}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Date */}
          <div className="search-field-figma date-field" onClick={() => dateRef.current?.showPicker()}>
            <img src={calIcon} alt="Calendar" className="field-icon-img cal-icon" />
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

          {/* Quick Date Buttons */}
          <div className="quick-dates-figma">
            <button 
              type="button"
              className={`quick-date-btn-figma ${quickDate === "today" ? "active" : ""}`}
              onClick={() => handleQuickDate("today")}
            >
              Today
            </button>
            <button 
              type="button"
              className={`quick-date-btn-figma ${quickDate === "tomorrow" ? "active" : ""}`}
              onClick={() => handleQuickDate("tomorrow")}
            >
              Tomorrow
            </button>
          </div>

          {/* Search Button */}
          <button className="search-btn-figma" onClick={handleSearch} type="button">
            <span>Search</span>
            <SearchIcon />
          </button>
        </div>
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
