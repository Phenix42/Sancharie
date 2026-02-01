/**
 * ============================================
 * BUS API PROXY ROUTES
 * ============================================
 * 
 * Secure proxy for third-party bus booking API.
 * All credentials stored server-side only.
 * 
 * Browser sees: https://sancharie.com/api/busservice/*
 * Server calls: [HIDDEN - Configured in .env]
 * 
 * SECURITY:
 * - API credentials never exposed to frontend
 * - Request validation and sanitization
 * - Error handling without leaking internal details
 * 
 * @module routes/bus
 */

const express = require('express');
const axios = require('axios');
const router = express.Router();

// ============================================
// CONFIGURATION (from environment only)
// ============================================

const BUS_API_CONFIG = {
  baseUrl: process.env.BUS_API_URL,
  username: process.env.BUS_API_USERNAME,
  password: process.env.BUS_API_PASSWORD,
  timeout: 30000,
};

/**
 * Check if bus API is properly configured
 */
const isConfigured = () => {
  return !!(BUS_API_CONFIG.baseUrl && BUS_API_CONFIG.username && BUS_API_CONFIG.password);
};

// ============================================
// SECURITY HELPERS
// ============================================

/**
 * Get API headers with credentials (server-side only)
 */
const getApiHeaders = () => ({
  'Content-Type': 'application/json',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Username': BUS_API_CONFIG.username,
  'Password': BUS_API_CONFIG.password,
});

/**
 * Sanitize request body - only allow expected fields
 */
const sanitizeBody = (body) => {
  if (!body || typeof body !== 'object') return {};
  
  const allowedFields = [
    'UserIp', 'DateOfJourney', 'OriginId', 'DestinationId',
    'SearchTokenId', 'ResultIndex', 'BoardingPointId', 'DroppingPointId',
    'Passenger', 'BookingId', 'SeatId', 'Remarks'
  ];
  
  const sanitized = {};
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      sanitized[field] = body[field];
    }
  }
  return sanitized;
};

// ============================================
// MIDDLEWARE
// ============================================

/**
 * Verify bus API configuration
 */
const checkConfig = (req, res, next) => {
  if (!isConfigured()) {
    console.error('[Bus API] Missing configuration');
    return res.status(503).json({
      Error: { ErrorCode: -1, ErrorMessage: 'Bus service not available' }
    });
  }
  next();
};

/**
 * Validate required fields
 */
const validateRequired = (fields) => (req, res, next) => {
  const missing = fields.filter(f => !req.body[f]);
  if (missing.length > 0) {
    return res.status(400).json({
      Error: { ErrorCode: -1, ErrorMessage: `Missing: ${missing.join(', ')}` }
    });
  }
  next();
};

// Apply config check to all routes
router.use(checkConfig);

// ============================================
// PROXY HANDLER
// ============================================

/**
 * Proxy requests to the bus API
 */
const proxyRequest = async (req, res, endpoint) => {
  try {
    const response = await axios({
      method: 'POST',
      url: `${BUS_API_CONFIG.baseUrl}${endpoint}`,
      headers: getApiHeaders(),
      data: sanitizeBody(req.body),
      timeout: BUS_API_CONFIG.timeout,
      validateStatus: (status) => status < 500,
    });

    res.status(response.status).json(response.data);
  } catch (error) {
    console.error(`[Bus API] ${endpoint}:`, error.message);
    
    let statusCode = 500;
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      statusCode = 503;
    } else if (error.code === 'ETIMEDOUT') {
      statusCode = 504;
    }
    
    res.status(statusCode).json({
      Error: { ErrorCode: -1, ErrorMessage: 'Service temporarily unavailable' }
    });
  }
};

// ============================================
// ROUTES
// ============================================

// Search buses
router.post('/busservice/rest/search', 
  validateRequired(['OriginId', 'DestinationId', 'DateOfJourney']),
  (req, res) => proxyRequest(req, res, '/busservice/rest/search')
);

// Get seat layout
router.post('/busservice/rest/seatlayout',
  validateRequired(['SearchTokenId', 'ResultIndex']),
  (req, res) => proxyRequest(req, res, '/busservice/rest/seatlayout')
);

// Get boarding points
router.post('/busservice/rest/boardingpoint',
  validateRequired(['SearchTokenId', 'ResultIndex']),
  (req, res) => proxyRequest(req, res, '/busservice/rest/boardingpoint')
);

// Block seat
router.post('/busservice/rest/blockseat',
  validateRequired(['SearchTokenId', 'ResultIndex', 'BoardingPointId']),
  (req, res) => proxyRequest(req, res, '/busservice/rest/blockseat')
);

// Book ticket
router.post('/busservice/rest/book',
  validateRequired(['SearchTokenId', 'ResultIndex', 'BoardingPointId']),
  (req, res) => proxyRequest(req, res, '/busservice/rest/book')
);

// Get booking details
router.post('/busservice/rest/getbookingdetail',
  validateRequired(['BookingId']),
  (req, res) => proxyRequest(req, res, '/busservice/rest/getbookingdetail')
);

// Cancel booking
router.post('/busservice/rest/cancelrequest',
  validateRequired(['BookingId', 'SeatId']),
  (req, res) => proxyRequest(req, res, '/busservice/rest/cancelrequest')
);

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', configured: isConfigured() });
});

module.exports = router;
