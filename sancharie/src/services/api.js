/**
 * ============================================
 * SANCHARIE API SERVICE
 * ============================================
 * 
 * Centralized API service for all backend communications.
 * All API calls go through our secure backend - no direct
 * third-party API calls from frontend.
 * 
 * SECURITY:
 * - No API keys or secrets in frontend code
 * - All sensitive operations handled by backend
 * - Token-based authentication for protected routes
 * 
 * @module services/api
 */

// ============================================
// CONFIGURATION
// ============================================

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// ============================================
// HTTP CLIENT HELPERS
// ============================================

/**
 * Get authentication headers
 * @returns {Object} Headers with auth token if available
 */
const getAuthHeaders = () => {
  const token = localStorage.getItem('authToken');
  const headers = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

/**
 * Handle API response
 * @param {Response} response - Fetch response
 * @returns {Promise<Object>} Parsed response data
 */
const handleResponse = async (response) => {
  const data = await response.json();
  
  if (!response.ok) {
    // Map HTTP status codes to user-friendly messages
    const friendlyMessages = {
      400: 'Invalid request. Please check your input and try again.',
      401: 'Session expired. Please log in again.',
      403: 'You don\'t have permission to perform this action.',
      404: 'The requested information was not found.',
      408: 'Request timed out. Please try again.',
      429: 'Too many requests. Please wait a moment and try again.',
      500: 'Something went wrong on our end. Please try again later.',
      502: 'Service temporarily unavailable. Please try again.',
      503: 'Service temporarily unavailable. Please try again later.',
    };
    const fallback = 'Something went wrong. Please try again.';
    const error = new Error(data.message || friendlyMessages[response.status] || fallback);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  
  return data;
};

/**
 * Make API request with error handling
 * @param {string} endpoint - API endpoint
 * @param {Object} options - Fetch options
 * @returns {Promise<Object>} Response data
 */
const apiRequest = async (endpoint, options = {}) => {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        ...getAuthHeaders(),
        ...options.headers,
      },
    });
    return handleResponse(response);
  } catch (error) {
    if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
      throw new Error('Network error. Please check your connection.');
    }
    throw error;
  }
};

// ============================================
// AUTHENTICATION API
// ============================================

export const auth = {
  /**
   * Send OTP to mobile number
   * @param {string} mobile - 10-digit mobile number
   */
  sendOTP: (mobile) => 
    apiRequest('/auth/send-otp', {
      method: 'POST',
      body: JSON.stringify({ mobile }),
    }),

  /**
   * Verify OTP
   * @param {string} mobile - Mobile number
   * @param {string} otp - 6-digit OTP
   */
  verifyOTP: (mobile, otp) => 
    apiRequest('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ mobile, otp }),
    }),

  /**
   * Resend OTP
   * @param {string} mobile - Mobile number
   */
  resendOTP: (mobile) => 
    apiRequest('/auth/resend-otp', {
      method: 'POST',
      body: JSON.stringify({ mobile }),
    }),

  /**
   * Check API health
   */
  checkHealth: async () => {
    try {
      await apiRequest('/health');
      return true;
    } catch {
      return false;
    }
  },
};

// ============================================
// USER API
// ============================================

export const user = {
  /**
   * Complete login after OTP verification
   * @param {string} phone - Phone number
   */
  loginComplete: (phone) =>
    apiRequest('/user/login-complete', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    }),

  /**
   * Verify stored token
   */
  verifyToken: () =>
    apiRequest('/user/verify-token', {
      method: 'POST',
    }),

  /**
   * Get user profile
   */
  getProfile: () =>
    apiRequest('/user/profile'),

  /**
   * Update user profile
   * @param {Object} profileData - Profile data to update
   */
  updateProfile: (profileData) =>
    apiRequest('/user/profile', {
      method: 'PUT',
      body: JSON.stringify(profileData),
    }),

  /**
   * Get user's bookings
   */
  getBookings: () =>
    apiRequest('/user/bookings'),

  /**
   * Save a new booking
   * @param {Object} bookingData - Booking details
   */
  saveBooking: (bookingData) =>
    apiRequest('/user/bookings', {
      method: 'POST',
      body: JSON.stringify(bookingData),
    }),

  /**
   * Update booking status
   * @param {string} bookingId - Booking ID
   * @param {Object} updateData - Data to update
   */
  updateBooking: (bookingId, updateData) =>
    apiRequest(`/user/bookings/${bookingId}`, {
      method: 'PUT',
      body: JSON.stringify(updateData),
    }),
};

