/**
 * ============================================
 * ETS BUS API PROXY ROUTES
 * ============================================
 * 
 * Secure proxy for eTravelSmart (ETS) bus booking API.
 * Uses Digest Authentication with credentials stored server-side only.
 * 
 * Browser sees: https://sancharie.com/api/ets/*
 * Server calls: ETS API (Configured in .env)
 * 
 * LIVE API ENDPOINT: http://agent.etravelsmart.com/etsAPI/api/<Method_Name>
 * 
 * SECURITY:
 * - API credentials never exposed to frontend
 * - Digest Authentication handled server-side
 * - Request validation and sanitization
 * - Rate limiting for sensitive endpoints
 * - Input sanitization to prevent injection attacks
 * - Error handling without leaking internal details
 * 
 * BOARDING POINT LOGIC (as per ETS documentation):
 * - inventoryType 0, 1: Use boarding points from getAvailableBuses response
 * - inventoryType 2, 3, 5, 6: Use boarding points from getBusLayout response
 * - For inventoryType 1: Boarding time may be null in layout; prefer search results
 * - Map boarding details using boardingId for complete info with landmarks
 * 
 * @module routes/bus
 */

const express = require('express');
const AxiosDigestAuth = require('@mhoc/axios-digest-auth').default;
const router = express.Router();

// ============================================
// CONFIGURATION (from environment only)
// ============================================

const ETS_API_CONFIG = {
  baseUrl: process.env.ETS_API_URL || 'http://agent.etravelsmart.com/etsAPI/api',
  username: process.env.ETS_API_USERNAME,
  password: process.env.ETS_API_PASSWORD,
  timeout: parseInt(process.env.ETS_API_TIMEOUT) || 30000,
};

// Validate configuration on startup
const isConfigured = () => {
  return !!(ETS_API_CONFIG.baseUrl && ETS_API_CONFIG.username && ETS_API_CONFIG.password);
};

// Log configuration status (never log actual credentials)
if (isConfigured()) {
  console.log('[ETS API] ✅ Configuration loaded successfully');
  console.log('[ETS API] Base URL:', ETS_API_CONFIG.baseUrl);
} else {
  console.warn('[ETS API] ⚠️ Missing configuration - check ETS_API_* environment variables');
}

// ============================================
// AXIOS INSTANCE WITH DIGEST AUTH
// ============================================

let digestAuth = null;

const getDigestAuth = () => {
  if (!digestAuth && isConfigured()) {
    digestAuth = new AxiosDigestAuth({
      username: ETS_API_CONFIG.username,
      password: ETS_API_CONFIG.password,
    });
  }
  return digestAuth;
};

// ============================================
// SECURITY UTILITIES
// ============================================

/**
 * Sanitize string input to prevent injection attacks
 * @param {string} input - Raw input string
 * @returns {string} Sanitized string
 */
const sanitizeString = (input) => {
  if (typeof input !== 'string') return '';
  // Remove potentially dangerous characters while preserving valid city names
  return input
    .trim()
    .replace(/[<>\"\'\\]/g, '') // Remove quotes, backslashes, angle brackets
    .substring(0, 100); // Limit length
};

/**
 * Validate date format (yyyy-MM-dd)
 * @param {string} date - Date string
 * @returns {boolean} Is valid
 */
const isValidDate = (date) => {
  if (!date || typeof date !== 'string') return false;
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(date)) return false;
  const parsed = new Date(date);
  return !isNaN(parsed.getTime());
};

/**
 * Validate inventory type
 * @param {string|number} type - Inventory type
 * @returns {boolean} Is valid
 */
const isValidInventoryType = (type) => {
  const num = parseInt(type);
  return !isNaN(num) && num >= 0 && num <= 999;
};

/**
 * Validate route schedule ID
 * @param {string} id - Route schedule ID
 * @returns {boolean} Is valid
 */
const isValidRouteScheduleId = (id) => {
  if (!id || typeof id !== 'string') return false;
  // Route schedule IDs are typically numeric or alphanumeric
  return /^[a-zA-Z0-9_-]{1,50}$/.test(id);
};

/**
 * Validate phone number (Indian format)
 * @param {string} phone - Phone number
 * @returns {boolean} Is valid
 */
const isValidPhone = (phone) => {
  if (!phone || typeof phone !== 'string') return false;
  return /^[6-9]\d{9}$/.test(phone.replace(/\s/g, ''));
};

/**
 * Validate email
 * @param {string} email - Email address
 * @returns {boolean} Is valid
 */
const isValidEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 100;
};

