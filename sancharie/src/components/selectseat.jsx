import React, { useState, useEffect, useRef } from "react";
import "./selectseat.css";
import { IoClose } from "react-icons/io5";
import { GiSteeringWheel } from "react-icons/gi";
import { useNavigate } from "react-router-dom";
import { getSeatLayout } from "../services/busApi";
import { useBooking } from "../context/BookingContext";
import { useAuth } from "../context/AuthContext";
import AuthModal from "./Authantication/Login";
import ProfileCompletion from "./ProfileCompletion";

export default function SelectSeat({ bus, searchTokenId, onClose }) {
  const navigate = useNavigate();
  const { actions } = useBooking();
  const { isAuthenticated, completeLogin } = useAuth();
  
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [activeTab, setActiveTab] = useState("boarding");
  const [boardingId, setBoardingId] = useState(null);
  const [droppingId, setDroppingId] = useState(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showProfileCompletion, setShowProfileCompletion] = useState(false);
  const [boardingSearch, setBoardingSearch] = useState("");
  const [droppingSearch, setDroppingSearch] = useState("");
  
  // API data states
  const [seatLayout, setSeatLayout] = useState(null);
  // Use boarding/dropping points from bus object (already in search results)
  const [boardingPoints, setBoardingPoints] = useState(bus?.BoardingPointsDetails || []);
  const [droppingPoints, setDroppingPoints] = useState(bus?.DroppingPointsDetails || []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const hasFetchedRef = useRef(false);

  // Fetch only seat layout on mount (boarding/dropping points come from search results)
  useEffect(() => {
    // Prevent duplicate API calls
    if (hasFetchedRef.current) return;
    
    const fetchData = async () => {
      console.log("SelectSeat received - searchTokenId:", searchTokenId, "bus.ResultIndex:", bus?.ResultIndex);
      
      if (!searchTokenId || !bus?.ResultIndex) {
        setError("Missing search token or bus data");
        setLoading(false);
        return;
      }

      hasFetchedRef.current = true;

      try {
        setLoading(true);
        setError(null);

        // Only fetch seat layout - boarding/dropping points are already in bus object
        const seatData = await getSeatLayout(searchTokenId, bus.ResultIndex);

        setSeatLayout(seatData.seatLayout);
        
        // Use boarding/dropping points from bus object
        const bPoints = bus?.BoardingPointsDetails || [];
        const dPoints = bus?.DroppingPointsDetails || [];
        setBoardingPoints(bPoints);
        setDroppingPoints(dPoints);

        // Store in context
        actions.setSeatLayout(seatData.seatLayout);
        actions.setBoardingPoints(bPoints);
        actions.setDroppingPoints(dPoints);

      } catch (err) {
        console.error("Error fetching seat data:", err);
        setError(err.message || "Failed to load seat layout");
        hasFetchedRef.current = false; // Allow retry on error
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [searchTokenId, bus?.ResultIndex]);

  // Process seat layout data from API
  // The API returns SeatDetails as a 2D array where each array is a row/section
  // Each row contains seats that should be displayed together
  const { lowerSeatGrid, upperSeatGrid } = React.useMemo(() => {
    if (!seatLayout?.SeatDetails) return { lowerSeatGrid: [], upperSeatGrid: [] };
    
    const lowerGrid = [];
    const upperGrid = [];
    
    // Process each row from the API
    seatLayout.SeatDetails.forEach((row, rowIndex) => {
      // Separate this row into upper and lower deck seats
      const lowerRowSeats = [];
      const upperRowSeats = [];
      
      row.forEach((seat, seatIndex) => {
        // Detect aisle spaces: seats with very low price (0 or near 0) and SeatStatus false
        // or seats positioned in typical aisle locations
        const isAisle = !seat.SeatStatus && (
          seat.SeatFare === 0 || 
          seat.Price?.PublishedPrice === 0 ||
          seat.SeatName?.toLowerCase().includes('aisle') ||
          // Aisle detection: typically middle seats in a row with SeatStatus false
          (!seat.IsLadiesSeat && !seat.IsMalesSeat && seat.SeatFare < 100)
        );
        
        const processedSeat = {
          id: `${seat.SeatName}-${rowIndex}-${seatIndex}`,
          seatName: seat.SeatName,
          price: seat.SeatFare || seat.Price?.PublishedPrice || 0,
          status: isAisle ? "aisle" : (seat.SeatStatus ? "available" : "booked"),
          isLadiesSeat: seat.IsLadiesSeat,
          isMalesSeat: seat.IsMalesSeat,
          isUpper: seat.IsUpper,
          seatType: seat.SeatType,
          seatIndex: seat.SeatIndex,
          height: seat.Height || 1,
          width: seat.Width || 1,
          isAisle: isAisle,
          fullData: seat,
        };
        
        if (seat.IsUpper) {
          upperRowSeats.push(processedSeat);
        } else {
          lowerRowSeats.push(processedSeat);
        }
      });
      
      // Add non-empty rows to their respective grids
      if (lowerRowSeats.length > 0) {
        lowerGrid.push(lowerRowSeats);
      }
      if (upperRowSeats.length > 0) {
        upperGrid.push(upperRowSeats);
      }
    });
    
    return { lowerSeatGrid: lowerGrid, upperSeatGrid: upperGrid };
  }, [seatLayout]);

  // Filter boarding and dropping points based on search
  const filteredBoardingPoints = React.useMemo(() => {
    if (!boardingSearch.trim()) return boardingPoints;
    const search = boardingSearch.toLowerCase();
    return boardingPoints.filter(p => 
      (p.CityPointName?.toLowerCase().includes(search)) ||
      (p.CityPointLocation?.toLowerCase().includes(search)) ||
      (p.CityPointAddress?.toLowerCase().includes(search)) ||
      (p.CityPointLandmark?.toLowerCase().includes(search))
    );
  }, [boardingPoints, boardingSearch]);

  const filteredDroppingPoints = React.useMemo(() => {
    if (!droppingSearch.trim()) return droppingPoints;
    const search = droppingSearch.toLowerCase();
    return droppingPoints.filter(p => 
      (p.CityPointName?.toLowerCase().includes(search)) ||
      (p.CityPointLocation?.toLowerCase().includes(search)) ||
      (p.CityPointAddress?.toLowerCase().includes(search)) ||
      (p.CityPointLandmark?.toLowerCase().includes(search))
    );
  }, [droppingPoints, droppingSearch]);

  // Determine if bus is sleeper or seater based on BusType
  const busType = bus?.BusType?.toLowerCase() || "";
  const isSleeper = busType.includes("sleeper") || busType.includes("semi sleeper");
  const isSeater = busType.includes("seater") && !isSleeper;
  
  // For mixed buses (seater/sleeper), check seat data
  const hasMixedLayout = busType.includes("seater") && busType.includes("sleeper");

  const toggleSeat = (seat) => {
    if (seat.status === "booked") return;

    setSelectedSeats((prev) =>
      prev.some(s => s.id === seat.id)
        ? prev.filter((s) => s.id !== seat.id)
        : [...prev, seat]
    );
  };

  // Calculate fare details
  const calculateFare = () => {
    const baseFare = selectedSeats.reduce((sum, s) => sum + s.price, 0);
    const gst = Math.round(baseFare * 0.05);
    const serviceCharge = selectedSeats.length * 30;
    const totalFare = baseFare + gst + serviceCharge;
    
    return {
      baseFare,
      gst,
      serviceCharge,
      totalFare,
      seatCount: selectedSeats.length,
    };
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

  const handleLoginSuccess = async (phone) => {
    const result = await completeLogin(phone);
    setShowLoginModal(false);
    
    // Show profile completion for new users or users with incomplete profile
    if (result.success && (result.isNewUser || !result.isProfileComplete)) {
      setShowProfileCompletion(true);
    } else {
      // After successful login, proceed with booking
      proceedToBooking();
    }
  };

  const handleProfileComplete = () => {
    setShowProfileCompletion(false);
    // After profile is complete, proceed with booking
    proceedToBooking();
  };

  const proceedToBooking = () => {
    const fare = calculateFare();
    const selectedBoardingPoint = boardingPoints.find(p => p.CityPointIndex === boardingId);
    const selectedDroppingPoint = droppingPoints.find(p => p.CityPointIndex === droppingId);
    
    console.log("proceedToBooking - fare:", fare);
    console.log("proceedToBooking - selectedSeats:", selectedSeats);
    console.log("proceedToBooking - selectedBoardingPoint:", selectedBoardingPoint);
    console.log("proceedToBooking - selectedDroppingPoint:", selectedDroppingPoint);
    
    // Store selections in context
    actions.setSelectedSeats(selectedSeats.map(s => s.seatName));
    actions.setSelectedBoardingPoint(selectedBoardingPoint);
    actions.setSelectedDroppingPoint(selectedDroppingPoint);
    
    // Navigate to booking details page with state
    navigate('/booking-details', {
      state: {
        fareData: fare,
        selectedSeats: selectedSeats.map(s => ({
          seatName: s.seatName,
          price: s.price,
          fullData: s.fullData
        })),
        boardingPoint: {
          id: selectedBoardingPoint.CityPointIndex,
          name: selectedBoardingPoint.CityPointName,
          time: formatTime(selectedBoardingPoint.CityPointTime),
          location: selectedBoardingPoint.CityPointLocation,
          address: selectedBoardingPoint.CityPointAddress,
          contactNumber: selectedBoardingPoint.CityPointContactNumber,
          landmark: selectedBoardingPoint.CityPointLandmark,
        },
        droppingPoint: {
          id: selectedDroppingPoint.CityPointIndex,
          name: selectedDroppingPoint.CityPointName,
          time: formatTime(selectedDroppingPoint.CityPointTime),
          location: selectedDroppingPoint.CityPointLocation,
        },
        bus: {
          ...bus,
          resultIndex: bus.ResultIndex,
          searchTokenId: searchTokenId,
        }
      }
    });
  };

  const handleGetFare = () => {
    if (selectedSeats.length === 0) {
      alert("Please select at least one seat");
      return;
    }
    if (!boardingId) {
      alert("Please select a boarding point");
      return;
    }
    if (!droppingId) {
      alert("Please select a dropping point");
      return;
    }

    // Check if user is logged in
    if (!isAuthenticated) {
      setShowLoginModal(true);
      return;
    }
    
    // User is logged in, proceed to booking
    proceedToBooking();
  };

  // Loading state
  if (loading) {
    return (
      <div className="selectseat-container">
        <div className="selectseat-header">
          <h4>{bus?.TravelName || "Loading..."} • {bus?.BusType || ""}</h4>
          <IoClose className="close-btn" onClick={onClose} />
        </div>
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p className="loading-text">Loading seat layout...</p>
          <p className="loading-subtext">Please wait while we fetch available seats</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="selectseat-container">
        <div className="selectseat-header">
          <h4>{bus?.TravelName || "Error"}</h4>
          <IoClose className="close-btn" onClick={onClose} />
        </div>
        <div className="error-container">
          <div className="error-icon">⚠️</div>
          <p className="error-text">{error}</p>
          <p className="error-subtext">Something went wrong while loading seats</p>
          <button className="retry-btn" onClick={onClose}>Close & Try Again</button>
        </div>
      </div>
    );
  }

  return (
    <div className="selectseat-container">
      {/* HEADER */}
      <div className="selectseat-header">
        <h4>{bus?.TravelName || "Bus Seat Layout"}</h4>
        <span className="bus-type-badge">{bus?.BusType}</span>
        <IoClose className="close-btn" onClick={onClose} />
      </div>

      <div className="selectseat-body">
        {/* ================= LEFT – BUS VIEW ================= */}
        <div className={`bus-view ${isSleeper ? 'sleeper-layout' : 'seater-layout'}`}>
          {/* LEGEND */}
          <div className="legend">
            <span><i className={`box available ${isSleeper ? 'sleeper-box' : 'seater-box'}`} /> Available</span>
            <span><i className={`box selected ${isSleeper ? 'sleeper-box' : 'seater-box'}`} /> Selected</span>
            <span><i className={`box female ${isSleeper ? 'sleeper-box' : 'seater-box'}`} /> Female</span>
            <span><i className={`box booked ${isSleeper ? 'sleeper-box' : 'seater-box'}`} /> Booked</span>
          </div>

          {/* SEAT LAYOUT FROM API */}
          {upperSeatGrid.length > 0 && (
            <div className="deck">
              <div className="deck-label">Upper Deck</div>
              <div className={isSleeper ? "sleeper-grid" : "seater-grid"}>
                {upperSeatGrid.map((row, rowIdx) => (
                  <div key={`upper-row-${rowIdx}`} className={`seat-row ${rowIdx === 0 ? 'front-row' : ''}`}>
                    {row.map((seat, colIdx) => (
                      seat.isAisle ? (
                        <div
                          key={seat.id}
                          className={`seat-wrapper ${!isSleeper ? 'seater-wrapper' : ''} aisle-space`}
                        >
                          <div className="aisle"></div>
                        </div>
                      ) : (
                        <div
                          key={seat.id}
                          className={`seat-wrapper ${!isSleeper ? 'seater-wrapper' : ''}`}
                        >
                          <div
                            className={`${isSleeper ? 'sleeper' : 'seat'} ${seat.status} ${seat.isLadiesSeat ? 'female' : ''} ${selectedSeats.some(sel => sel.id === seat.id) ? "active" : ""}`}
                            onClick={() => toggleSeat(seat)}
                          >
                            <span className="seat-price">₹{seat.price}</span>
                            <span className="seat-tooltip">{seat.seatName}</span>
                          </div>
                        </div>
                      )
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* LOWER DECK WITH STEERING */}
          <div className="deck-section lower-with-steering">
            <div className="driver">
              <GiSteeringWheel size={28} />
            </div>
            <div className={isSleeper ? "sleeper-grid" : "seater-grid"}>
              {lowerSeatGrid.map((row, rowIdx) => (
                <div key={`lower-row-${rowIdx}`} className={`seat-row ${rowIdx === 0 ? 'front-row' : ''}`}>
                  {row.map((seat, colIdx) => (
                    seat.isAisle ? (
                      <div
                        key={seat.id}
                        className={`seat-wrapper ${!isSleeper ? 'seater-wrapper' : ''} aisle-space`}
                      >
                        <div className="aisle"></div>
                      </div>
                    ) : (
                      <div
                        key={seat.id}
                        className={`seat-wrapper ${!isSleeper ? 'seater-wrapper' : ''}`}
                      >
                        <div
                          className={`${isSleeper ? 'sleeper' : 'seat'} ${seat.status} ${seat.isLadiesSeat ? 'female' : ''} ${selectedSeats.some(sel => sel.id === seat.id) ? "active" : ""}`}
                          onClick={() => toggleSeat(seat)}
                        >
                          <span className="seat-price">₹{seat.price}</span>
                          <span className="seat-tooltip">{seat.seatName}</span>
                        </div>
                      </div>
                    )
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* SELECTED SEATS SUMMARY */}
        
        </div>

        {/* ================= RIGHT – POINTS ================= */}
        <div className="points-panel">
          <div className="tabs">
            <button
              className={activeTab === "boarding" ? "active" : ""}
              onClick={() => setActiveTab("boarding")}
            >
              Boarding Points ({boardingPoints.length})
            </button>
            <button
              className={activeTab === "dropping" ? "active" : ""}
              onClick={() => setActiveTab("dropping")}
            >
              Dropping Points ({droppingPoints.length})
            </button>
          </div>

          <input 
            className="search" 
            placeholder={`Search ${activeTab === "boarding" ? "Boarding" : "Dropping"} Point`}
            value={activeTab === "boarding" ? boardingSearch : droppingSearch}
            onChange={(e) => {
              if (activeTab === "boarding") {
                setBoardingSearch(e.target.value);
              } else {
                setDroppingSearch(e.target.value);
              }
            }}
          />

          <div className="points-list">
            {activeTab === "boarding" ? (
              filteredBoardingPoints.length > 0 ? (
                filteredBoardingPoints.map((p) => (
                  <label key={p.CityPointIndex} className="point-row">
                    <input
                      type="radio"
                      name="boarding"
                      checked={boardingId === p.CityPointIndex}
                      onChange={() => {
                        setBoardingId(p.CityPointIndex);
                        setBoardingSearch(""); // Clear search after selection
                        setTimeout(() => setActiveTab("dropping"), 300);
                      }}
                    />
                    <div className="point-info">
                      <div className="point-head">
                        <strong>{p.CityPointName}</strong>
                        <span>{formatTime(p.CityPointTime)}</span>
                      </div>
                      <p>{p.CityPointLocation || p.CityPointAddress || p.CityPointLandmark}</p>
                      {p.CityPointContactNumber && (
                        <p className="contact">📞 {p.CityPointContactNumber}</p>
                      )}
                    </div>
                  </label>
                ))
              ) : (
                <p className="no-points">{boardingSearch ? "No matching boarding points" : "No boarding points available"}</p>
              )
            ) : (
              filteredDroppingPoints.length > 0 ? (
                filteredDroppingPoints.map((p) => (
                  <label key={p.CityPointIndex} className="point-row">
                    <input
                      type="radio"
                      name="dropping"
                      checked={droppingId === p.CityPointIndex}
                      onChange={() => {
                        setDroppingId(p.CityPointIndex);
                        setDroppingSearch(""); // Clear search after selection
                      }}
                    />
                    <div className="point-info">
                      <div className="point-head">
                        <strong>{p.CityPointName}</strong>
                        <span>{formatTime(p.CityPointTime)}</span>
                      </div>
                      <p>{p.CityPointLocation}</p>
                    </div>
                  </label>
                ))
              ) : (
                <p className="no-points">{droppingSearch ? "No matching dropping points" : "No dropping points available"}</p>
              )
            )}
          </div>

          {/* FARE ACTION BAR - Only show when seats are selected */}
          {selectedSeats.length > 0 && (
            <div className="fare-action-bar">
              <div className="fare-summary">
                <div className="fare-amount">
                  <span className="final-price">₹{calculateFare().baseFare}</span>
                </div>
                <span className="fare-note">Excl. of taxes</span>
              </div>
              <div className="seat-count">
                <span className="count">{selectedSeats.length}</span>
                <span className="label">Seat(s)</span>
              </div>
              <button 
                className={`proceed-btn ${!boardingId || !droppingId ? 'disabled' : ''}`}
                onClick={handleGetFare}
                disabled={!boardingId || !droppingId}
              >
                Proceed
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Login Modal - shown when user needs to login to proceed */}
      <AuthModal 
        isOpen={showLoginModal} 
        onClose={() => setShowLoginModal(false)}
        onLoginSuccess={handleLoginSuccess}
      />

      {/* Profile Completion Modal - shown for first-time users */}
      <ProfileCompletion 
        isOpen={showProfileCompletion}
        onClose={() => {
          setShowProfileCompletion(false);
          proceedToBooking(); // Proceed even if skipped
        }}
        onComplete={handleProfileComplete}
      />
    </div>
  );
}
