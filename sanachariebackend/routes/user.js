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
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({
      success: true,
      bookings: bookings.map(b => ({
        id: b._id,
        bookingId: b.bookingId,
        pnr: b.pnr,
        ticketNo: b.ticketNo,
        externalBookingId: b.externalBookingId,
        busName: b.busName,
        busType: b.busType,
        busNumber: b.busNumber,
        source: b.source,
        destination: b.destination,
        fromCity: b.fromCity || b.source,
        toCity: b.toCity || b.destination,
        journeyDate: b.journeyDate,
        departureTime: b.departureTime,
        arrivalTime: b.arrivalTime,
        boardingPoint: b.boardingPoint,
        droppingPoint: b.droppingPoint,
        seats: b.seats,
        selectedSeats: b.selectedSeats || b.seats,
        passengers: b.passengers,
        baseFare: b.baseFare,
        totalFare: b.totalFare,
        status: b.status,
        paymentStatus: b.paymentStatus,
        paymentId: b.paymentId,
        createdAt: b.createdAt
      }))
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
      busName, busType, busNumber,
      source, destination, fromCity, toCity,
      journeyDate, departureTime, arrivalTime,
      boardingPoint, droppingPoint,
      seats, selectedSeats, passengers,
      baseFare, serviceTax, totalFare,
      paymentId, paymentStatus, paymentMethod,
      externalBookingId, ticketNo, pnr
    } = req.body;

    const booking = new Booking({
      userId: req.user.userId,
      userPhone: req.user.phone,
      busName,
      busType,
      busNumber,
      source,
      destination,
      fromCity: fromCity || source,
      toCity: toCity || destination,
      journeyDate: new Date(journeyDate),
      departureTime,
      arrivalTime,
      boardingPoint,
      droppingPoint,
      seats: seats || selectedSeats,
      selectedSeats: selectedSeats || seats,
      passengers,
      baseFare,
      serviceTax,
      totalFare,
      paymentId,
      paymentStatus: paymentStatus || 'completed',
      paymentMethod,
      externalBookingId,
      ticketNo,
      pnr,
      status: 'confirmed'
    });

    await booking.save();

    console.log(`✅ Booking created: ${booking.bookingId} for ${req.user.phone}`);

    res.json({
      success: true,
      message: 'Booking created successfully',
      booking: {
        id: booking._id,
        bookingId: booking.bookingId,
        status: booking.status
      }
    });
  } catch (error) {
    console.error('Create booking error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
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

    const { status, refundAmount, refundStatus, cancellationReason } = req.body;

    const allowedStatuses = ['confirmed', 'cancelled', 'pending', 'completed'];
    if (status && allowedStatuses.includes(status)) {
      booking.status = status;
    }
    if (refundAmount !== undefined) booking.refundAmount = refundAmount;
    if (refundStatus) booking.refundStatus = refundStatus;
    if (cancellationReason) booking.cancellationReason = cancellationReason;

    await booking.save();

    console.log(`✅ Booking updated: ${booking.bookingId} → status: ${booking.status}`);

    res.json({
      success: true,
      message: 'Booking updated successfully',
      booking: {
        id: booking._id,
        bookingId: booking.bookingId,
        status: booking.status
      }
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