/**
 * Validate ETS ticket number format
 * @param {string} ticketNo - ETS ticket number
 * @returns {boolean} Is valid
 */
const isValidETSTicketNumber = (ticketNo) => {
  if (!ticketNo || typeof ticketNo !== 'string') return false;
  const trimmed = ticketNo.trim();
  if (trimmed.length < 1 || trimmed.length > 50) return false;
  return /^[A-Za-z0-9\-_]+$/.test(trimmed);
};

/**
 * Validate block ticket key
 * @param {string} key - Block ticket key
 * @returns {boolean} Is valid
 */
const isValidBlockTicketKey = (key) => {
  if (!key || typeof key !== 'string') return false;
  const trimmed = key.trim();
  if (trimmed.length < 1 || trimmed.length > 500) return false;
  // Allow alphanumeric, hyphens, underscores, equals, plus, slashes (base64/UUID formats)
  return /^[A-Za-z0-9\-_=+/:.]+$/.test(trimmed);
};

// ============================================
// RATE LIMITING
// ============================================

const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 30; // Max requests per window

/**
 * Simple in-memory rate limiting
 */
const rateLimit = (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  
  if (!rateLimitStore.has(ip)) {
    rateLimitStore.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
  } else {
    const record = rateLimitStore.get(ip);
    if (now > record.resetTime) {
      record.count = 1;
      record.resetTime = now + RATE_LIMIT_WINDOW;
    } else {
      record.count++;
    }
    
    if (record.count > RATE_LIMIT_MAX_REQUESTS) {
      return res.status(429).json({
        apiStatus: { success: false, message: 'Too many requests. Please try again later.' }
      });
    }
  }
  next();
};

// Clean up rate limit store periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimitStore.entries()) {
    if (now > record.resetTime) {
      rateLimitStore.delete(ip);
    }
  }
}, 60000);

// ============================================
// MIDDLEWARE
// ============================================

/**
 * Verify ETS API configuration
 */
const checkConfig = (req, res, next) => {
  if (!isConfigured()) {
    console.error('[ETS API] Missing configuration');
    return res.status(503).json({
      apiStatus: { success: false, message: 'Bus service temporarily unavailable' }
    });
  }
  next();
};

/**
 * Generate unique request ID for tracing
 */
const generateRequestId = () => {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};

/**
 * Log API requests (without sensitive data)
 */
const requestLogger = (req, res, next) => {
  // Generate request ID for tracing
  req.requestId = generateRequestId();
  res.setHeader('X-Request-Id', req.requestId);
  
  const sanitizedQuery = { ...req.query };
  // Remove any potentially sensitive fields from logging
  delete sanitizedQuery.customerPhone;
  delete sanitizedQuery.customerEmail;
  
  console.log(`[ETS API] ${req.method} ${req.path}`, {
    requestId: req.requestId,
    timestamp: new Date().toISOString(),
    query: Object.keys(sanitizedQuery).length > 0 ? sanitizedQuery : undefined,
    body: req.body ? '[PRESENT]' : undefined,
  });
  next();
};

/**
 * Add security headers to responses
 */
const securityHeaders = (req, res, next) => {
  // Prevent caching of sensitive data
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
};

// Apply middleware to all routes
router.use(rateLimit);
router.use(checkConfig);
router.use(securityHeaders);
router.use(requestLogger);

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Make authenticated request to ETS API
 * @param {Object} options - Request options
 * @returns {Promise<Object>} API response
 */
const makeETSRequest = async (options) => {
  const auth = getDigestAuth();
  if (!auth) {
    throw new Error('API not configured');
  }

  const response = await auth.request({
    timeout: ETS_API_CONFIG.timeout,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    ...options,
  });

  return response.data;
};

/**
 * Determine boarding point source based on inventory type
 * Per ETS API Documentation:
 * - inventoryType 0, 1: Use boarding points from getAvailableBuses response
 * - inventoryType 2, 3, 5, 6: Use boarding points from getBusLayout response
 * - inventoryType 1: Boarding time may be null in layout; prefer search results for time
 * - To display complete boarding name with landmarks, map using boardingId from both responses
 * 
 * @param {number} inventoryType - Inventory type from bus response
 * @returns {Object} Configuration for boarding points
 */
