/**
 * ============================================
 * ETS (eTravelSmart) BUS API SERVICE
 * ============================================
 * 
 * All requests go through our backend proxy to hide the actual API URL
 * and credentials. Uses Digest Authentication handled server-side.
 * 
 * Live API: http://agent.etravelsmart.com/etsAPI/api
 * Documentation: http://partners.etravelsmart.com/bus/busApi.htm
 * 
 * In browser network tab, users will see: https://www.sancharie.com/api/ets/*
 * Backend proxies to ETS API internally.
 * 
 * BOARDING POINT LOGIC (per ETS documentation):
 * - inventoryType 0, 1: Use boarding points from getAvailableBuses response
 * - inventoryType 2, 3, 5, 6: Use boarding points from getBusLayout response
 * - inventoryType 1: Time may be null in layout; use search results for time
 * - Map boarding details using boardingId for complete name with landmarks
 * 
 * @module services/busApi
 */

// Use backend proxy URL
const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

// Common headers for all API requests
const getHeaders = () => ({
  "Content-Type": "application/json",
});

/**
 * Handle API response and check for ETS API errors
 * @param {Response} response - Fetch response
 * @returns {Promise<Object>} Parsed response data
 */
const handleResponse = async (response) => {
  const data = await response.json();
  
  // Check for ETS API error format
  if (data.apiStatus && !data.apiStatus.success) {
    throw new Error(data.apiStatus.message || "API request failed");
  }
  
  return data;
};

/**
 * 1. Get All Stations/Cities
 * GET /api/ets/getStations
 * 
 * Returns list of all available stations for bus booking
 */
export const getStations = async () => {
  try {
    const response = await fetch(`${BASE_URL}/api/ets/getStations`, {
      method: "GET",
      headers: getHeaders(),
    });

    const data = await handleResponse(response);
    
    // Return in the same format as ETS API response for consistency
    return {
      stationList: data.stationList || [],
      apiStatus: data.apiStatus,
      success: data.apiStatus?.success || false,
    };
  } catch (error) {
    console.error("Get stations error:", error);
    throw error;
  }
};

/**
 * 2. Search Available Buses
 * GET /api/ets/getAvailableBuses
 * 
 * @param {string} sourceCity - Source city name
 * @param {string} destinationCity - Destination city name
 * @param {string} dateOfJourney - Journey date in yyyy-MM-dd format
 */
export const searchBuses = async (sourceCity, destinationCity, dateOfJourney) => {
  try {
    const params = new URLSearchParams({
      sourceCity,
      destinationCity,
      doj: dateOfJourney,
    });

    const response = await fetch(`${BASE_URL}/api/ets/getAvailableBuses?${params}`, {
      method: "GET",
      headers: getHeaders(),
    });

    const data = await handleResponse(response);
    
    console.log("Search API full response:", JSON.stringify(data, null, 2));

    return {
      results: data.apiAvailableBuses || [],
      success: data.apiStatus?.success || false,
      message: data.apiStatus?.message,
    };
  } catch (error) {
    console.error("Search buses error:", error);
    throw error;
  }
};

/**
 * 3. Get Bus Seat Layout
 * GET /api/ets/getBusLayout
 * 
 * @param {string} sourceCity - Source city name
 * @param {string} destinationCity - Destination city name
 * @param {string} dateOfJourney - Journey date in yyyy-MM-dd format
 * @param {number} inventoryType - Inventory type value
 * @param {string} routeScheduleId - Route schedule ID
 */
export const getSeatLayout = async (sourceCity, destinationCity, dateOfJourney, inventoryType, routeScheduleId) => {
  try {
    const params = new URLSearchParams({
      sourceCity,
      destinationCity,
      doj: dateOfJourney,
      inventoryType: String(inventoryType),
      routeScheduleId,
    });

    const response = await fetch(`${BASE_URL}/api/ets/getBusLayout?${params}`, {
      method: "GET",
      headers: getHeaders(),
    });

    const data = await handleResponse(response);

    return {
      seats: data.seats || [],
      boardingPoints: data.boardingPoints || null,
      droppingPoints: data.droppingPoints || null,
      inventoryType: data.inventoryType,
      serviceTaxApplicable: data.serviceTaxApplicable,
      success: data.apiStatus?.success || false,
    };
  } catch (error) {
    console.error("Get seat layout error:", error);
    throw error;
  }
};

/**
 * 4. Block Ticket (Reserve seats for 10 minutes)
 * POST /api/ets/blockTicket
 * 
 * @param {Object} blockData - Block ticket request data
 */
