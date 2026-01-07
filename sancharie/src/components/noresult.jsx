import React from "react";
import { useNavigate } from "react-router-dom";
import "./noresult.css";
import Logo from "../assets/logosancharie.svg";

export default function NoResult({ searchParams }) {
  const navigate = useNavigate();

  const handleModifySearch = () => {
    navigate("/");
  };

  return (
    <div className="no-result-page">
      <div className="no-result-container">
        <div className="no-result-content">
          {/* Logo with animation */}
          <div className="no-result-logo">
            <img src={Logo} alt="Sancharie" />
          </div>

          {/* Bus illustration */}
          <div className="bus-illustration-wrapper">
            <svg viewBox="0 0 240 140" className="bus-svg">
              {/* Road */}
              <rect x="0" y="115" width="240" height="8" fill="#e0e0e0" rx="4"/>
              <line x1="20" y1="119" x2="50" y2="119" stroke="#bdbdbd" strokeWidth="2" strokeDasharray="8,6"/>
              <line x1="70" y1="119" x2="100" y2="119" stroke="#bdbdbd" strokeWidth="2" strokeDasharray="8,6"/>
              <line x1="140" y1="119" x2="170" y2="119" stroke="#bdbdbd" strokeWidth="2" strokeDasharray="8,6"/>
              <line x1="190" y1="119" x2="220" y2="119" stroke="#bdbdbd" strokeWidth="2" strokeDasharray="8,6"/>
              
              {/* Bus body */}
              <rect x="40" y="55" width="160" height="55" rx="8" fill="#f5f5f5" stroke="#ddd" strokeWidth="2"/>
              
              {/* Windows */}
              <rect x="55" y="65" width="28" height="24" rx="4" fill="#e3f2fd" stroke="#90caf9" strokeWidth="1.5"/>
              <rect x="90" y="65" width="28" height="24" rx="4" fill="#e3f2fd" stroke="#90caf9" strokeWidth="1.5"/>
              <rect x="125" y="65" width="28" height="24" rx="4" fill="#e3f2fd" stroke="#90caf9" strokeWidth="1.5"/>
              <rect x="160" y="65" width="28" height="24" rx="4" fill="#e3f2fd" stroke="#90caf9" strokeWidth="1.5"/>
              
              {/* Front section */}
              <rect x="40" y="55" width="10" height="55" rx="4" fill="#9c7635"/>
              
              {/* Wheels */}
              <circle cx="75" cy="110" r="14" fill="#424242"/>
              <circle cx="75" cy="110" r="8" fill="#757575"/>
              <circle cx="75" cy="110" r="3" fill="#424242"/>
              <circle cx="165" cy="110" r="14" fill="#424242"/>
              <circle cx="165" cy="110" r="8" fill="#757575"/>
              <circle cx="165" cy="110" r="3" fill="#424242"/>
              
              {/* Question mark cloud */}
              <ellipse cx="120" cy="28" rx="35" ry="22" fill="#fff" stroke="#e0e0e0" strokeWidth="1.5"/>
              <text x="120" y="35" textAnchor="middle" fontSize="22" fontWeight="bold" fill="#d84e55">?</text>
            </svg>
          </div>

          {/* Main message */}
          <h1 className="no-result-title">No Buses Available</h1>
          <p className="no-result-subtitle">
            We couldn't find any buses for your selected route
          </p>

          {/* Route info card */}
          <div className="route-info-card">
            <div className="route-cities">
              <span className="city-name">{searchParams?.from || "Origin"}</span>
              <div className="route-line">
                <span className="dot"></span>
                <span className="line"></span>
                <span className="arrow">→</span>
                <span className="line"></span>
                <span className="dot"></span>
              </div>
              <span className="city-name">{searchParams?.to || "Destination"}</span>
            </div>
            <div className="travel-date">
              
              <span className="date-text">
                {searchParams?.date 
                  ? new Date(searchParams.date).toLocaleDateString('en-GB', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric'
                    })
                  : "Date not selected"
                }
              </span>
            </div>
          </div>

     

          {/* Action button */}
          <button 
            className="modify-search-btn"
            onClick={handleModifySearch}
          >
            <span className="btn-icon">←</span>
            Modify Search
          </button>
        </div>
      </div>
    </div>
  );
}