const getBoardingPointConfig = (inventoryType) => {
  const type = parseInt(inventoryType);
  
  // Inventory types 2, 3, 5, 6: Use boarding points from getBusLayout
  // NOTE: For inventoryType 6 (MSRTC buses), MUST use layout response
  const useLayoutBoarding = [2, 3, 5, 6].includes(type);
  
  return {
    inventoryType: type,
    useLayoutForBoardingPoints: useLayoutBoarding,
    useSearchForBoardingPoints: !useLayoutBoarding,
    // For type 1: Both methods have boarding points but time is null in layout
    // Prefer search results for complete data including time
    preferSearchForTime: type === 1,
    // For complete boarding name with landmarks, map using boardingId
    canMapWithBoardingId: type === 1,
    // For MSRTC (type 6), always use layout
    isMSRTC: type === 6,
    // Notes for frontend
    notes: useLayoutBoarding
      ? 'Boarding/dropping points MUST be fetched from bus layout response'
      : 'Boarding/dropping points available in search results',
    recommendation: type === 1
      ? 'Use search results for boarding time; can map with layout using boardingId for landmarks'
      : null,
  };
};

/**
 * Handle API errors consistently
 * @param {Error} error - Error object
 * @param {string} operation - Operation name for logging
 * @param {Object} res - Express response object
 */
const handleApiError = (error, operation, res) => {
  console.error(`[ETS API] ${operation} error:`, {
    message: error.message,
    status: error.response?.status,
    data: error.response?.data?.apiStatus || 'No additional info',
  });

  // Return ETS API error if available
  if (error.response?.data?.apiStatus) {
    return res.status(error.response.status || 500).json(error.response.data);
  }

  // Generic error response (don't leak internal details)
  const statusCode = error.response?.status || 500;
  res.status(statusCode).json({
    apiStatus: { 
      success: false, 
      message: statusCode === 401 
        ? 'Authentication failed' 
        : `Failed to ${operation.toLowerCase()}`
    }
  });
};

// ============================================
// API ROUTES
// ============================================

/**
 * Get all stations/cities
 * GET /ets/getStations
 * 
 * Returns list of all available stations for bus booking
 */
router.get('/ets/getStations', async (req, res) => {
  try {
    const data = await makeETSRequest({
      method: 'GET',
      url: `${ETS_API_CONFIG.baseUrl}/getStations`,
    });
    
    res.json(data);
  } catch (error) {
    handleApiError(error, 'Get stations', res);
  }
});

/**
 * Search available buses
 * GET /ets/getAvailableBuses
 * 
 * Query params: 
 * - sourceCity: Source city name (required)
 * - destinationCity: Destination city name (required)
 * - doj: Date of journey in yyyy-MM-dd format (required)
 * 
 * Response includes boarding point configuration based on inventory type
 */
router.get('/ets/getAvailableBuses', async (req, res) => {
  try {
    const { sourceCity, destinationCity, doj } = req.query;
    
    // Validate required parameters
    if (!sourceCity || !destinationCity || !doj) {
      return res.status(400).json({
        apiStatus: { 
          success: false, 
          message: 'Missing required parameters: sourceCity, destinationCity, doj' 
        }
      });
    }

    // Validate date format
    if (!isValidDate(doj)) {
      return res.status(400).json({
        apiStatus: { success: false, message: 'Invalid date format. Use yyyy-MM-dd' }
      });
    }

    // Sanitize inputs
    const sanitizedSource = sanitizeString(sourceCity);
    const sanitizedDest = sanitizeString(destinationCity);

    if (!sanitizedSource || !sanitizedDest) {
      return res.status(400).json({
        apiStatus: { success: false, message: 'Invalid city names provided' }
      });
    }

    const data = await makeETSRequest({
      method: 'GET',
      url: `${ETS_API_CONFIG.baseUrl}/getAvailableBuses`,
      params: {
        sourceCity: encodeURIComponent(sanitizedSource),
        destinationCity: encodeURIComponent(sanitizedDest),
        doj,
      },
    });

    // Enhance response with boarding point configuration for each bus
    if (data.apiAvailableBuses && Array.isArray(data.apiAvailableBuses)) {
      data.apiAvailableBuses = data.apiAvailableBuses.map(bus => ({
        ...bus,
        _boardingPointConfig: getBoardingPointConfig(bus.inventoryType),
      }));
    }
    
    res.json(data);
  } catch (error) {
    handleApiError(error, 'Search buses', res);
  }
});

