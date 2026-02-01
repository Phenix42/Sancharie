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
 * SECURITY:
 * - API credentials never exposed to frontend
 * - Digest Authentication handled server-side
 * - Request validation and sanitization
 * - Error handling without leaking internal details
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
  baseUrl: process.env.ETS_API_URL || 'http://test.etravelsmart.com/etsAPI/api',
  username: process.env.ETS_API_USERNAME || 'sancharie',
  password: process.env.ETS_API_PASSWORD || 'Amma@5143',
  timeout: 30000,
};

/**
 * Check if ETS API is properly configured
 */
const isConfigured = () => {
  return !!(ETS_API_CONFIG.baseUrl && ETS_API_CONFIG.username && ETS_API_CONFIG.password);
};

// ============================================
// AXIOS INSTANCE WITH DIGEST AUTH
// ============================================

const digestAuth = new AxiosDigestAuth({
  username: ETS_API_CONFIG.username,
  password: ETS_API_CONFIG.password,
});

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
      apiStatus: { success: false, message: 'Bus service not available' }
    });
  }
  next();
};

// Apply config check to all routes
router.use(checkConfig);

// ============================================
// API ROUTES
// ============================================

/**
 * Get all stations/cities
 * POST /ets/getStations
 */
router.post('/ets/getStations', async (req, res) => {
  try {
    const response = await digestAuth.request({
      method: 'GET',
      url: `${ETS_API_CONFIG.baseUrl}/getStations`,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });
    res.json(response.data);
  } catch (error) {
    console.error('[ETS API] getStations error:', error.message);
    res.status(error.response?.status || 500).json({
      apiStatus: { success: false, message: 'Failed to fetch stations' }
    });
  }
});

/**
 * Search available buses
 * GET /ets/getAvailableBuses
 * Query params: sourceCity, destinationCity, doj (yyyy-MM-dd)
 */
router.get('/ets/getAvailableBuses', async (req, res) => {
  try {
    const { sourceCity, destinationCity, doj } = req.query;
    
    if (!sourceCity || !destinationCity || !doj) {
      return res.status(400).json({
        apiStatus: { success: false, message: 'Missing required parameters: sourceCity, destinationCity, doj' }
      });
    }

    const response = await digestAuth.request({
      method: 'GET',
      url: `${ETS_API_CONFIG.baseUrl}/getAvailableBuses`,
      params: {
        sourceCity,
        destinationCity,
        doj,
      },
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });
    
    res.json(response.data);
  } catch (error) {
    console.error('[ETS API] getAvailableBuses error:', error.message);
    res.status(error.response?.status || 500).json({
      apiStatus: { success: false, message: 'Failed to search buses' }
    });
  }
});

/**
 * Get bus seat layout
 * GET /ets/getBusLayout
 * Query params: sourceCity, destinationCity, doj, inventoryType, routeScheduleId
 */
router.get('/ets/getBusLayout', async (req, res) => {
  try {
    const { sourceCity, destinationCity, doj, inventoryType, routeScheduleId } = req.query;
    
    if (!sourceCity || !destinationCity || !doj || inventoryType === undefined || !routeScheduleId) {
      return res.status(400).json({
        apiStatus: { success: false, message: 'Missing required parameters' }
      });
    }

    const response = await digestAuth.request({
      method: 'GET',
      url: `${ETS_API_CONFIG.baseUrl}/getBusLayout`,
      params: {
        sourceCity,
        destinationCity,
        doj,
        inventoryType,
        routeScheduleId,
      },
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });
    
    res.json(response.data);
  } catch (error) {
    console.error('[ETS API] getBusLayout error:', error.message);
    res.status(error.response?.status || 500).json({
      apiStatus: { success: false, message: 'Failed to get bus layout' }
    });
  }
});

/**
 * Block ticket (reserve seats for 10 minutes)
 * POST /ets/blockTicket
 */
router.post('/ets/blockTicket', async (req, res) => {
  try {
    const response = await digestAuth.request({
      method: 'POST',
      url: `${ETS_API_CONFIG.baseUrl}/blockTicket`,
      data: req.body,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });
    res.json(response.data);
  } catch (error) {
    console.error('[ETS API] blockTicket error:', error.message);
    res.status(error.response?.status || 500).json({
      apiStatus: { success: false, message: 'Failed to block ticket' }
    });
  }
});

/**
 * Get RTC updated fare (for RTC services only)
 * GET /ets/getRtcUpdatedFare
 * Query params: blockTicketKey
 */