// ============================================
// BUS API (ETS - eTravelSmart)
// ============================================

export const bus = {
  /**
   * Get all stations/cities
   * @returns {Promise<Object>} List of stations
   */
  getStations: async () => {
    const data = await apiRequest('/api/ets/getStations');
    
    if (data.apiStatus && !data.apiStatus.success) {
      throw new Error(data.apiStatus.message || 'Failed to fetch stations');
    }

    return {
      stationList: data.stationList || [],
      apiStatus: data.apiStatus,
      success: data.apiStatus?.success || false,
    };
  },

  /**
   * Search for buses
   * @param {string} sourceCity - Source city name
   * @param {string} destinationCity - Destination city name
   * @param {string} dateOfJourney - Journey date (yyyy-MM-dd)
   */
  search: async (sourceCity, destinationCity, dateOfJourney) => {
    const params = `sourceCity=${sourceCity}&destinationCity=${destinationCity}&doj=${dateOfJourney}`;

    const data = await apiRequest(`/api/ets/getAvailableBuses?${params}`);

    if (data.apiStatus && !data.apiStatus.success) {
      throw new Error(data.apiStatus.message || 'Search failed');
    }

    // Transform ETS API response to UI-compatible format
    const transformedBuses = (data.apiAvailableBuses || []).map((bus, index) => {
      // Parse fare as number
      const fare = parseFloat(bus.fare) || 0;
      
      // Convert boarding points to expected format
      const boardingPointsDetails = (bus.boardingPoints || []).map((bp, idx) => ({
        CityPointIndex: bp.id || idx,
        CityPointName: bp.pointName,
        CityPointAddress: bp.address,
        CityPointLandmark: bp.landmark,
        CityPointTime: bp.time,
        CityPointId: bp.id,
        CityPointLocation: bp.location,
      }));
      
      // Convert dropping points to expected format
      const droppingPointsDetails = (bus.droppingPoints || []).map((dp, idx) => ({
        CityPointIndex: dp.id || idx,
        CityPointName: dp.pointName,
        CityPointAddress: dp.address,
        CityPointLandmark: dp.landmark,
        CityPointTime: dp.time,
        CityPointId: dp.id,
        CityPointLocation: dp.location,
      }));

      // Create ISO datetime from date + time string for sorting/filtering
      const createDateTime = (dateStr, timeStr) => {
        if (!timeStr) return null;
        try {
          // Parse time like "01:30 AM" or "01:30:00 AM"
          const timeParts = timeStr.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)/i);
          if (!timeParts) return null;
          
          let hours = parseInt(timeParts[1]);
          const minutes = parseInt(timeParts[2]);
          const ampm = timeParts[4].toUpperCase();
          
          if (ampm === 'PM' && hours !== 12) hours += 12;
          if (ampm === 'AM' && hours === 12) hours = 0;
          
          const date = new Date(dateStr);
          date.setHours(hours, minutes, 0, 0);
          return date.toISOString();
        } catch {
          return null;
        }
      };

      const departureDateTime = createDateTime(dateOfJourney, bus.departureTime);
      // For arrival, check if it's next day (dpTimeDate shows the date)
      let arrivalDateTime = createDateTime(dateOfJourney, bus.arrivalTime);
      if (bus.dpTimeDate && bus.dpTimeDate.includes('+1')) {
        const nextDay = new Date(dateOfJourney);
        nextDay.setDate(nextDay.getDate() + 1);
        arrivalDateTime = createDateTime(nextDay.toISOString().split('T')[0], bus.arrivalTime);
      }

      return {
        // Unique identifier - use routeScheduleId + index for uniqueness
        ResultIndex: `${bus.routeScheduleId}_${index}`,
        
        // ETS specific fields (needed for further API calls)
        inventoryType: bus.inventoryType,
        routeScheduleId: bus.routeScheduleId,
        serviceId: bus.serviceId,
        
        // Operator info
        TravelName: bus.operatorName,
        OperatorId: bus.operatorId,
        
        // Bus details
        BusType: bus.busType,
        BusNumber: bus.serviceId,
        
        // Availability
        AvailableSeats: bus.availableSeats,
        
        // Times - store both raw and parsed
        DepartureTime: departureDateTime || bus.departureTime,
        ArrivalTime: arrivalDateTime || bus.arrivalTime,
        departureTimeRaw: bus.departureTime,
        arrivalTimeRaw: bus.arrivalTime,
        dpTimeDate: bus.dpTimeDate,
        
        // Duration
        durationInMins: bus.durationInMins,
        
        // Price info
        BusPrice: {
          PublishedPrice: fare,
          BasePrice: Math.round(fare * 1.1), // Original price (10% higher for discount display)
          Discount: 10, // Default discount percentage
        },
        
        // Boarding/Dropping points
        BoardingPointsDetails: boardingPointsDetails,
        DroppingPointsDetails: droppingPointsDetails,
        
        // Amenities
        Amenities: bus.busAmenities || [],
        
        // Cancellation policy (stored as parsed JSON)
        CancellationPolicy: (() => {
          try {
            return JSON.parse(bus.cancellationPolicy || '[]');
          } catch {
            return [];
          }
        })(),
        cancellationPolicyRaw: bus.cancellationPolicy,
        
        // Flags
        partialCancellationAllowed: bus.partialCancellationAllowed,
        idProofRequired: bus.idProofRequired,
        mTicketAllowed: bus.mTicketAllowed,
        isRTC: bus.isRTC || bus.rtc,
        socialDistancing: bus.socialDistancing,
        commPCT: bus.commPCT,
        
        // Source/Destination (for reference)
        sourceCity,
        destinationCity,
        dateOfJourney,
      };
    });

    return {
      results: transformedBuses,
      success: data.apiStatus?.success || false,
      message: data.apiStatus?.message,
    };
  },

  /**
   * Get seat layout for a bus
   * @param {string} sourceCity - Source city name
   * @param {string} destinationCity - Destination city name
   * @param {string} dateOfJourney - Journey date (yyyy-MM-dd)
   * @param {number} inventoryType - Inventory type value
   * @param {string} routeScheduleId - Route schedule ID
   */
  getSeatLayout: async (sourceCity, destinationCity, dateOfJourney, inventoryType, routeScheduleId) => {
    const params = `sourceCity=${sourceCity}&destinationCity=${destinationCity}&doj=${dateOfJourney}&inventoryType=${inventoryType}&routeScheduleId=${routeScheduleId}`;

    const data = await apiRequest(`/api/ets/getBusLayout?${params}`);

    if (data.apiStatus && !data.apiStatus.success) {
      throw new Error(data.apiStatus.message || 'Failed to get seat layout');
    }

    return {
      seats: data.seats || [],
      seatLayout: data.seats || [], // Alias for compatibility
      boardingPoints: data.boardingPoints || null,
      droppingPoints: data.droppingPoints || null,
      inventoryType: data.inventoryType,
      serviceTaxApplicable: data.serviceTaxApplicable,
      success: data.apiStatus?.success || false,
    };
  },

  /**
   * Get seat layout using bus object (convenience method)
   * @param {Object} bus - Bus object from search results (contains all needed params)
   */
  getSeatLayoutForBus: async (bus) => {
    if (!bus) throw new Error('Bus object is required');
    
    const params = `sourceCity=${bus.sourceCity}&destinationCity=${bus.destinationCity}&doj=${bus.dateOfJourney}&inventoryType=${bus.inventoryType}&routeScheduleId=${bus.routeScheduleId}`;

    const data = await apiRequest(`/api/ets/getBusLayout?${params}`);

    if (data.apiStatus && !data.apiStatus.success) {
      throw new Error(data.apiStatus.message || 'Failed to get seat layout');
    }

    return {
      seats: data.seats || [],
      seatLayout: data.seats || [], // Alias for compatibility
      boardingPoints: data.boardingPoints || null,
      droppingPoints: data.droppingPoints || null,
      inventoryType: data.inventoryType,
      serviceTaxApplicable: data.serviceTaxApplicable,
      success: data.apiStatus?.success || false,
    };
  },

  /**
   * Block seat - simplified wrapper for UI components
   * Formats the request and calls blockTicket
   * @param {Object} params - Simplified block seat parameters from UI
   */
  blockSeat: async ({
    bus,
    boardingPoint,
    droppingPoint,
    passengers,
    contactDetails,
    fareData,
  }) => {
    // Format the request for ETS API
    const blockData = {
      sourceCity: bus?.sourceCity || bus?.source,
      destinationCity: bus?.destinationCity || bus?.destination,
      doj: bus?.dateOfJourney || bus?.doj,
      routeScheduleId: bus?.routeScheduleId,
      inventoryType: bus?.inventoryType || 0,
      boardingPoint: {
        id: boardingPoint?.CityPointId || boardingPoint?.id,
        location: boardingPoint?.CityPointLocation || boardingPoint?.location || boardingPoint?.CityPointName,
        time: boardingPoint?.CityPointTime || boardingPoint?.time,
      },
      droppingPoint: {
        id: droppingPoint?.CityPointId || droppingPoint?.id,
        location: droppingPoint?.CityPointLocation || droppingPoint?.location || droppingPoint?.CityPointName,
        time: droppingPoint?.CityPointTime || droppingPoint?.time,
      },
      customerName: passengers[0]?.name?.split(' ')[0] || passengers[0]?.name || '',
      customerLastName: passengers[0]?.name?.split(' ').slice(1).join(' ') || '',
      customerEmail: contactDetails?.email || passengers[0]?.email || '',
      customerPhone: contactDetails?.phone || passengers[0]?.phone || '',
      emergencyPhNumber: contactDetails?.phone || passengers[0]?.phone || '',
      customerAddress: contactDetails?.state || passengers[0]?.address || '',
      blockSeatPaxDetails: passengers.map((p, index) => ({
        age: String(p.age || '25'),
        name: p.name,
        seatNbr: p.seatNumber || p.seatName || p.seatNbr,
        sex: p.gender === 'male' ? 'M' : 'F',
        fare: fareData?.baseFare || fareData?.fare || 0,
        serviceTaxAmount: fareData?.serviceTax || 0,
        operatorServiceChargeAbsolute: fareData?.operatorServiceCharge || 0,
        totalFareWithTaxes: fareData?.totalFare || fareData?.fare || 0,
        ladiesSeat: p.ladiesSeat || false,
        lastName: p.name?.split(' ').slice(1).join(' ') || '',
        mobile: p.phone || contactDetails?.phone || '',
        title: p.gender === 'male' ? 'Mr' : 'Ms',
        email: p.email || contactDetails?.email || '',
        idType: p.idType || '',
        idNumber: p.idNumber || '',
        nameOnId: p.nameOnId || p.name,
        primary: index === 0,
        ac: bus?.BusType?.toLowerCase().includes('ac') || false,
        sleeper: bus?.BusType?.toLowerCase().includes('sleeper') || false,
      })),
    };

    const data = await apiRequest('/api/ets/blockTicket', {
      method: 'POST',
      body: JSON.stringify(blockData),
    });

    if (data.apiStatus && !data.apiStatus.success) {
      throw new Error(data.apiStatus.message || 'Failed to block seats');
    }

    return {
      blockTicketKey: data.blockTicketKey,
      inventoryType: data.inventoryType,
      success: data.apiStatus?.success || false,
      message: data.apiStatus?.message,
    };
  },

  /**
   * Block ticket (reserve seats for 10 minutes)
   * @param {Object} blockData - Block ticket request data
   */
  blockTicket: async (blockData) => {
    const data = await apiRequest('/api/ets/blockTicket', {
      method: 'POST',
      body: JSON.stringify(blockData),
    });

    if (data.apiStatus && !data.apiStatus.success) {
      throw new Error(data.apiStatus.message || 'Failed to block ticket');
    }

    return {
      blockTicketKey: data.blockTicketKey,
      inventoryType: data.inventoryType,
      success: data.apiStatus?.success || false,
      message: data.apiStatus?.message,
    };
  },

  /**
   * Get RTC updated fare (for RTC services only)
   * Call this after blockTicket for RTC services (isRTC: true)
   * @param {string} blockTicketKey - Block ticket key from blockTicket response
   */
  getRtcUpdatedFare: async (blockTicketKey) => {
    const params = new URLSearchParams({ blockTicketKey });
    const data = await apiRequest(`/api/ets/getRtcUpdatedFare?${params}`);

    if (data.apiStatus && !data.apiStatus.success) {
      throw new Error(data.apiStatus.message || 'Failed to get updated fare');
    }

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
  },

  /**
   * Book seat (confirm booking after payment)
   * @param {string} blockTicketKey - Block ticket key from blockTicket response
   */
  bookTicket: async (blockTicketKey) => {
    const params = new URLSearchParams({ blockTicketKey });
    const data = await apiRequest(`/api/ets/seatBooking?${params}`);

    if (data.apiStatus && !data.apiStatus.success) {
      throw new Error(data.apiStatus.message || 'Booking failed');
    }

    return {
      opPNR: data.opPNR,
      travelOperatorPNR: data.opPNR,
      etsTicketNumber: data.etstnumber,
      ticketNo: data.etstnumber,
      bookingId: data.etstnumber,
      commPCT: data.commPCT,
      totalFare: data.totalFare,
      cancellationPolicy: data.cancellationPolicy,
      tripCode: data.tripCode,
      inventoryType: data.inventoryType,
      success: data.apiStatus?.success || false,
    };
  },

  /**
   * Get booked ticket details
   * @param {string} etsTicketNumber - ETS ticket number from booking response
   */
  getBookingDetails: async (etsTicketNumber) => {
    const params = new URLSearchParams({ ETSTNumber: etsTicketNumber });
    const data = await apiRequest(`/api/ets/getTicketByETSTNumber?${params}`);

    if (data.apiStatus && !data.apiStatus.success) {
      throw new Error(data.apiStatus.message || 'Failed to get booking details');
    }

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
  },

  /**
   * Cancel ticket confirmation (get cancellation details before actual cancel)
   * @param {string} etsTicketNo - ETS ticket number
   * @param {string[]} seatNbrsToCancel - Array of seat numbers to cancel
   */
  cancelTicketConfirmation: async (etsTicketNo, seatNbrsToCancel) => {
    const data = await apiRequest('/api/ets/cancelTicketConfirmation', {
      method: 'POST',
      body: JSON.stringify({ etsTicketNo, seatNbrsToCancel }),
    });

    if (data.apiStatus && !data.apiStatus.success) {
      throw new Error(data.apiStatus.message || 'Failed to get cancellation details');
    }

    return {
      cancellable: data.cancellable,
      partiallyCancellable: data.partiallyCancellable,
      totalTicketFare: data.totalTicketFare,
      totalRefundAmount: data.totalRefundAmount,
      cancelChargesPercentage: data.cancelChargesPercentage,
      cancellationCharges: data.cancellationCharges,
      success: data.apiStatus?.success || false,
    };
  },

  /**
   * Cancel booking (actual cancellation)
   * @param {string} etsTicketNo - ETS ticket number
   * @param {string[]} seatNbrsToCancel - Array of seat numbers to cancel
   */
  cancelBooking: async (etsTicketNo, seatNbrsToCancel) => {
    const data = await apiRequest('/api/ets/cancelTicket', {
      method: 'POST',
      body: JSON.stringify({ etsTicketNo, seatNbrsToCancel }),
    });

    if (data.apiStatus && !data.apiStatus.success) {
      throw new Error(data.apiStatus.message || 'Cancellation failed');
    }

    return {
      cancellable: data.cancellable,
      partiallyCancellable: data.partiallyCancellable,
      totalTicketFare: data.totalTicketFare,
      totalRefundAmount: data.totalRefundAmount,
      cancelChargesPercentage: data.cancelChargesPercentage,
      cancellationCharges: data.cancellationCharges,
      success: data.apiStatus?.success || false,
    };
  },

  /**
   * Get plan and balance information
   */
  getMyPlanAndBalance: async () => {
    const data = await apiRequest('/api/ets/getMyPlanAndBalance');

    if (data.apiStatus && !data.apiStatus.success) {
      throw new Error(data.apiStatus.message || 'Failed to get plan and balance');
    }

    return {
      userType: data.userType,
      planName: data.planName,
      planNature: data.planNature,
      product: data.product,
      balanceAmount: data.balanceAmount,
      success: data.apiStatus?.success || false,
    };
  },

  /**
   * Helper: Format block ticket request data
   */
  formatBlockTicketRequest: ({
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
  }) => ({
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
    droppingPoint: {
      id: droppingPoint.id,
      location: droppingPoint.location,
      time: droppingPoint.time,
    },
    customerName,
    customerLastName,
    customerEmail,
    customerPhone,
    emergencyPhNumber,
    customerAddress,
    blockSeatPaxDetails: passengers.map((p, index) => ({
      age: String(p.age || '25'),
      name: p.name,
      seatNbr: p.seatNbr,
      sex: p.gender === 'male' ? 'M' : 'F',
      fare: p.fare,
      serviceTaxAmount: p.serviceTaxAmount || 0,
      operatorServiceChargeAbsolute: p.operatorServiceChargeAbsolute || 0,
      totalFareWithTaxes: p.totalFareWithTaxes || p.fare,
      ladiesSeat: p.ladiesSeat || false,
      lastName: p.lastName || '',
      mobile: p.mobile || customerPhone,
      title: p.gender === 'male' ? 'Mr' : p.title || 'Ms',
      email: p.email || customerEmail,
      idType: p.idType || '',
      idNumber: p.idNumber || '',
      nameOnId: p.nameOnId || p.name,
      primary: index === 0,
      ac: p.ac || false,
      sleeper: p.sleeper || false,
    })),
  }),
};