/**
 * Get bus seat layout
 * GET /ets/getBusLayout
 * 
 * Query params:
 * - sourceCity: Source city name (required)
 * - destinationCity: Destination city name (required)
 * - doj: Date of journey in yyyy-MM-dd format (required)
 * - inventoryType: Inventory type from search results (required)
 * - routeScheduleId: Route schedule ID from search results (required)
 * 
 * NOTE: For inventoryType 2, 3, 5, 6 - boarding/dropping points are in this response
 *       For inventoryType 0, 1 - use boarding/dropping from search results
 */
router.get('/ets/getBusLayout', async (req, res) => {
  try {
    const { sourceCity, destinationCity, doj, inventoryType, routeScheduleId } = req.query;
    
    // Validate required parameters
    if (!sourceCity || !destinationCity || !doj || inventoryType === undefined || !routeScheduleId) {
      return res.status(400).json({
        apiStatus: { 
          success: false, 
          message: 'Missing required parameters: sourceCity, destinationCity, doj, inventoryType, routeScheduleId' 
        }
      });
    }

    // Validate date format
    if (!isValidDate(doj)) {
      return res.status(400).json({
        apiStatus: { success: false, message: 'Invalid date format. Use yyyy-MM-dd' }
      });
    }

    // Validate inventory type
    if (!isValidInventoryType(inventoryType)) {
      return res.status(400).json({
        apiStatus: { success: false, message: 'Invalid inventory type' }
      });
    }

    // Validate route schedule ID
    if (!isValidRouteScheduleId(routeScheduleId)) {
      return res.status(400).json({
        apiStatus: { success: false, message: 'Invalid route schedule ID' }
      });
    }

    // Sanitize city inputs
    const sanitizedSource = sanitizeString(sourceCity);
    const sanitizedDest = sanitizeString(destinationCity);

    if (!sanitizedSource || !sanitizedDest) {
      return res.status(400).json({
        apiStatus: { success: false, message: 'Invalid city names provided' }
      });
    }

    const data = await makeETSRequest({
      method: 'GET',
      url: `${ETS_API_CONFIG.baseUrl}/getBusLayout`,
      params: {
        sourceCity: encodeURIComponent(sanitizedSource),
        destinationCity: encodeURIComponent(sanitizedDest),
        doj,
        inventoryType,
        routeScheduleId,
      },
    });

    // Add boarding point config to response
    data._boardingPointConfig = getBoardingPointConfig(inventoryType);
    
    res.json(data);
  } catch (error) {
    handleApiError(error, 'Get bus layout', res);
  }
});

/**
 * Block ticket (reserve seats for 10 minutes)
 * POST /ets/blockTicket
 * 
 * Request body should contain passenger and seat details
 * 
 * IMPORTANT: For ladies seat, ensure passenger sex is 'F' and title is 'Mrs/Ms'
 * Always include idType and idNumber fields even if empty
 */