export const blockTicket = async (blockData) => {
  try {
    const response = await fetch(`${BASE_URL}/api/ets/blockTicket`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(blockData),
    });

    const data = await handleResponse(response);

    return {
      blockTicketKey: data.blockTicketKey,
      inventoryType: data.inventoryType,
      success: data.apiStatus?.success || false,
      message: data.apiStatus?.message,
    };
  } catch (error) {
    console.error("Block ticket error:", error);
    throw error;
  }
};

/**
 * 5. Get RTC Updated Fare (For RTC services only)
 * GET /api/ets/getRtcUpdatedFare
 * 
 * Call this after blockTicket for RTC services (isRTC: true in search response)
 * 
 * @param {string} blockTicketKey - Block ticket key from blockTicket response
 */
export const getRtcUpdatedFare = async (blockTicketKey) => {
  try {
    const params = new URLSearchParams({ blockTicketKey });

    const response = await fetch(`${BASE_URL}/api/ets/getRtcUpdatedFare?${params}`, {
      method: "GET",
      headers: getHeaders(),
    });

    const data = await handleResponse(response);

    return {
      convenienceFee: data.convenienceFee,
      bookingFee: data.bookingFee,
      reservationFee: data.reservationFee,
      tollFee: data.tollFee,
      otherCharges: data.otherCharges,
      previousFare: data.previousFare,
      updatedFare: data.updatedFare,
      success: data.apiStatus?.success || false,
    };
  } catch (error) {
    console.error("Get RTC updated fare error:", error);
    throw error;
  }
};

/**
 * 6. Book Seat (Confirm booking after payment)
 * GET /api/ets/seatBooking
 * 
 * @param {string} blockTicketKey - Block ticket key from blockTicket response
 */
export const bookTicket = async (blockTicketKey) => {
  try {
    const params = new URLSearchParams({ blockTicketKey });

    const response = await fetch(`${BASE_URL}/api/ets/seatBooking?${params}`, {
      method: "GET",
      headers: getHeaders(),
    });

    const data = await handleResponse(response);

    return {
      opPNR: data.opPNR,
      etsTicketNumber: data.etstnumber,
      commPCT: data.commPCT,
      totalFare: data.totalFare,
      cancellationPolicy: data.cancellationPolicy,
      tripCode: data.tripCode,
      inventoryType: data.inventoryType,
      success: data.apiStatus?.success || false,
    };
  } catch (error) {
    console.error("Book ticket error:", error);
    throw error;
  }
};

/**
 * 7. Get Booked Ticket Details
 * GET /api/ets/getTicketByETSTNumber
 * 
 * @param {string} etsTicketNumber - ETS ticket number from booking response
 */
export const getBookingDetails = async (etsTicketNumber) => {
  try {
    const params = new URLSearchParams({ ETSTNumber: etsTicketNumber });

    const response = await fetch(`${BASE_URL}/api/ets/getTicketByETSTNumber?${params}`, {
      method: "GET",
      headers: getHeaders(),
    });

    const data = await handleResponse(response);

    return {
      ticketStatus: data.ticketStatus,
      inventoryType: data.inventoryType,
      sourceCity: data.sourceCity,
      destinationCity: data.destinationCity,
      journeyDate: data.journeyDate,
      departureTime: data.departureTime,
      routeScheduleId: data.routeScheduleId,
      serviceProvider: data.serviceProvider,
      serviceType: data.service_type,
      serviceId: data.serviceId,
      serviceProviderContact: data.serviceProviderContact,
      boardingPoint: data.boardingPoint,
      droppingPoint: data.droppingPoint,
      travelerDetails: data.travelerDetails || [],
      etsTicketNumber: data.ETSTNumber,
      opPNR: data.opPNR,
      commPCT: data.commPCT,
      cancellationPolicy: data.cancellationPolicy,
      bookingDate: data.bookingDate,
      cancelDate: data.cancelDate,
      refundAmount: data.refundAmount,
      tripCode: data.tripCode,
      success: data.apiStatus?.success || false,
    };
  } catch (error) {
    console.error("Get booking details error:", error);
    throw error;
  }
};

/**
 * 8. Cancel Ticket Confirmation (Get cancellation details before actual cancel)
 * POST /api/ets/cancelTicketConfirmation
 * 
 * @param {string} etsTicketNo - ETS ticket number
 * @param {string[]} seatNbrsToCancel - Array of seat numbers to cancel
 */
export const cancelTicketConfirmation = async (etsTicketNo, seatNbrsToCancel) => {
  try {
    const response = await fetch(`${BASE_URL}/api/ets/cancelTicketConfirmation`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        etsTicketNo,
        seatNbrsToCancel,
      }),
    });

    const data = await handleResponse(response);

    return {
      cancellable: data.cancellable,
      partiallyCancellable: data.partiallyCancellable,
      totalTicketFare: data.totalTicketFare,
      totalRefundAmount: data.totalRefundAmount,
      cancelChargesPercentage: data.cancelChargesPercentage,
      cancellationCharges: data.cancellationCharges,
      success: data.apiStatus?.success || false,
    };
  } catch (error) {
    console.error("Cancel ticket confirmation error:", error);
    throw error;
  }
};