// ============================================
// PAYMENT API
// ============================================

export const payment = {
  /**
   * Get Razorpay public configuration
   */
  getConfig: () =>
    apiRequest('/payment/config'),

  /**
   * Create payment order
   * @param {number} amount - Amount in INR
   * @param {Object} bookingDetails - Booking information
   */
  createOrder: async (amount, bookingDetails = {}) => {
    const data = await apiRequest('/payment/create-order', {
      method: 'POST',
      body: JSON.stringify({
        amount,
        currency: 'INR',
        notes: { source: 'web_booking' },
        bookingDetails,
      }),
    });
    return data.data;
  },

  /**
   * Verify payment signature
   * @param {Object} paymentResponse - Razorpay payment response
   * @param {Object} bookingData - Booking data to save
   */
  verifyPayment: async (paymentResponse, bookingData = {}) => {
    const data = await apiRequest('/payment/verify-payment', {
      method: 'POST',
      body: JSON.stringify({
        razorpay_order_id: paymentResponse.razorpay_order_id,
        razorpay_payment_id: paymentResponse.razorpay_payment_id,
        razorpay_signature: paymentResponse.razorpay_signature,
        bookingData,
      }),
    });
    return data;
  },

  /**
   * Get order status
   * @param {string} orderId - Razorpay order ID
   */
  getOrderStatus: async (orderId) => {
    const data = await apiRequest(`/payment/order/${orderId}`);
    return data.data;
  },

  /**
   * Load Razorpay checkout script
   */
  loadScript: () => {
    return new Promise((resolve) => {
      if (window.Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  },

  /**
   * Open Razorpay checkout
   * @param {Object} options - Checkout options
   */
  openCheckout: async (options) => {
    const isLoaded = await payment.loadScript();
    if (!isLoaded) {
      throw new Error('Failed to load payment gateway');
    }

    const { orderId, amount, currency = 'INR', customerInfo = {}, bookingDetails = {}, onSuccess, onFailure, onDismiss } = options;

    // Get key from config
    let keyId = import.meta.env.VITE_RAZORPAY_KEY_ID;
    if (!keyId) {
      const config = await payment.getConfig();
      keyId = config.data?.key_id;
    }

    if (!keyId) {
      throw new Error('Payment configuration error');
    }

    const razorpayOptions = {
      key: keyId,
      amount,
      currency,
      name: 'Sancharie Travels',
      description: bookingDetails.description || 'Bus Ticket Booking',
      order_id: orderId,
      image: '/logo.png',
      prefill: {
        name: customerInfo.name || '',
        email: customerInfo.email || '',
        contact: customerInfo.phone || '',
      },
      notes: {
        bus_name: bookingDetails.busName || '',
        travel_date: bookingDetails.travelDate || '',
        seats: bookingDetails.seats || '',
      },
      theme: { color: '#9c7635' },
      handler: (response) => onSuccess?.(response),
      modal: {
        ondismiss: () => onDismiss?.(),
        escape: true,
        animation: true,
      },
    };

    const razorpay = new window.Razorpay(razorpayOptions);
    razorpay.on('payment.failed', (response) => {
      onFailure?.({
        code: response.error.code,
        description: response.error.description,
        reason: response.error.reason,
      });
    });
    razorpay.open();
  },

  /**
   * Complete payment flow (create order → checkout → verify)
   * @param {Object} paymentData - Payment details
   */
  initiatePayment: async (paymentData) => {
    const { amount, customerInfo, bookingDetails, onStart, onSuccess, onFailure, onDismiss } = paymentData;

    try {
      onStart?.();
      const order = await payment.createOrder(amount, bookingDetails);

      return new Promise((resolve, reject) => {
        payment.openCheckout({
          orderId: order.order_id,
          amount: order.amount,
          currency: order.currency,
          customerInfo,
          bookingDetails,
          onSuccess: async (response) => {
            try {
              const verification = await payment.verifyPayment(response, bookingDetails);
              if (verification.verified) {
                onSuccess?.(verification);
                resolve(verification);
              } else {
                const err = new Error('Payment verification failed');
                onFailure?.(err);
                reject(err);
              }
            } catch (err) {
              onFailure?.(err);
              reject(err);
            }
          },
          onFailure: (err) => {
            onFailure?.(err);
            reject(new Error(err.description || 'Payment failed'));
          },
          onDismiss: () => {
            onDismiss?.();
            reject(new Error('Payment cancelled'));
          },
        });
      });
    } catch (err) {
      onFailure?.(err);
      throw err;
    }
  },
};

// ============================================
// DEFAULT EXPORT
// ============================================

export default {
  auth,
  user,
  bus,
  payment,
  API_BASE_URL,
};