router.post('/ets/blockTicket', async (req, res) => {
  try {
    const {
      sourceCity,
      destinationCity,
      doj,
      routeScheduleId,
      boardingPoint,
      customerName,
      customerEmail,
      customerPhone,
      blockSeatPaxDetails,
      inventoryType,
    } = req.body;

    // Validate required fields
    if (!sourceCity || !destinationCity || !doj || !routeScheduleId || !customerName || 
        !customerEmail || !customerPhone || !blockSeatPaxDetails || inventoryType === undefined) {
      return res.status(400).json({
        apiStatus: { 
          success: false, 
          message: 'Missing required booking parameters' 
        }
      });
    }

    // Validate date
    if (!isValidDate(doj)) {
      return res.status(400).json({
        apiStatus: { success: false, message: 'Invalid date format' }
      });
    }

    // Validate customer details
    if (!isValidEmail(customerEmail)) {
      return res.status(400).json({
        apiStatus: { success: false, message: 'Invalid email address' }
      });
    }

    if (!isValidPhone(customerPhone)) {
      return res.status(400).json({
        apiStatus: { success: false, message: 'Invalid phone number' }
      });
    }

    // Validate passenger details
    if (!Array.isArray(blockSeatPaxDetails) || blockSeatPaxDetails.length === 0) {
      return res.status(400).json({
        apiStatus: { success: false, message: 'At least one passenger is required' }
      });
    }

    // Validate each passenger
    const hasPrimary = blockSeatPaxDetails.some(pax => pax.primary === true);
    if (!hasPrimary) {
      return res.status(400).json({
        apiStatus: { 
          success: false, 
          message: 'One passenger must be marked as primary' 
        }
      });
    }

    // Validate boarding point based on inventory type
    const boardingConfig = getBoardingPointConfig(inventoryType);
    if (!boardingPoint || !boardingPoint.id) {
      // Boarding point is typically required
      console.warn('[ETS API] No boarding point provided');
    }

    // Sanitize request body
    const sanitizedBody = {
      ...req.body,
      sourceCity: sanitizeString(sourceCity),
      destinationCity: sanitizeString(destinationCity),
      customerName: sanitizeString(customerName),
      customerLastName: sanitizeString(req.body.customerLastName || ''),
      customerEmail: customerEmail.toLowerCase().trim(),
      customerPhone: customerPhone.replace(/\s/g, ''),
      customerAddress: sanitizeString(req.body.customerAddress || ''),
      blockSeatPaxDetails: blockSeatPaxDetails.map(pax => ({
        ...pax,
        name: sanitizeString(pax.name || ''),
        lastName: sanitizeString(pax.lastName || ''),
        email: pax.email ? pax.email.toLowerCase().trim() : '',
        mobile: pax.mobile ? pax.mobile.replace(/\s/g, '') : '',
        // Ensure required fields are present
        idType: pax.idType || 'PAN_CARD',
        idNumber: pax.idNumber || '',
        nameOnId: sanitizeString(pax.nameOnId || pax.name || ''),
      })),
    };

    const data = await makeETSRequest({
      method: 'POST',
      url: `${ETS_API_CONFIG.baseUrl}/blockTicket`,
      data: sanitizedBody,
    });

    res.json(data);
  } catch (error) {
    handleApiError(error, 'Block ticket', res);
  }
});

/**
 * Get RTC updated fare (for RTC services only)
 * GET /ets/getRtcUpdatedFare
 * 
 * Query params: blockTicketKey
 * 
 * NOTE: Call this ONLY for RTC services (where isRTC: true in search response)
 * Call after blockTicket and before seatBooking
 */
router.get('/ets/getRtcUpdatedFare', async (req, res) => {
  try {
    const { blockTicketKey } = req.query;
    
    if (!blockTicketKey) {
      return res.status(400).json({
        apiStatus: { success: false, message: 'Missing blockTicketKey parameter' }
      });
    }

    if (!isValidBlockTicketKey(blockTicketKey)) {
      return res.status(400).json({
        apiStatus: { success: false, message: 'Invalid block ticket key format' }
      });
    }

    const data = await makeETSRequest({
      method: 'GET',
      url: `${ETS_API_CONFIG.baseUrl}/getRtcUpdatedFare`,
      params: { blockTicketKey: blockTicketKey.toUpperCase() },
    });
    
    res.json(data);
  } catch (error) {
    handleApiError(error, 'Get RTC updated fare', res);
  }
});

/**
 * Book seat (confirm booking after payment)
 * GET /ets/seatBooking
 * 
 * Query params: blockTicketKey
 * 
 * IMPORTANT: Call this ONLY after successful payment
 * For RTC services, call getRtcUpdatedFare first
 */
router.get('/ets/seatBooking', async (req, res) => {
  try {
    const { blockTicketKey } = req.query;
    
    if (!blockTicketKey) {
      return res.status(400).json({
        apiStatus: { success: false, message: 'Missing blockTicketKey parameter' }
      });
    }

    if (!isValidBlockTicketKey(blockTicketKey)) {
      return res.status(400).json({
        apiStatus: { success: false, message: 'Invalid block ticket key format' }
      });
    }

    const data = await makeETSRequest({
      method: 'GET',
      url: `${ETS_API_CONFIG.baseUrl}/seatBooking`,
      params: { blockTicketKey: blockTicketKey},
    });

    // Log successful booking (for audit)
    if (data.apiStatus?.success) {
      console.log('[ETS API] Booking confirmed:', {
        etstnumber: data.etstnumber,
        opPNR: data.opPNR,
        timestamp: new Date().toISOString(),
      });
    }
    
    res.json(data);
  } catch (error) {
    handleApiError(error, 'Book seat', res);
  }
});

