/**
 * User Routes - Profile management and bookings
 * 
 * SECURITY:
 * - All routes requiring authentication use JWT verification
 * - JWT_SECRET must be configured in environment variables
 * - Never store sensitive data in JWT payload
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Booking = require('../models/Booking');
const { hashReference } = require('../services/paymentSecurity');
const { reconcileUserBookings } = require('../services/bookingReconciliationService');

const BOOKING_STATUSES = ['confirmed', 'cancelled', 'pending', 'completed', 'failed'];
const PAYMENT_STATUSES = ['pending', 'completed', 'failed', 'refunded'];
const SERVICE_TYPES = ['bus', 'flight', 'hotel'];

const cleanText = (value, maxLength = 500) => String(value || '').trim().slice(0, maxLength);

const parseJourneyDate = (value) => {
  const text = cleanText(value, 100);
  const dayFirstMatch = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\D|$)/);

  if (dayFirstMatch) {
    const [, day, month, year] = dayFirstMatch;
    const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    if (parsed.getUTCFullYear() === Number(year) &&
        parsed.getUTCMonth() === Number(month) - 1 &&
        parsed.getUTCDate() === Number(day)) return parsed;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const serializeBooking = (booking) => ({
  id: booking._id,
  bookingId: booking.bookingId,
  clientReference: booking.clientReference,
  serviceType: booking.serviceType,
  pnr: booking.pnr,
  ticketNo: booking.ticketNo,
  externalBookingId: booking.externalBookingId,
  busName: booking.busName,
  busType: booking.busType,
  busNumber: booking.busNumber,
  source: booking.source,
  destination: booking.destination,
  fromCity: booking.fromCity || booking.source,
  toCity: booking.toCity || booking.destination,
  journeyDate: booking.journeyDate,
  departureTime: booking.departureTime,
  arrivalTime: booking.arrivalTime,
  boardingPoint: booking.boardingPoint,
  droppingPoint: booking.droppingPoint,
  seats: booking.seats,
  selectedSeats: booking.selectedSeats?.length ? booking.selectedSeats : booking.seats,
  passengers: booking.passengers,
  baseFare: booking.baseFare,
  serviceTax: booking.serviceTax,
  totalFare: booking.totalFare,
  status: booking.status,
  providerStatus: booking.providerStatus,
  failureStage: booking.failureStage,
  failureReason: booking.failureReason,
  statusHistory: booking.statusHistory,
  paymentStatus: booking.paymentStatus,
  paymentId: booking.paymentId,
  paymentOrderId: booking.paymentOrderId,
  relatedPaymentIds: booking.relatedPaymentIds,
  paymentIssue: booking.paymentIssue,
  paymentNote: booking.paymentNote,
  paymentMethod: booking.paymentMethod,
  cancellationReason: booking.cancellationReason,
  refundAmount: booking.refundAmount,
  refundStatus: booking.refundStatus,
  confirmedAt: booking.confirmedAt,
  failedAt: booking.failedAt,
  reconciliationSource: booking.reconciliationSource,
  lastReconciledAt: booking.lastReconciledAt,
  createdAt: booking.createdAt,
  updatedAt: booking.updatedAt
});

// ============================================
// SECURITY: JWT Configuration
// ============================================
// NEVER use fallback secrets in production
const JWT_SECRET = process.env.JWT_SECRET;

// Validate JWT_SECRET is configured
if (!JWT_SECRET) {
  console.error('❌ SECURITY ERROR: JWT_SECRET not configured in environment variables!');
  console.error('   Set JWT_SECRET in .env file before starting the server.');
}

/**
 * Middleware to verify JWT token
 * SECURITY: Validates token and attaches user to request
 */