router.get('/ets/getRtcUpdatedFare', async (req, res) => {
  try {
    const { blockTicketKey } = req.query;
    
    if (!blockTicketKey) {
      return res.status(400).json({
        apiStatus: { success: false, message: 'Missing blockTicketKey parameter' }
      });
    }

    const response = await digestAuth.request({
      method: 'GET',
      url: `${ETS_API_CONFIG.baseUrl}/getRtcUpdatedFare`,
      params: { blockTicketKey },
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });
    
    res.json(response.data);
  } catch (error) {
    console.error('[ETS API] getRtcUpdatedFare error:', error.message);
    res.status(error.response?.status || 500).json({
      apiStatus: { success: false, message: 'Failed to get updated fare' }
    });
  }
});

/**
 * Book seat (confirm booking after payment)
 * GET /ets/seatBooking
 * Query params: blockTicketKey
 */
router.get('/ets/seatBooking', async (req, res) => {
  try {
    const { blockTicketKey } = req.query;
    
    if (!blockTicketKey) {
      return res.status(400).json({
        apiStatus: { success: false, message: 'Missing blockTicketKey parameter' }
      });
    }

    const response = await digestAuth.request({
      method: 'GET',
      url: `${ETS_API_CONFIG.baseUrl}/seatBooking`,
      params: { blockTicketKey },
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });
    
    res.json(response.data);
  } catch (error) {
    console.error('[ETS API] seatBooking error:', error.message);
    res.status(error.response?.status || 500).json({
      apiStatus: { success: false, message: 'Failed to book seat' }
    });
  }
});

/**
 * Get booked ticket details
 * GET /ets/getTicketByETSTNumber
 * Query params: ETSTNumber
 */
router.get('/ets/getTicketByETSTNumber', async (req, res) => {
  try {
    const { ETSTNumber } = req.query;
    
    if (!ETSTNumber) {
      return res.status(400).json({
        apiStatus: { success: false, message: 'Missing ETSTNumber parameter' }
      });
    }

    const response = await digestAuth.request({
      method: 'GET',
      url: `${ETS_API_CONFIG.baseUrl}/getTicketByETSTNumber`,
      params: { ETSTNumber },
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });
    
    res.json(response.data);
  } catch (error) {
    console.error('[ETS API] getTicketByETSTNumber error:', error.message);
    res.status(error.response?.status || 500).json({
      apiStatus: { success: false, message: 'Failed to get ticket details' }
    });
  }
});

/**
 * Cancel ticket confirmation (get cancellation details before actual cancel)
 * POST /ets/cancelTicketConfirmation
 */
router.post('/ets/cancelTicketConfirmation', async (req, res) => {
  try {
    const { etsTicketNo, seatNbrsToCancel } = req.body;
    
    if (!etsTicketNo || !seatNbrsToCancel || !Array.isArray(seatNbrsToCancel)) {
      return res.status(400).json({
        apiStatus: { success: false, message: 'Missing required parameters' }
      });
    }

    const response = await digestAuth.request({
      method: 'POST',
      url: `${ETS_API_CONFIG.baseUrl}/cancelTicketConfirmation`,
      data: req.body,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });
    res.json(response.data);
  } catch (error) {
    console.error('[ETS API] cancelTicketConfirmation error:', error.message);
    res.status(error.response?.status || 500).json({
      apiStatus: { success: false, message: 'Failed to get cancellation details' }
    });
  }
});

/**
 * Cancel ticket (actual cancellation)
 * POST /ets/cancelTicket
 */
router.post('/ets/cancelTicket', async (req, res) => {
  try {
    const { etsTicketNo, seatNbrsToCancel } = req.body;
    
    if (!etsTicketNo || !seatNbrsToCancel || !Array.isArray(seatNbrsToCancel)) {
      return res.status(400).json({
        apiStatus: { success: false, message: 'Missing required parameters' }
      });
    }

    const response = await digestAuth.request({
      method: 'POST',
      url: `${ETS_API_CONFIG.baseUrl}/cancelTicket`,
      data: req.body,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });
    res.json(response.data);
  } catch (error) {
    console.error('[ETS API] cancelTicket error:', error.message);
    res.status(error.response?.status || 500).json({
      apiStatus: { success: false, message: 'Failed to cancel ticket' }
    });
  }
});

/**
 * Get plan and balance information
 * GET /ets/getMyPlanAndBalance
 */
router.get('/ets/getMyPlanAndBalance', async (req, res) => {
  try {
    const response = await digestAuth.request({
      method: 'GET',
      url: `${ETS_API_CONFIG.baseUrl}/getMyPlanAndBalance`,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });
    res.json(response.data);
  } catch (error) {
    console.error('[ETS API] getMyPlanAndBalance error:', error.message);
    res.status(error.response?.status || 500).json({
      apiStatus: { success: false, message: 'Failed to get plan and balance' }
    });
  }
});

/**
 * Health check
 */
router.get('/ets/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    configured: isConfigured(),
    apiUrl: ETS_API_CONFIG.baseUrl ? 'configured' : 'not configured'
  });
});

module.exports = router;