/**
 * Get booked ticket details
 * GET /ets/getTicketByETSTNumber
 * 
 * Query params: ETSTNumber (ETS ticket number)
 */
router.get('/ets/getTicketByETSTNumber', async (req, res) => {
  try {
    const { ETSTNumber } = req.query;
    
    if (!ETSTNumber) {
      return res.status(400).json({
        apiStatus: { success: false, message: 'Missing ETSTNumber parameter' }
      });
    }

    if (!isValidETSTicketNumber(ETSTNumber)) {
      return res.status(400).json({
        apiStatus: { success: false, message: 'Invalid ETS ticket number format' }
      });
    }

    const data = await makeETSRequest({
      method: 'GET',
      url: `${ETS_API_CONFIG.baseUrl}/getTicketByETSTNumber`,
      params: { ETSTNumber: ETSTNumber.toUpperCase() },
    });
    
    res.json(data);
  } catch (error) {
    handleApiError(error, 'Get ticket details', res);
  }
});

/**
 * Cancel ticket confirmation (get cancellation details before actual cancel)
 * POST /ets/cancelTicketConfirmation
 * 
 * Request body:
 * - etsTicketNo: ETS ticket number
 * - seatNbrsToCancel: Array of seat numbers to cancel
 */
router.post('/ets/cancelTicketConfirmation', async (req, res) => {
  try {
    const { etsTicketNo, seatNbrsToCancel } = req.body;
    
    if (!etsTicketNo) {
      return res.status(400).json({
        apiStatus: { success: false, message: 'Missing ETS ticket number' }
      });
    }

    if (!isValidETSTicketNumber(etsTicketNo)) {
      return res.status(400).json({
        apiStatus: { success: false, message: 'Invalid ETS ticket number format' }
      });
    }

    if (!seatNbrsToCancel || !Array.isArray(seatNbrsToCancel) || seatNbrsToCancel.length === 0) {
      return res.status(400).json({
        apiStatus: { success: false, message: 'Please specify seat numbers to cancel' }
      });
    }

    // Validate seat numbers format
    const validSeatFormat = seatNbrsToCancel.every(seat => 
      typeof seat === 'string' && /^[A-Z0-9]{1,5}$/.test(seat.toUpperCase())
    );

    if (!validSeatFormat) {
      return res.status(400).json({
        apiStatus: { success: false, message: 'Invalid seat number format' }
      });
    }

    const data = await makeETSRequest({
      method: 'POST',
      url: `${ETS_API_CONFIG.baseUrl}/cancelTicketConfirmation`,
      data: {
        etsTicketNo: etsTicketNo.toUpperCase(),
        seatNbrsToCancel: seatNbrsToCancel.map(s => s.toUpperCase()),
      },
    });

    res.json(data);
  } catch (error) {
    handleApiError(error, 'Cancel ticket confirmation', res);
  }
});

/**
 * Cancel ticket (actual cancellation)
 * POST /ets/cancelTicket
 * 
 * Request body:
 * - etsTicketNo: ETS ticket number
 * - seatNbrsToCancel: Array of seat numbers to cancel
 * 
 * IMPORTANT: Call cancelTicketConfirmation first to get refund details
 */
router.post('/ets/cancelTicket', async (req, res) => {
  try {
    const { etsTicketNo, seatNbrsToCancel } = req.body;
    
    if (!etsTicketNo) {
      return res.status(400).json({
        apiStatus: { success: false, message: 'Missing ETS ticket number' }
      });
    }

    if (!isValidETSTicketNumber(etsTicketNo)) {
      return res.status(400).json({
        apiStatus: { success: false, message: 'Invalid ETS ticket number format' }
      });
    }

    if (!seatNbrsToCancel || !Array.isArray(seatNbrsToCancel) || seatNbrsToCancel.length === 0) {
      return res.status(400).json({
        apiStatus: { success: false, message: 'Please specify seat numbers to cancel' }
      });
    }

    // Validate seat numbers format
    const validSeatFormat = seatNbrsToCancel.every(seat => 
      typeof seat === 'string' && /^[A-Z0-9]{1,5}$/.test(seat.toUpperCase())
    );

    if (!validSeatFormat) {
      return res.status(400).json({
        apiStatus: { success: false, message: 'Invalid seat number format' }
      });
    }

    const data = await makeETSRequest({
      method: 'POST',
      url: `${ETS_API_CONFIG.baseUrl}/cancelTicket`,
      data: {
        etsTicketNo: etsTicketNo.toUpperCase(),
        seatNbrsToCancel: seatNbrsToCancel.map(s => s.toUpperCase()),
      },
    });

    // Log cancellation (for audit)
    if (data.apiStatus?.success) {
      console.log('[ETS API] Ticket cancelled:', {
        etsTicketNo,
        seats: seatNbrsToCancel,
        refundAmount: data.totalRefundAmount,
        timestamp: new Date().toISOString(),
      });
    }

    res.json(data);
  } catch (error) {
    handleApiError(error, 'Cancel ticket', res);
  }
});