const authenticateToken = (req, res, next) => {
  // Check if JWT_SECRET is configured
  if (!JWT_SECRET) {
    console.error('Authentication failed: JWT_SECRET not configured');
    return res.status(500).json({ 
      success: false, 
      message: 'Server configuration error' 
    });
  }

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      // SECURITY: Don't reveal specific error details
      return res.status(403).json({ success: false, message: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

/**
 * POST /user/login-complete
 * Called after OTP verification to create/get user and generate JWT
 * 
 * SECURITY:
 * - Only called after successful OTP verification
 * - JWT includes only non-sensitive user identifiers
 * - Token expiry set to limit exposure window
 */
router.post('/login-complete', async (req, res) => {
  try {
    // Check if JWT_SECRET is configured
    if (!JWT_SECRET) {
      console.error('Login failed: JWT_SECRET not configured');
      return res.status(500).json({ 
        success: false, 
        message: 'Server configuration error' 
      });
    }

    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ success: false, message: 'Phone number required' });
    }

    // Validate phone format
    if (!/^[6-9]\d{9}$/.test(phone)) {
      return res.status(400).json({ success: false, message: 'Invalid phone number format' });
    }

    // Find or create user
    let user = await User.findOne({ phone });
    let isNewUser = false;

    if (!user) {
      // Create new user
      try {
        user = new User({ phone });
        await user.save();
        isNewUser = true;
        console.log(`✅ New user created: ${phone}`);
      } catch (saveError) {
        // Handle duplicate key error (race condition)
        if (saveError.code === 11000) {
          user = await User.findOne({ phone });
          if (!user) {
            throw saveError;
          }
          console.log(`✅ User found after race condition: ${phone}`);
        } else {
          throw saveError;
        }
      }
    } else {
      // Update last login
      user.lastLogin = new Date();
      await user.save();
      console.log(`✅ User logged in: ${phone}`);
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, phone: user.phone },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      message: isNewUser ? 'Account created successfully' : 'Login successful',
      isNewUser,
      isProfileComplete: user.isProfileComplete,
      token,
      user: {
        id: user._id,
        phone: user.phone,
        name: user.name,
        email: user.email,
        age: user.age,
        gender: user.gender,
        isProfileComplete: user.isProfileComplete
      }
    });
  } catch (error) {
    console.error('Login complete error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /user/profile
 * Get user profile (requires auth)
 */
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        phone: user.phone,
        name: user.name,
        email: user.email,
        age: user.age,
        gender: user.gender,
        isProfileComplete: user.isProfileComplete,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * PUT /user/profile
 * Update user profile (requires auth)
 */
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { name, email, age, gender } = req.body;
    
    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Update fields
    if (name) user.name = name;
    if (email) user.email = email;
    if (age) user.age = parseInt(age);
    if (gender) user.gender = gender;

    // Check if profile is complete
    user.isProfileComplete = user.checkProfileComplete();

    await user.save();

    console.log(`✅ Profile updated for: ${user.phone}`);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        phone: user.phone,
        name: user.name,
        email: user.email,
        age: user.age,
        gender: user.gender,
        isProfileComplete: user.isProfileComplete
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /user/bookings
 * Get user's bookings (requires auth)
 */
router.get('/bookings', authenticateToken, async (req, res) => {
  try {
    const bookings = await Booking.find({ userId: req.user.userId })
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      bookings: bookings.map(serializeBooking)
    });
  } catch (error) {
    console.error('Get bookings error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * POST /user/bookings
 * Create a new booking (requires auth)
 */
router.post('/bookings', authenticateToken, async (req, res) => {
  try {
    const {
      clientReference, serviceType, type,
      providerReference,
      busName, busType, busNumber,
      source, destination, fromCity, toCity,
      journeyDate, departureTime, arrivalTime,
      boardingPoint, droppingPoint,
      seats, selectedSeats, passengers,
      baseFare, serviceTax, totalFare,
      paymentId, paymentOrderId, paymentStatus, paymentMethod,
      externalBookingId, ticketNo, pnr,
      status, providerStatus, failureStage, failureReason
    } = req.body;

    const normalizedClientReference = cleanText(clientReference, 100);
    if (normalizedClientReference) {
      const existingBooking = await Booking.findOne({
        userId: req.user.userId,
        clientReference: normalizedClientReference
      });

      if (existingBooking) {
        return res.json({
          success: true,
          duplicate: true,
          message: 'Booking attempt already exists',
          booking: serializeBooking(existingBooking)
        });
      }
    }

    const parsedJourneyDate = parseJourneyDate(journeyDate);
    const requiredTextFields = { busName, busType, source, destination };
    const missingFields = Object.entries(requiredTextFields)
      .filter(([, value]) => !cleanText(value, 250))
      .map(([field]) => field);
    const parsedBaseFare = Number(baseFare);
    const parsedTotalFare = Number(totalFare);

    if (missingFields.length || !parsedJourneyDate ||
        !Number.isFinite(parsedBaseFare) || !Number.isFinite(parsedTotalFare) ||
        parsedBaseFare < 0 || parsedTotalFare < 0) {
      return res.status(400).json({
        success: false,
        message: 'Complete and valid booking details are required',
        fields: missingFields
      });
    }

    const normalizedStatus = BOOKING_STATUSES.includes(String(status).toLowerCase())
      ? String(status).toLowerCase()
      : 'confirmed';
    const normalizedPaymentStatus = PAYMENT_STATUSES.includes(String(paymentStatus).toLowerCase())
      ? String(paymentStatus).toLowerCase()
      : 'completed';
    const requestedServiceType = String(serviceType || type || 'bus').toLowerCase();
    const normalizedServiceType = SERVICE_TYPES.includes(requestedServiceType)
      ? requestedServiceType
      : 'bus';

    const booking = new Booking({
      userId: req.user.userId,
      userPhone: req.user.phone,
      ...(normalizedClientReference ? { clientReference: normalizedClientReference } : {}),
      serviceType: normalizedServiceType,
      providerReferenceHash: providerReference ? hashReference(cleanText(providerReference, 500)) : '',
      busName: cleanText(busName, 250),
      busType: cleanText(busType, 100),
      busNumber: cleanText(busNumber, 100),
      source: cleanText(source, 250),
      destination: cleanText(destination, 250),
      fromCity: cleanText(fromCity || source, 250),
      toCity: cleanText(toCity || destination, 250),
      journeyDate: parsedJourneyDate,
      departureTime: cleanText(departureTime, 100),
      arrivalTime: cleanText(arrivalTime, 100),
      boardingPoint,
      droppingPoint,
      seats: seats || selectedSeats,
      selectedSeats: selectedSeats || seats,
      passengers,
      baseFare: parsedBaseFare,
      serviceTax: Number(serviceTax) || 0,
      totalFare: parsedTotalFare,
      paymentId: cleanText(paymentId, 150),
      paymentOrderId: cleanText(paymentOrderId, 150),
      paymentStatus: normalizedPaymentStatus,
      paymentMethod: cleanText(paymentMethod, 100),
      externalBookingId: cleanText(externalBookingId, 200),
      ticketNo: cleanText(ticketNo, 200),
      pnr: cleanText(pnr, 200),
      status: normalizedStatus,
      providerStatus: cleanText(providerStatus, 100),
      failureStage: normalizedStatus === 'failed' ? cleanText(failureStage, 100) : '',
      failureReason: normalizedStatus === 'failed' ? cleanText(failureReason) : '',
      confirmedAt: normalizedStatus === 'confirmed' ? new Date() : undefined,
      failedAt: normalizedStatus === 'failed' ? new Date() : undefined,
      statusHistory: [{
        status: normalizedStatus,
        paymentStatus: normalizedPaymentStatus,
        stage: cleanText(failureStage || (normalizedStatus === 'confirmed' ? 'confirmed' : 'created'), 100),
        message: normalizedStatus === 'failed' ? cleanText(failureReason) : ''
      }]
    });

    await booking.save();

    console.log(`✅ Booking created: ${booking.bookingId} for ${req.user.phone}`);

    res.json({
      success: true,
      message: 'Booking created successfully',
      booking: serializeBooking(booking)
    });
  } catch (error) {
    if (error.code === 11000 && req.body.clientReference) {
      const existingBooking = await Booking.findOne({
        userId: req.user.userId,
        clientReference: cleanText(req.body.clientReference, 100)
      });
      if (existingBooking) {
        return res.json({
          success: true,
          duplicate: true,
          message: 'Booking attempt already exists',
          booking: serializeBooking(existingBooking)
        });
      }
    }
    console.error('Create booking error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * POST /user/bookings/reconcile
 * Recover provider-issued tickets and captured-payment failures into MongoDB.
 * The service matches only payments belonging to the authenticated customer.
 */
router.post('/bookings/reconcile', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const reconciliation = await reconcileUserBookings(user);
    const bookings = await Booking.find({ userId: user._id }).sort({ createdAt: -1 });
    res.json({
      success: true,
      message: 'Bookings reconciled successfully',
      reconciliation,
      bookings: bookings.map(serializeBooking),
    });
  } catch (error) {
    console.error('Booking reconciliation error:', error.message);
    res.status(502).json({
      success: false,
      message: 'Provider reconciliation is temporarily unavailable. Saved bookings are still available.',
    });
  }
});

/**
 * GET /user/bookings/:id
 * Get specific booking details (requires auth)
 */
router.get('/bookings/:id', authenticateToken, async (req, res) => {
  try {
    const booking = await Booking.findOne({
      _id: req.params.id,
      userId: req.user.userId
    });

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    res.json({
      success: true,
      booking
    });
  } catch (error) {
    console.error('Get booking error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * PUT /user/bookings/:id
 * Update booking (e.g. status after cancellation)
 */
router.put('/bookings/:id', authenticateToken, async (req, res) => {
  try {
    const booking = await Booking.findOne({
      _id: req.params.id,
      userId: req.user.userId
    });

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    const {
      status, paymentStatus, paymentId, paymentOrderId, paymentMethod,
      externalBookingId, ticketNo, pnr, providerStatus,
      failureStage, failureReason,
      refundAmount, refundStatus, cancellationReason
    } = req.body;

    const normalizedStatus = String(status || '').toLowerCase();
    const normalizedPaymentStatus = String(paymentStatus || '').toLowerCase();

    if (BOOKING_STATUSES.includes(normalizedStatus)) booking.status = normalizedStatus;
    if (PAYMENT_STATUSES.includes(normalizedPaymentStatus)) booking.paymentStatus = normalizedPaymentStatus;
    if (paymentId !== undefined) booking.paymentId = cleanText(paymentId, 150);
    if (paymentOrderId !== undefined) booking.paymentOrderId = cleanText(paymentOrderId, 150);
    if (paymentMethod !== undefined) booking.paymentMethod = cleanText(paymentMethod, 100);
    if (externalBookingId !== undefined) booking.externalBookingId = cleanText(externalBookingId, 200);
    if (ticketNo !== undefined) booking.ticketNo = cleanText(ticketNo, 200);
    if (pnr !== undefined) booking.pnr = cleanText(pnr, 200);
    if (providerStatus !== undefined) booking.providerStatus = cleanText(providerStatus, 100);
    if (failureStage !== undefined) booking.failureStage = cleanText(failureStage, 100);
    if (failureReason !== undefined) booking.failureReason = cleanText(failureReason);
    if (refundAmount !== undefined) booking.refundAmount = refundAmount;
    if (refundStatus !== undefined) booking.refundStatus = cleanText(refundStatus, 100);
    if (cancellationReason !== undefined) booking.cancellationReason = cleanText(cancellationReason);

    if (booking.status === 'confirmed' && normalizedStatus) {
      booking.confirmedAt = booking.confirmedAt || new Date();
      booking.failureStage = '';
      booking.failureReason = '';
    }
    if (booking.status === 'failed' && normalizedStatus) booking.failedAt = new Date();

    if (normalizedStatus || normalizedPaymentStatus || failureReason !== undefined) {
      booking.statusHistory.push({
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        stage: cleanText(failureStage || (booking.status === 'confirmed' ? 'confirmed' : 'updated'), 100),
        message: cleanText(failureReason)
      });
    }

    await booking.save();

    console.log(`✅ Booking updated: ${booking.bookingId} → status: ${booking.status}`);

    res.json({
      success: true,
      message: 'Booking updated successfully',
      booking: serializeBooking(booking)
    });
  } catch (error) {
    console.error('Update booking error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * POST /user/verify-token
 * Verify if token is still valid
 */
router.post('/verify-token', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        phone: user.phone,
        name: user.name,
        email: user.email,
        age: user.age,
        gender: user.gender,
        isProfileComplete: user.isProfileComplete
      }
    });
  } catch (error) {
    console.error('Verify token error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
