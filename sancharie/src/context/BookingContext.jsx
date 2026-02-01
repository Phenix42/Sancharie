import React, { createContext, useContext, useReducer, useEffect, useState, useCallback } from "react";

// Session duration constant (10 minutes)
const SESSION_DURATION = 10 * 60 * 1000;

// Initial state
const initialState = {
  // Session data
  sessionStartTime: null,
  sessionExpired: false,
  // Search data
  searchTokenId: null,
  searchResults: [],
  searchParams: {
    from: "",
    to: "",
    fromId: "",
    toId: "",
    date: "",
    returnDate: "",
  },
  
  // Selected bus data
  selectedBus: null,
  
  // Seat selection
  seatLayout: null,
  selectedSeats: [],
  
  // Boarding/Dropping points
  boardingPoints: [],
  droppingPoints: [],
  selectedBoardingPoint: null,
  selectedDroppingPoint: null,
  
  // Passenger details
  passengers: [],
  contactDetails: {
    countryCode: "+91",
    phone: "",
    email: "",
    state: "",
    whatsappUpdates: false,
  },
  
  // Block seat response
  blockSeatData: null,
  
  // Booking data
  bookingData: null,
  
  // Loading states
  isLoading: false,
  error: null,
};

// Action types
const ACTIONS = {
  SET_SESSION_START: "SET_SESSION_START",
  SET_SESSION_EXPIRED: "SET_SESSION_EXPIRED",
  RESET_SESSION: "RESET_SESSION",
  SET_SEARCH_TOKEN: "SET_SEARCH_TOKEN",
  SET_SEARCH_RESULTS: "SET_SEARCH_RESULTS",
  SET_SEARCH_PARAMS: "SET_SEARCH_PARAMS",
  SET_SELECTED_BUS: "SET_SELECTED_BUS",
  SET_SEAT_LAYOUT: "SET_SEAT_LAYOUT",
  SET_SELECTED_SEATS: "SET_SELECTED_SEATS",
  SET_BOARDING_POINTS: "SET_BOARDING_POINTS",
  SET_DROPPING_POINTS: "SET_DROPPING_POINTS",
  SET_SELECTED_BOARDING_POINT: "SET_SELECTED_BOARDING_POINT",
  SET_SELECTED_DROPPING_POINT: "SET_SELECTED_DROPPING_POINT",
  SET_PASSENGERS: "SET_PASSENGERS",
  SET_CONTACT_DETAILS: "SET_CONTACT_DETAILS",
  SET_BLOCK_SEAT_DATA: "SET_BLOCK_SEAT_DATA",
  SET_BOOKING_DATA: "SET_BOOKING_DATA",
  SET_LOADING: "SET_LOADING",
  SET_ERROR: "SET_ERROR",
  RESET_BOOKING: "RESET_BOOKING",
  RESET_ALL: "RESET_ALL",
};

// Reducer
function bookingReducer(state, action) {
  switch (action.type) {
    case ACTIONS.SET_SESSION_START:
      return { ...state, sessionStartTime: action.payload, sessionExpired: false };
    
    case ACTIONS.SET_SESSION_EXPIRED:
      return { ...state, sessionExpired: action.payload };
    
    case ACTIONS.RESET_SESSION:
      return { ...state, sessionStartTime: null, sessionExpired: false };
    
    case ACTIONS.SET_SEARCH_TOKEN:
      return { ...state, searchTokenId: action.payload };
    
    case ACTIONS.SET_SEARCH_RESULTS:
      return { ...state, searchResults: action.payload };
    
    case ACTIONS.SET_SEARCH_PARAMS:
      return { ...state, searchParams: { ...state.searchParams, ...action.payload } };
    
    case ACTIONS.SET_SELECTED_BUS:
      return { ...state, selectedBus: action.payload };
    
    case ACTIONS.SET_SEAT_LAYOUT:
      return { ...state, seatLayout: action.payload };
    
    case ACTIONS.SET_SELECTED_SEATS:
      return { ...state, selectedSeats: action.payload };
    
    case ACTIONS.SET_BOARDING_POINTS:
      return { ...state, boardingPoints: action.payload };
    
    case ACTIONS.SET_DROPPING_POINTS:
      return { ...state, droppingPoints: action.payload };
    
    case ACTIONS.SET_SELECTED_BOARDING_POINT:
      return { ...state, selectedBoardingPoint: action.payload };
    
    case ACTIONS.SET_SELECTED_DROPPING_POINT:
      return { ...state, selectedDroppingPoint: action.payload };
    
    case ACTIONS.SET_PASSENGERS:
      return { ...state, passengers: action.payload };
    
    case ACTIONS.SET_CONTACT_DETAILS:
      return { ...state, contactDetails: { ...state.contactDetails, ...action.payload } };
    
    case ACTIONS.SET_BLOCK_SEAT_DATA:
      return { ...state, blockSeatData: action.payload };
    
    case ACTIONS.SET_BOOKING_DATA:
      return { ...state, bookingData: action.payload };
    
    case ACTIONS.SET_LOADING:
      return { ...state, isLoading: action.payload };
    
    case ACTIONS.SET_ERROR:
      return { ...state, error: action.payload };
    
    case ACTIONS.RESET_BOOKING:
      return {
        ...state,
        selectedBus: null,
        seatLayout: null,
        selectedSeats: [],
        boardingPoints: [],
        droppingPoints: [],
        selectedBoardingPoint: null,
        selectedDroppingPoint: null,
        passengers: [],
        blockSeatData: null,
        bookingData: null,
        error: null,
      };
    
    case ACTIONS.RESET_ALL:
      return initialState;
    
    default:
      return state;
  }
}