/**
 * Get plan and balance information
 * GET /ets/getMyPlanAndBalance
 * 
 * Returns API account details including balance
 */
router.get('/ets/getMyPlanAndBalance', async (req, res) => {
  try {
    const data = await makeETSRequest({
      method: 'GET',
      url: `${ETS_API_CONFIG.baseUrl}/getMyPlanAndBalance`,
    });

    // Don't expose sensitive account details to frontend
    const safeData = {
      apiStatus: data.apiStatus,
      planName: data.planName,
      planDescription: data.planDescription,
      planNature: data.planNature,
      product: data.product,
      // Balance information
      balance: data.balance,
      creditLimit: data.creditLimit,
    };
    
    res.json(safeData);
  } catch (error) {
    handleApiError(error, 'Get plan and balance', res);
  }
});

/**
 * Health check endpoint
 * GET /ets/health
 */
router.get('/ets/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    configured: isConfigured(),
    timestamp: new Date().toISOString(),
    version: '2.1.0', // ETS Live Production Integration
    environment: process.env.NODE_ENV || 'development',
  });
});

/**
 * Get boarding point configuration info
 * GET /ets/boardingPointInfo
 * 
 * Helper endpoint to understand boarding point logic per ETS documentation
 * Reference: http://partners.etravelsmart.com/bus/busApi.htm
 */
router.get('/ets/boardingPointInfo', (req, res) => {
  res.json({
    apiStatus: { success: true, message: 'Boarding point configuration info' },
    config: {
      inventoryTypes: {
        '0': {
          source: 'getAvailableBuses',
          description: 'Use boarding/dropping points from search results',
          action: 'Fetch from getAvailableBuses response directly',
        },
        '1': {
          source: 'getAvailableBuses',
          description: 'Use boarding/dropping points from search results. Time may be null in layout.',
          note: 'For complete boarding name with landmarks, map using boardingId from both responses',
          action: 'Use search results for time; optionally map with layout for landmarks using boardingId',
        },
        '2': {
          source: 'getBusLayout',
          description: 'Use boarding/dropping points from bus layout response',
          action: 'MUST call getBusLayout to get boarding/dropping points',
        },
        '3': {
          source: 'getBusLayout',
          description: 'Use boarding/dropping points from bus layout response',
          action: 'MUST call getBusLayout to get boarding/dropping points',
        },
        '5': {
          source: 'getBusLayout',
          description: 'Use boarding/dropping points from bus layout response',
          action: 'MUST call getBusLayout to get boarding/dropping points',
        },
        '6': {
          source: 'getBusLayout',
          description: 'MSRTC buses - Use boarding/dropping points from bus layout response',
          action: 'MUST call getBusLayout to get boarding/dropping points (MSRTC specific)',
        },
      },
      importantNotes: [
        'If dropping points are null, use destination city as dropping point',
        'For ladies seats, passenger sex must be F and title must be Mrs/Ms',
        'ID proof fields (idType, idNumber) are always required, even if empty',
        'One passenger must be marked as primary: true',
        'Valid idType values: PAN_CARD, VOTER_CARD, PASSPORT, DRIVING_LICENCE, RATION_CARD, AADHAR',
        'For RTC services (isRTC: true), call getRtcUpdatedFare after blockTicket and before seatBooking',
      ],
      bookingFlow: [
        '1. Search buses using getAvailableBuses',
        '2. Get seat layout using getBusLayout',
        '3. Block seats using blockTicket (10 min hold)',
        '4. For RTC buses: Call getRtcUpdatedFare',
        '5. Complete booking using seatBooking',
      ],
      cancellationFlow: [
        '1. Call cancelTicketConfirmation to get refund details',
        '2. Confirm with user about refund amount',
        '3. Call cancelTicket to execute cancellation',
      ],
    },
  });
});

module.exports = router;
