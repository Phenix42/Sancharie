import React, { useState, useEffect, useRef } from "react";
import "./selectseat.css";
import { IoClose } from "react-icons/io5";
import { GiSteeringWheel } from "react-icons/gi";
import { useNavigate } from "react-router-dom";
import { bus as busApi } from "../services/api";
import { useBooking } from "../context/BookingContext";
import { useAuth } from "../context/AuthContext";
import AuthModal from "./Authantication/Login";
import ProfileCompletion from "./ProfileCompletion";
import { getCachedSeatLayout, subscribeSeatLayout } from "./MiniSeatPreview";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";
import { getBoardingPointsByInventoryType, getDroppingPointsByInventoryType } from "../utils/seatLayoutParser";
import { useToast } from "./Toast";

export default function SelectSeat({ bus, searchTokenId, onClose }) {
  const navigate = useNavigate();
  const { state: bookingState, actions } = useBooking();
  const { isAuthenticated, completeLogin } = useAuth();
  const toast = useToast();
  
  // Get session expired state from context
  const { sessionExpired } = bookingState;
  
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
  // Boarding/dropping points - will be set based on inventory type
  const [boardingPoints, setBoardingPoints] = useState([]);
  const [droppingPoints, setDroppingPoints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const hasFetchedRef = useRef(false);
  const pointsPanelRef = useRef(null);

  // Determine boarding/dropping points based on ETS inventory type rules:
  // - inventoryType 0, 1: Use points from search results (bus object)
  // - inventoryType 2, 3, 5, 6, 7: Use points from layout response
  const updateBoardingDroppingPoints = (layoutData) => {
    const inventoryType = bus?.inventoryType;
    
    // Get search results boarding/dropping points (already transformed to UI format)
    const searchBoardingPoints = bus?.BoardingPointsDetails || [];
    const searchDroppingPoints = bus?.DroppingPointsDetails || [];
    
    // Get layout response boarding/dropping points (ETS format)
    const layoutBoardingPoints = layoutData?.boardingPoints || [];
    const layoutDroppingPoints = layoutData?.droppingPoints || [];
    
    // Transform layout points to UI format if needed
    const transformedLayoutBoarding = layoutBoardingPoints?.map((p, idx) => ({
      CityPointIndex: p.id || idx,
      CityPointName: p.location || p.pointName,
      CityPointAddress: p.address || '',
      CityPointLandmark: p.landmark || '',
      CityPointTime: p.time,
      CityPointContactNumber: p.contactNumber || '',
      CityPointLocation: p.location || p.pointName,
    })) || [];
    
    const transformedLayoutDropping = layoutDroppingPoints?.map((p, idx) => ({
      CityPointIndex: p.id || idx,
      CityPointName: p.location || p.pointName,
      CityPointAddress: p.address || '',
      CityPointLandmark: p.landmark || '',
      CityPointTime: p.time,
      CityPointLocation: p.location || p.pointName,
    })) || [];
    
    // Apply ETS inventory type rules
    if ([0, 1].includes(inventoryType)) {
      // Use search results for inventoryType 0, 1
      setBoardingPoints(searchBoardingPoints);
      setDroppingPoints(searchDroppingPoints);
    } else {
      // Use layout response for inventoryType 2, 3, 5, 6, 7
      // But if layout points are empty, fallback to search results
      setBoardingPoints(transformedLayoutBoarding.length > 0 ? transformedLayoutBoarding : searchBoardingPoints);
      setDroppingPoints(transformedLayoutDropping.length > 0 ? transformedLayoutDropping : searchDroppingPoints);
    }
  };

  // Fetch only seat layout on mount (boarding/dropping points determined by inventory type)
  useEffect(() => {
    // Prevent duplicate API calls
    if (hasFetchedRef.current) return;

    if (!bus?.ResultIndex) {
      setError("Missing bus data");
      setLoading(false);
      return;
    }

    hasFetchedRef.current = true;

    // Check if seat layout is already cached (from prefetch)
    const cachedLayout = getCachedSeatLayout(bus.ResultIndex);
    
    if (cachedLayout) {
      console.log("SelectSeat: Using cached seat layout (instant!)");
      setSeatLayout(cachedLayout);
      setLoading(false);
      
      // Update boarding/dropping points based on inventory type
      updateBoardingDroppingPoints({ seats: cachedLayout });
      
      // Store in context
      actions.setSeatLayout(cachedLayout);
      return;
    }

    // Subscribe to updates (seat layout will be ready soon from prefetch)
    console.log("SelectSeat: Subscribing to seat layout updates");
    setLoading(true);
    setError(null);

    const unsubscribe = subscribeSeatLayout(
      bus.ResultIndex, 
      (seatData, err) => {
        if (err) {
          console.error("Error fetching seat data:", err);
          setError("Failed to load seat layout. Please try again.");
          hasFetchedRef.current = false;
        } else {
          setSeatLayout(seatData);
          
          // Update boarding/dropping points based on inventory type
          updateBoardingDroppingPoints({ seats: seatData });
          
          // Store in context
          actions.setSeatLayout(seatData);
        }
        setLoading(false);
      }
    );

    // Initial boarding/dropping points from bus object (for inventoryType 0, 1)
    updateBoardingDroppingPoints({});

    return unsubscribe;
  }, [bus?.ResultIndex]);

  // Process seat layout data from ETS API
  // ETS format: seats array with { id, row, column, zIndex, length, width, fare, available, sleeper, ladiesSeat, etc. }
  const processedSeats = React.useMemo(() => {
    if (!seatLayout || !Array.isArray(seatLayout)) return [];
    
    return seatLayout.map((seat) => ({
      id: seat.id,
      seatName: seat.id,
      price: parseFloat(seat.totalFareWithTaxes) || parseFloat(seat.fare) || 0,
      baseFare: parseFloat(seat.fare) || 0,
      serviceTaxAmount: parseFloat(seat.serviceTaxAmount) || 0,
      serviceTaxPer: parseFloat(seat.serviceTaxPer) || 0,
      operatorServiceCharge: parseFloat(seat.operatorServiceChargeAbsolute) || 0,
      status: seat.available === true ? "available" : "booked",
      isLadiesSeat: seat.ladiesSeat === true,
      isMalesSeat: seat.malesSeat === true,
      isUpper: seat.zIndex === 1, // zIndex 0 = lower, 1 = upper
      rowNo: seat.row,
      columnNo: seat.column,
      zIndex: seat.zIndex,
      seatType: seat.sleeper ? 2 : 1, // 1 = Seater, 2 = Sleeper/Berth
      length: seat.length || 1,
      width: seat.width || 1,
      ac: seat.ac === true,
      bookedBy: seat.bookedBy, // 'Male'/'Female' if booked
      reservedForSocialDistancing: seat.reservedForSocialDistancing === true,
      fullData: seat,
    }));
  }, [seatLayout]);

  // Determine bus type based on seat data
  const busTypeInfo = React.useMemo(() => {
    const seaterSeats = processedSeats.filter(s => s.seatType === 1 && s.length === 1 && s.width === 1);
    const sleeperSeats = processedSeats.filter(s => s.seatType === 2 || s.length > 1 || s.width > 1);
    const horizontalSleepers = processedSeats.filter(s => s.length > 1);
    const verticalSleepers = processedSeats.filter(s => s.width > 1);
    
    return {
      hasSeater: seaterSeats.length > 0,
      hasSleeper: sleeperSeats.length > 0,
      hasHorizontalSleeper: horizontalSleepers.length > 0,
      hasVerticalSleeper: verticalSleepers.length > 0,
      isMixed: seaterSeats.length > 0 && sleeperSeats.length > 0,
      seaterCount: seaterSeats.length,
      sleeperCount: sleeperSeats.length,
    };
  }, [processedSeats]);

  // Separate upper and lower deck seats
  const upperSeats = processedSeats.filter(s => s.isUpper);
  const lowerSeats = processedSeats.filter(s => !s.isUpper);

  // Organize seats into a grid layout based on row and column
  // ETS seat positions: row, column, zIndex, length (colspan), width (rowspan)
  // length=2, width=1: Horizontal sleeper (spans 2 columns)
  // length=1, width=2: Vertical sleeper (spans 2 rows)
  const organizeSeatsInGrid = (seats) => {
    if (seats.length === 0) return { grid: [], maxRow: 0, maxCol: 0 };
    
    const maxRow = Math.max(...seats.map(s => s.rowNo)) + 1;
    // For max column, consider that sleeper seats with length=2 span 2 columns
    const maxCol = Math.max(...seats.map(s => s.columnNo + (s.length > 1 ? s.length - 1 : 0))) + 1;
    
    // Create 2D grid initialized with null
    const grid = Array(maxRow).fill(null).map(() => Array(maxCol).fill(null));
    
    // Track cells occupied by multi-cell seats
    const occupiedCells = new Set();
    
    // Place each seat in its correct position
    seats.forEach(seat => {
      const row = seat.rowNo;
      const col = seat.columnNo;
      
      if (row >= 0 && row < maxRow && col >= 0 && col < maxCol) {
        // Place the seat at its primary position
        grid[row][col] = seat;
        
        // Mark additional cells as occupied for horizontal sleepers (length=2)
        if (seat.length > 1) {
          for (let c = col + 1; c < col + seat.length && c < maxCol; c++) {
            occupiedCells.add(`${row}-${c}`);
            // Mark as span cell (will be skipped in rendering)
            grid[row][c] = { ...seat, isSpanCell: true, spanParent: seat.id };
          }
        }
        
        // Mark additional cells as occupied for vertical sleepers (width=2)
        if (seat.width > 1) {
          for (let r = row + 1; r < row + seat.width && r < maxRow; r++) {
            occupiedCells.add(`${r}-${col}`);
            grid[r][col] = { ...seat, isSpanCell: true, spanParent: seat.id };
          }
        }
      }
    });
    
    return { grid, maxRow, maxCol, occupiedCells };
  };

  const lowerSeatGrid = organizeSeatsInGrid(lowerSeats);
  const upperSeatGrid = organizeSeatsInGrid(upperSeats);

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

  // Get bus type badge text
  const getBusTypeBadge = () => {
    if (busTypeInfo.isMixed) {
      return `Mixed Layout (${busTypeInfo.seaterCount} Seats, ${busTypeInfo.sleeperCount} Sleepers)`;
    } else if (busTypeInfo.hasSleeper) {
      return `Sleeper (${busTypeInfo.sleeperCount} Berths)`;
    } else if (busTypeInfo.hasSeater) {
      return `Seater (${busTypeInfo.seaterCount} Seats)`;
    }
    return bus?.BusType || "Bus Layout";
  };

  const toggleSeat = (seat) => {
    if (seat.status === "booked") return;

    setSelectedSeats((prev) => {
      const isDeselecting = prev.some(s => s.id === seat.id);
      const newSeats = isDeselecting
        ? prev.filter((s) => s.id !== seat.id)
        : [...prev, seat];

      // Auto-scroll to boarding/dropping points on first seat selection (mobile)
      if (!isDeselecting && prev.length === 0 && window.innerWidth <= 768) {
        setTimeout(() => {
          pointsPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 150);
      }

      return newSeats;
    });
  };

  // Calculate fare details using ETS seat fare breakdown
  const calculateFare = () => {
    // Sum up ETS fare components from selected seats
    const baseFare = selectedSeats.reduce((sum, s) => sum + (s.baseFare || s.price), 0);
    const serviceTax = selectedSeats.reduce((sum, s) => sum + (s.serviceTaxAmount || 0), 0);
    const operatorCharge = selectedSeats.reduce((sum, s) => sum + (s.operatorServiceCharge || 0), 0);
    
    // Total fare with taxes (already includes GST from ETS)
    const totalFareWithTaxes = selectedSeats.reduce((sum, s) => sum + s.price, 0);
    
    return {
      baseFare: Math.round(baseFare),
      serviceTax: Math.round(serviceTax),
      operatorCharge: Math.round(operatorCharge),
      totalFare: Math.round(totalFareWithTaxes),
      seatCount: selectedSeats.length,
    };
  };

  // Format time - handles both ETS format ("HH:MM AM/PM") and date strings
  const formatTime = (timeString) => {
    if (!timeString) return "";
    
    // If it's already in "HH:MM AM/PM" format, return as-is
    if (typeof timeString === 'string' && /^\d{1,2}:\d{2}\s*(AM|PM)?$/i.test(timeString.trim())) {
      return timeString.trim();
    }
    
    // Try parsing as date
    const date = new Date(timeString);
    if (!isNaN(date.getTime())) {
      return date.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    }
    
    // Return as-is if can't parse
    return timeString;
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
    const selectedBoardingPoint = boardingPoints.find(p => 
      (p.CityPointIndex ?? p.CityPointId) === boardingId
    );
    const selectedDroppingPoint = droppingPoints.find(p => 
      (p.CityPointIndex ?? p.CityPointId) === droppingId
    );
    
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
      toast.warning("Please select at least one seat");
      return;
    }
    if (!boardingId) {
      toast.warning("Please select a boarding point");
      return;
    }
    if (!droppingId) {
      toast.warning("Please select a dropping point");
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

  // Handle session expiration - go to home
  const handleGoHome = () => {
    actions.resetSession();
    navigate('/');
  };

  // Handle refresh search
  const handleRefreshSearch = () => {
    actions.resetSession();
    window.location.reload();
  };

  // Session Expired - show popup if session expires during seat selection
  if (sessionExpired) {
    return (
      <div className="selectseat-container">
        <div className="session-expired-overlay">
          <div className="session-expired-popup">
            <div className="session-expired-icon">
              <AlertTriangle size={56} strokeWidth={1.5} />
            </div>
            <h2>Session Expired</h2>
            <p>Your booking session has expired after 10 minutes. Please start a new search to continue.</p>
            <div className="session-expired-actions">
              <button className="session-btn-primary" onClick={handleGoHome}>
                <Home size={20} />
                Go to Home
              </button>
              <button className="session-btn-secondary" onClick={handleRefreshSearch}>
                <RefreshCw size={20} />
                Refresh Search
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
        <span className="bus-type-badge">{getBusTypeBadge()}</span>
        <IoClose className="close-btn" onClick={onClose} />
      </div>

      <div className="selectseat-body">
        {/* ================= LEFT – BUS VIEW ================= */}
        <div className={`bus-view ${busTypeInfo.isMixed ? 'mixed-layout' : busTypeInfo.hasSleeper ? 'sleeper-layout' : 'seater-layout'}`}>
          {/* LEGEND */}
          <div className="legend">
            {busTypeInfo.isMixed && (
              <>
                <span><i className="legend-icon seat-icon available" /> Seat</span>
                <span><i className="legend-icon sleeper-icon available" /> Sleeper</span>
              </>
            )}
            {!busTypeInfo.isMixed && busTypeInfo.hasSleeper && (
              <span><i className="legend-icon sleeper-icon available" /> Available</span>
            )}
            {!busTypeInfo.isMixed && busTypeInfo.hasSeater && (
              <span><i className="legend-icon seat-icon available" /> Available</span>
            )}
            <span><i className={`legend-icon ${busTypeInfo.hasSleeper ? 'sleeper-icon' : 'seat-icon'} selected`} /> Selected</span>
            <span><i className={`legend-icon ${busTypeInfo.hasSleeper ? 'sleeper-icon' : 'seat-icon'} female`} /> Female</span>
            <span><i className={`legend-icon ${busTypeInfo.hasSleeper ? 'sleeper-icon' : 'seat-icon'} booked`} /> Booked</span>
          </div>

          {/* SEAT LAYOUT FROM API */}
          {upperSeatGrid.maxRow > 0 && (
            <div className="deck">
              <div className="deck-label">Upper Deck</div>
              <div className="seat-grid-container">
                {upperSeatGrid.grid.map((row, rowIdx) => (
                  <div key={`upper-row-${rowIdx}`} className="seat-row">
                    {row.map((seat, colIdx) => {
                      // Skip span cells (part of a multi-cell sleeper)
                      if (seat?.isSpanCell) return null;
                      
                      if (seat) {
                        // Determine seat type based on ETS dimensions
                        // length=2, width=1: Horizontal sleeper
                        // length=1, width=2: Vertical sleeper
                        // length=1, width=1, sleeper=true: Semi-sleeper
                        const isHorizontalSleeper = seat.length > 1;
                        const isVerticalSleeper = seat.width > 1;
                        const isSleeper = seat.seatType === 2 || isHorizontalSleeper || isVerticalSleeper;
                        
                        const seatClass = isHorizontalSleeper ? 'sleeper horizontal-sleeper' 
                          : isVerticalSleeper ? 'sleeper vertical-sleeper'
                          : isSleeper ? 'sleeper' : 'seat';
                        
                        return (
                          <div
                            key={seat.id}
                            className={`seat-wrapper ${isSleeper ? 'sleeper-wrapper' : ''} ${isHorizontalSleeper ? 'horizontal' : ''} ${isVerticalSleeper ? 'vertical' : ''}`}
                            style={{
                              ...(isHorizontalSleeper ? { gridColumn: `span ${seat.length}` } : {}),
                              ...(isVerticalSleeper ? { gridRow: `span ${seat.width}` } : {})
                            }}
                          >
                            <div
                              className={`
                                ${seatClass}
                                ${seat.status}
                                ${seat.isLadiesSeat ? 'female' : ''}
                                ${seat.isMalesSeat ? 'male' : ''}
                                ${seat.reservedForSocialDistancing ? 'social-distancing' : ''}
                                ${selectedSeats.some(sel => sel.id === seat.id) ? 'active' : ''}
                              `}
                              onClick={() => toggleSeat(seat)}
                              title={`${seat.seatName} - ₹${Math.round(seat.price)} ${seat.isLadiesSeat ? '(Ladies Only)' : seat.isMalesSeat ? '(Gents Only)' : ''}`}
                            >
                              <div className="seat-tooltip">{seat.seatName}</div>
                              <span className="seat-price">₹{Math.round(seat.price)}</span>
                            </div>
                          </div>
                        );
                      }
                      
                      return (
                        <div key={`empty-upper-${rowIdx}-${colIdx}`} className="seat-wrapper empty-seat"></div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* LOWER DECK WITH STEERING */}
          <div className="deck-section lower-with-steering">
            <div className="driver">
              <GiSteeringWheel size={28} />
              <span className="driver-label">Driver</span>
            </div>
            <div className="seat-grid-container">
              {lowerSeatGrid.grid.map((row, rowIdx) => (
                <div key={`lower-row-${rowIdx}`} className="seat-row">
                  {row.map((seat, colIdx) => {
                    // Skip span cells (part of a multi-cell sleeper)
                    if (seat?.isSpanCell) return null;
                    
                    if (seat) {
                      // Determine seat type based on ETS dimensions
                      const isHorizontalSleeper = seat.length > 1;
                      const isVerticalSleeper = seat.width > 1;
                      const isSleeper = seat.seatType === 2 || isHorizontalSleeper || isVerticalSleeper;
                      
                      const seatClass = isHorizontalSleeper ? 'sleeper horizontal-sleeper' 
                        : isVerticalSleeper ? 'sleeper vertical-sleeper'
                        : isSleeper ? 'sleeper' : 'seat';
                      
                      return (
                        <div
                          key={seat.id}
                          className={`seat-wrapper ${isSleeper ? 'sleeper-wrapper' : ''} ${isHorizontalSleeper ? 'horizontal' : ''} ${isVerticalSleeper ? 'vertical' : ''}`}
                          style={{
                            ...(isHorizontalSleeper ? { gridColumn: `span ${seat.length}` } : {}),
                            ...(isVerticalSleeper ? { gridRow: `span ${seat.width}` } : {})
                          }}
                        >
                          <div
                            className={`
                              ${seatClass}
                              ${seat.status}
                              ${seat.isLadiesSeat ? 'female' : ''}
                              ${seat.isMalesSeat ? 'male' : ''}
                              ${seat.reservedForSocialDistancing ? 'social-distancing' : ''}
                              ${selectedSeats.some(sel => sel.id === seat.id) ? 'active' : ''}
                            `}
                            onClick={() => toggleSeat(seat)}
                            title={`${seat.seatName} - ₹${Math.round(seat.price)} ${seat.isLadiesSeat ? '(Ladies Only)' : seat.isMalesSeat ? '(Gents Only)' : ''}`}
                          >
                            <div className="seat-tooltip">{seat.seatName}</div>
                            <span className="seat-price">₹{Math.round(seat.price)}</span>
                          </div>
                        </div>
                      );
                    }
                    
                    return (
                      <div key={`empty-lower-${rowIdx}-${colIdx}`} className="seat-wrapper empty-seat"></div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* SELECTED SEATS SUMMARY */}
        
        </div>

        {/* ================= RIGHT – POINTS ================= */}
        <div className="points-panel" ref={pointsPanelRef}>
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
                filteredBoardingPoints.map((p, idx) => {
                  const pointId = p.CityPointIndex ?? p.CityPointId ?? idx;
                  return (
                    <label key={`boarding-${pointId}`} className="point-row">
                      <input
                        type="radio"
                        name="boarding"
                        checked={boardingId === pointId}
                        onChange={() => {
                          setBoardingId(pointId);
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
                  );
                })
              ) : (
                <p className="no-points">{boardingSearch ? "No matching boarding points" : "No boarding points available"}</p>
              )
            ) : (
              filteredDroppingPoints.length > 0 ? (
                filteredDroppingPoints.map((p, idx) => {
                  const pointId = p.CityPointIndex ?? p.CityPointId ?? idx;
                  return (
                    <label key={`dropping-${pointId}`} className="point-row">
                      <input
                        type="radio"
                        name="dropping"
                        checked={droppingId === pointId}
                        onChange={() => {
                          setDroppingId(pointId);
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
                  );
                })
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
