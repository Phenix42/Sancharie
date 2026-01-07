import React, { useState, useRef, useEffect } from "react";
import "./SearchBus.css";
import cityData from "../citydata/city.json";

// Create a map of city names to their data (including city_id)
const cityMap = new Map();
cityData.forEach((item) => {
  const cityName = item.city_name.trim();
  cityMap.set(cityName.toLowerCase(), {
    name: cityName,
    cityId: item.city_id,
    id: item.id,
  });
});

// Extract city names from JSON data
const cities = cityData.map((item) => item.city_name.trim());

// Helper function to find city ID by name
const getCityData = (cityName) => {
  return cityMap.get(cityName.toLowerCase()) || null;
};

const SearchBus = ({ onSearch }) => {
  // Get current date in YYYY-MM-DD format
  const today = new Date().toISOString().split('T')[0];
  
  const [formData, setFormData] = useState({
    from: "",
    to: "",
    fromId: "",
    toId: "",
    date: today,
    returnDate: "",
    tab: "buses",
  });

  const [fromSuggestions, setFromSuggestions] = useState([]);
  const [toSuggestions, setToSuggestions] = useState([]);
  const [showFromDropdown, setShowFromDropdown] = useState(false);
  const [showToDropdown, setShowToDropdown] = useState(false);
  const [popup, setPopup] = useState({ show: false, message: "" });

  const dateRef = useRef(null);
  const returnDateRef = useRef(null);
  const fromRef = useRef(null);
  const toRef = useRef(null);

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

  const filterCities = (input) => {
    if (!input) return [];
    return cities.filter((city) =>
      city.toLowerCase().startsWith(input.toLowerCase())
    );
  };

  const formatDate = (date) => {
    if (!date) return "";
    const d = new Date(date);
    return d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });

    // Update suggestions based on input
    if (name === "from") {
      const filtered = filterCities(value);
      setFromSuggestions(filtered);
      setShowFromDropdown(filtered.length > 0 && value.length > 0);
    } else if (name === "to") {
      const filtered = filterCities(value);
      setToSuggestions(filtered);
      setShowToDropdown(filtered.length > 0 && value.length > 0);
    }
  };

  const handleSelectCity = (field, city) => {
    const cityInfo = getCityData(city);
    if (field === "from") {
      setFormData({ 
        ...formData, 
        from: city,
        fromId: cityInfo?.cityId || ""
      });
      setShowFromDropdown(false);
      setFromSuggestions([]);
    } else {
      setFormData({ 
        ...formData, 
        to: city,
        toId: cityInfo?.cityId || ""
      });
      setShowToDropdown(false);
      setToSuggestions([]);
    }
  };

  const handleFocus = (field) => {
    if (field === "from") {
      const filtered = formData.from ? filterCities(formData.from) : cities.slice(0, 8);
      setFromSuggestions(filtered);
      setShowFromDropdown(true);
    } else if (field === "to") {
      const filtered = formData.to ? filterCities(formData.to) : cities.slice(0, 8);
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

  const handleSearch = () => {
    if (formData.from && formData.to && formData.date) {
      if (!formData.fromId || !formData.toId) {
        setPopup({ show: true, message: "Please select valid cities from the dropdown" });
        return;
      }
      onSearch(formData);
    } else {
      setPopup({ show: true, message: "Please fill in From, To locations and Date" });
    }
  };

  return (
    <div className="search-bus">
      <div className="search-container">
        {/* Tabs */}
        <div className="search-tabs">
          <button
            className={`tab ${formData.tab === "buses" ? "active" : ""}`}
            onClick={() => setFormData({ ...formData, tab: "buses" })}
          >
            🚌 Buses
          </button>
          <button
            className={`tab ${formData.tab === "flights" ? "active" : ""}`}
            onClick={() => setFormData({ ...formData, tab: "flights" })}
          >
            ✈️ Flights
          </button>
        </div>

        {/* Search Bar */}
        <div className="search-form">
          <div className="form-fields">
            {/* From */}
            <div className="form-group from" ref={fromRef}>
              <label>From</label>
              <input
                type="text"
                name="from"
                placeholder="Select location"
                value={formData.from}
                onChange={handleChange}
                onFocus={() => handleFocus("from")}
                autoComplete="off"
              />
              {showFromDropdown && fromSuggestions.length > 0 && (
                <ul className="autocomplete-dropdown">
                  {fromSuggestions.map((city, index) => (
                    <li
                      key={index}
                      onClick={() => handleSelectCity("from", city)}
                    >
                      {city}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Swap */}
            <div className="swap-wrapper">
              <div className="swap-btn" onClick={swapLocations}>
                ⇄
              </div>
            </div>
            {/* To */}
            <div className="form-group to" ref={toRef}>
              <label>To</label>
              <input
                type="text"
                name="to"
                placeholder="Select destination"
                value={formData.to}
                onChange={handleChange}
                onFocus={() => handleFocus("to")}
                autoComplete="off"
              />
              {showToDropdown && toSuggestions.length > 0 && (
                <ul className="autocomplete-dropdown">
                  {toSuggestions.map((city, index) => (
                    <li
                      key={index}
                      onClick={() => handleSelectCity("to", city)}
                    >
                      {city}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Date */}
            <div
              className="form-group clickable"
              onClick={() => dateRef.current.showPicker()}
            >
              <label>Date</label>

              <span className="value">
                {formData.date ? formatDate(formData.date) : "Departure"}
              </span>

              <input
                ref={dateRef}
                type="date"
                name="date"
                value={formData.date}
                onChange={handleChange}
              />
            </div>

            {/* Removed Return section */}

            {/* Search */}
            <button className="search-btn" style={{width: '100%'}} onClick={handleSearch}>SEARCH</button>
          </div>
        </div>
      </div>

      {/* Custom Validation Popup */}
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