/**
 * 9. Cancel Ticket (Actual cancellation)
 * POST /api/ets/cancelTicket
 * 
 * @param {string} etsTicketNo - ETS ticket number
 * @param {string[]} seatNbrsToCancel - Array of seat numbers to cancel
 */
export const cancelBooking = async (etsTicketNo, seatNbrsToCancel) => {
  try {
    const response = await fetch(`${BASE_URL}/api/ets/cancelTicket`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        etsTicketNo,
        seatNbrsToCancel,
      }),
    });

    const data = await handleResponse(response);

    return {
      cancellable: data.cancellable,
      partiallyCancellable: data.partiallyCancellable,
      totalTicketFare: data.totalTicketFare,
      totalRefundAmount: data.totalRefundAmount,
      cancelChargesPercentage: data.cancelChargesPercentage,
      cancellationCharges: data.cancellationCharges,
      success: data.apiStatus?.success || false,
    };
  } catch (error) {
    console.error("Cancel booking error:", error);
    throw error;
  }
};

/**
 * 10. Get My Plan and Balance
 * GET /api/ets/getMyPlanAndBalance
 * 
 * Returns API partner plan and balance information
 */
export const getMyPlanAndBalance = async () => {
  try {
    const response = await fetch(`${BASE_URL}/api/ets/getMyPlanAndBalance`, {
      method: "GET",
      headers: getHeaders(),
    });

    const data = await handleResponse(response);

    return {
      userType: data.userType,
      planName: data.planName,
      planNature: data.planNature,
      product: data.product,
      allowedIPs: data.allowedIPs,
      inventoryTypes: data.inventoryTypes,
      registrationDate: data.registrationDate,
      renewalDate: data.renewalDate,
      planDescription: data.planDescription,
      fixedCommission: data.fixedCommission,
      dynamicCommission: data.dynamicComission,
      serviceCharges: data.serviceCharges,
      balanceAmount: data.balanceAmount,
      lowBalanceAmount: data.lowBalanceAmount,
      success: data.apiStatus?.success || false,
    };
  } catch (error) {
    console.error("Get plan and balance error:", error);
    throw error;
  }
};

/**
 * Helper: Format block ticket request data
 * 
 * @param {Object} params - Booking parameters
 * @returns {Object} Formatted request body for blockTicket API
 */
export const formatBlockTicketRequest = ({
  sourceCity,
  destinationCity,
  dateOfJourney,
  routeScheduleId,
  inventoryType,
  boardingPoint,
  droppingPoint,
  customerName,
  customerLastName,
  customerEmail,
  customerPhone,
  emergencyPhNumber,
  customerAddress,
  passengers,
}) => {
  // Base request object
  const requestBody = {
    sourceCity,
    destinationCity,
    doj: dateOfJourney,
    routeScheduleId,
    inventoryType,
    boardingPoint: {
      id: boardingPoint.id,
      location: boardingPoint.location,
      time: boardingPoint.time,
    },
    customerName,
    customerLastName,
    customerEmail,
    customerPhone,
    emergencyPhNumber,
    customerAddress,
    blockSeatPaxDetails: passengers.map((p, index) => ({
      age: String(p.age || "25"),
      name: p.name,
      seatNbr: p.seatNbr,
      sex: p.gender === "male" ? "M" : "F",
      fare: p.fare,
      serviceTaxAmount: p.serviceTaxAmount || 0,
      operatorServiceChargeAbsolute: p.operatorServiceChargeAbsolute || 0,
      totalFareWithTaxes: p.totalFareWithTaxes || p.fare,
      ladiesSeat: p.ladiesSeat || false,
      lastName: p.lastName || "",
      mobile: p.mobile || customerPhone,
      title: p.gender === "male" ? "Mr" : p.title || "Ms",
      email: p.email || customerEmail,
      idType: p.idType || "PAN_CARD", // Required field per ETS docs
      idNumber: p.idNumber || "",
      nameOnId: p.nameOnId || p.name,
      primary: index === 0,
      ac: p.ac || false,
      sleeper: p.sleeper || false,
    })),
  };

  // Only include droppingPoint if available (some operators may not have it)
  // Per ETS FAQ: If dropping points are null, use destination city
  if (droppingPoint && droppingPoint.id) {
    requestBody.droppingPoint = {
      id: droppingPoint.id,
      location: droppingPoint.location,
      time: droppingPoint.time,
    };
  }

  return requestBody;
};

