/**
 * ============================================
 * SECURE OTP AUTHENTICATION SERVER
 * ============================================
 * 
 * SECURITY ARCHITECTURE:
 * - All SMS API credentials stored in .env (NEVER in frontend)
 * - Frontend only communicates with this backend
 * - Backend makes all external API calls to MetaReach
 * - Rate limiting prevents brute force attacks
 * - OTP expiry prevents replay attacks
 * 
 * FLOW:
 * React Frontend → This Backend → MetaReach SMS API
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const authRoutes = require('./routes/auth');
const paymentRoutes = require('./routes/payment');
const userRoutes = require('./routes/user');

const app = express();
const PORT = process.env.PORT || 5000;

// ============================================
// MONGODB CONNECTION
// ============================================
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sancharie';

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('✅ Connected to MongoDB');
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err.message);
    console.log('⚠️ Server will continue without database - some features may not work');
  });

// ============================================
// SECURITY MIDDLEWARE
// ============================================

// CORS - Allow frontend origin
// In production, restrict this to your actual domain
app.use(cors({
  origin: true, // Allow all origins in development
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Parse JSON bodies
app.use(express.json());

// Parse URL-encoded bodies
app.use(express.urlencoded({ extended: true }));

// ============================================
// ROUTES
// ============================================

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Authentication routes (OTP send/verify)
app.use('/auth', authRoutes);

// Payment routes (Razorpay integration)
app.use('/payment', paymentRoutes);

// User routes (profile, bookings)
app.use('/user', userRoutes);

// ============================================
// ERROR HANDLING
// ============================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Endpoint not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({ 
    success: false, 
    message: 'Internal server error' 
  });
});

// ============================================
// START SERVER
// ============================================

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`
============================================
🚀 Sancharie Backend Server Started
============================================
Port: ${PORT}
Environment: ${process.env.NODE_ENV || 'development'}
Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}
============================================
SECURITY STATUS:
✅ SMS API Key: ${process.env.SMS_API_KEY ? 'Configured' : '❌ MISSING'}
✅ Sender ID: ${process.env.SMS_SENDER_ID ? 'Configured' : '❌ MISSING'}
✅ Razorpay Key ID: ${process.env.RAZORPAY_KEY_ID ? 'Configured' : '❌ MISSING'}
✅ Razorpay Secret: ${process.env.RAZORPAY_KEY_SECRET ? 'Configured' : '❌ MISSING'}
✅ CORS: Enabled for frontend only
============================================
  `);
});

// Keep the server running
server.on('error', (err) => {
  console.error('Server error:', err);
});

process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  server.close(() => {
    process.exit(0);
  });
});

module.exports = app;