// Create context
const BookingContext = createContext();

// Provider component
export function BookingProvider({ children }) {
  const [state, dispatch] = useReducer(bookingReducer, initialState);
  const [sessionTimer, setSessionTimer] = useState(null);

  // Start session timer when search is performed
  const startSession = useCallback(() => {
    const startTime = Date.now();
    dispatch({ type: ACTIONS.SET_SESSION_START, payload: startTime });
    sessionStorage.setItem('bookingSessionStart', startTime.toString());
    
    // Clear existing timer if any
    if (sessionTimer) {
      clearInterval(sessionTimer);
    }
    
    // Set up new timer
    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      if (elapsed >= SESSION_DURATION) {
        dispatch({ type: ACTIONS.SET_SESSION_EXPIRED, payload: true });
        sessionStorage.removeItem('bookingSessionStart');
        clearInterval(timer);
      }
    }, 1000);
    
    setSessionTimer(timer);
  }, [sessionTimer]);

  // Reset session (for new search or going home)
  const resetSession = useCallback(() => {
    if (sessionTimer) {
      clearInterval(sessionTimer);
      setSessionTimer(null);
    }
    dispatch({ type: ACTIONS.RESET_SESSION });
    sessionStorage.removeItem('bookingSessionStart');
  }, [sessionTimer]);

  // Check for existing session on mount
  useEffect(() => {
    const storedSessionStart = sessionStorage.getItem('bookingSessionStart');
    if (storedSessionStart) {
      const startTime = parseInt(storedSessionStart);
      const elapsed = Date.now() - startTime;
      
      if (elapsed >= SESSION_DURATION) {
        // Session already expired
        dispatch({ type: ACTIONS.SET_SESSION_EXPIRED, payload: true });
        sessionStorage.removeItem('bookingSessionStart');
      } else {
        // Session still valid, restore and continue timer
        dispatch({ type: ACTIONS.SET_SESSION_START, payload: startTime });
        
        const timer = setInterval(() => {
          const currentElapsed = Date.now() - startTime;
          if (currentElapsed >= SESSION_DURATION) {
            dispatch({ type: ACTIONS.SET_SESSION_EXPIRED, payload: true });
            sessionStorage.removeItem('bookingSessionStart');
            clearInterval(timer);
          }
        }, 1000);
        
        setSessionTimer(timer);
      }
    }
    
    return () => {
      if (sessionTimer) {
        clearInterval(sessionTimer);
      }
    };
  }, []);

  // Calculate remaining time
  const getRemainingTime = useCallback(() => {
    if (!state.sessionStartTime) return null;
    const elapsed = Date.now() - state.sessionStartTime;
    const remaining = Math.max(0, SESSION_DURATION - elapsed);
    return {
      minutes: Math.floor(remaining / 60000),
      seconds: Math.floor((remaining % 60000) / 1000),
      total: remaining
    };
  }, [state.sessionStartTime]);

  // Action creators
  const actions = {
    startSession,
    resetSession,
    getRemainingTime,
    setSessionExpired: (expired) => dispatch({ type: ACTIONS.SET_SESSION_EXPIRED, payload: expired }),
    setSearchToken: (token) => dispatch({ type: ACTIONS.SET_SEARCH_TOKEN, payload: token }),
    setSearchResults: (results) => dispatch({ type: ACTIONS.SET_SEARCH_RESULTS, payload: results }),
    setSearchParams: (params) => dispatch({ type: ACTIONS.SET_SEARCH_PARAMS, payload: params }),
    setSelectedBus: (bus) => dispatch({ type: ACTIONS.SET_SELECTED_BUS, payload: bus }),
    setSeatLayout: (layout) => dispatch({ type: ACTIONS.SET_SEAT_LAYOUT, payload: layout }),
    setSelectedSeats: (seats) => dispatch({ type: ACTIONS.SET_SELECTED_SEATS, payload: seats }),
    setBoardingPoints: (points) => dispatch({ type: ACTIONS.SET_BOARDING_POINTS, payload: points }),
    setDroppingPoints: (points) => dispatch({ type: ACTIONS.SET_DROPPING_POINTS, payload: points }),
    setSelectedBoardingPoint: (point) => dispatch({ type: ACTIONS.SET_SELECTED_BOARDING_POINT, payload: point }),
    setSelectedDroppingPoint: (point) => dispatch({ type: ACTIONS.SET_SELECTED_DROPPING_POINT, payload: point }),
    setPassengers: (passengers) => dispatch({ type: ACTIONS.SET_PASSENGERS, payload: passengers }),
    setContactDetails: (details) => dispatch({ type: ACTIONS.SET_CONTACT_DETAILS, payload: details }),
    setBlockSeatData: (data) => dispatch({ type: ACTIONS.SET_BLOCK_SEAT_DATA, payload: data }),
    setBookingData: (data) => dispatch({ type: ACTIONS.SET_BOOKING_DATA, payload: data }),
    setLoading: (loading) => dispatch({ type: ACTIONS.SET_LOADING, payload: loading }),
    setError: (error) => dispatch({ type: ACTIONS.SET_ERROR, payload: error }),
    resetBooking: () => dispatch({ type: ACTIONS.RESET_BOOKING }),
    resetAll: () => dispatch({ type: ACTIONS.RESET_ALL }),
  };

  return (
    <BookingContext.Provider value={{ state, actions }}>
      {children}
    </BookingContext.Provider>
  );
}

// Custom hook to use the booking context
export function useBooking() {
  const context = useContext(BookingContext);
  if (!context) {
    throw new Error("useBooking must be used within a BookingProvider");
  }
  return context;
}

export { ACTIONS };
export default BookingContext;