/**
 * Helper: Determine boarding point source based on inventory type
 * Per ETS API Documentation:
 * - inventoryType 0, 1: Use boarding points from getAvailableBuses response
 * - inventoryType 2, 3, 5, 6: Use boarding points from getBusLayout response
 * - inventoryType 1: Time may be null in layout; prefer search results for time
 * 
 * @param {number} inventoryType - Inventory type from bus search/layout response
 * @returns {Object} Configuration for boarding point handling
 */
export const getBoardingPointSource = (inventoryType) => {
  const type = parseInt(inventoryType);
  
  // Inventory types that require getBusLayout for boarding points
  const layoutInventoryTypes = [2, 3, 5, 6];
  const useLayout = layoutInventoryTypes.includes(type);
  
  return {
    inventoryType: type,
    useLayoutForBoardingPoints: useLayout,
    useSearchForBoardingPoints: !useLayout,
    // For type 1: Time may be null in layout, so prefer search results
    preferSearchForTime: type === 1,
    // For type 1: Can map boarding ID from both for complete name with landmarks
    canMapWithBoardingId: type === 1,
    // MSRTC specific handling
    isMSRTC: type === 6,
    message: useLayout
      ? 'Fetch boarding/dropping points from getBusLayout response'
      : 'Use boarding/dropping points from search results',
  };
};

/**
 * Helper: Merge boarding points from search and layout responses
 * For inventoryType 1: Time is in search results, landmarks are in layout
 * 
 * @param {Array} searchBoardingPoints - Boarding points from getAvailableBuses
 * @param {Array} layoutBoardingPoints - Boarding points from getBusLayout  
 * @returns {Array} Merged boarding points with complete information
 */
export const mergeBoardingPoints = (searchBoardingPoints, layoutBoardingPoints) => {
  if (!searchBoardingPoints || !layoutBoardingPoints) {
    return searchBoardingPoints || layoutBoardingPoints || [];
  }

  // Create a map of layout boarding points by ID
  const layoutMap = new Map();
  layoutBoardingPoints.forEach(bp => {
    if (bp.id) {
      layoutMap.set(String(bp.id), bp);
    }
  });

  // Merge: Use search results as base, enhance with layout data
  return searchBoardingPoints.map(searchBp => {
    const layoutBp = layoutMap.get(String(searchBp.id));
    
    if (layoutBp) {
      return {
        ...searchBp,
        // Use time from search (may be null in layout)
        time: searchBp.time || layoutBp.time,
        // Use location from layout if more complete (has landmarks)
        location: layoutBp.location && layoutBp.location.length > searchBp.location?.length
          ? layoutBp.location
          : searchBp.location,
        // Keep additional fields from both
        landmark: layoutBp.landmark || searchBp.landmark,
        address: layoutBp.address || searchBp.address,
      };
    }
    
    return searchBp;
  });
};

/**
 * Helper: Get boarding points for a bus based on inventory type
 * Automatically determines source and returns appropriate points
 * 
 * @param {Object} bus - Bus object from search results
 * @param {Object} layout - Layout response (optional, required for certain inventory types)
 * @returns {Object} Boarding and dropping points with source info
 */
export const getBoardingPoints = (bus, layout = null) => {
  const config = getBoardingPointSource(bus.inventoryType);
  
  let boardingPoints = [];
  let droppingPoints = [];
  
  if (config.useLayoutForBoardingPoints) {
    // For inventory types 2, 3, 5, 6: MUST use layout
    if (!layout) {
      console.warn(`[ETS] inventoryType ${bus.inventoryType} requires layout for boarding points`);
      return { 
        boardingPoints: [], 
        droppingPoints: [], 
        source: 'layout_required',
        error: 'Please fetch bus layout first',
      };
    }
    boardingPoints = layout.boardingPoints || [];
    droppingPoints = layout.droppingPoints || [];
  } else if (config.canMapWithBoardingId && layout) {
    // For inventory type 1: Merge both for complete data
    boardingPoints = mergeBoardingPoints(bus.boardingPoints, layout.boardingPoints);
    droppingPoints = mergeBoardingPoints(bus.droppingPoints, layout.droppingPoints);
  } else {
    // For inventory type 0, 1 (without layout): Use search results
    boardingPoints = bus.boardingPoints || [];
    droppingPoints = bus.droppingPoints || [];
  }
  
  return {
    boardingPoints,
    droppingPoints,
    source: config.useLayoutForBoardingPoints ? 'layout' : 'search',
    config,
  };
};

// Export all functions
export default {
  getStations,
  searchBuses,
  getSeatLayout,
  blockTicket,
  getRtcUpdatedFare,
  bookTicket,
  getBookingDetails,
  cancelTicketConfirmation,
  cancelBooking,
  getMyPlanAndBalance,
  formatBlockTicketRequest,
  getBoardingPointSource,
  mergeBoardingPoints,
  getBoardingPoints,
};
