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
 * - Security headers protect against common attacks
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
const busRoutes = require('./routes/bus');
const { router: flightRoutes } = require('./routes/flight');
const { router: hotelRoutes } = require('./routes/hotel');

const app = express();
const PORT = process.env.PORT || 5000;

// ============================================
// SECURITY: Validate Required Environment Variables
// ============================================
const requiredEnvVars = ['JWT_SECRET', 'MONGODB_URI'];
const missingEnvVars = requiredEnvVars.filter(v => !process.env[v]);

if (missingEnvVars.length > 0) {
  console.error('❌ SECURITY ERROR: Missing required environment variables:');
  missingEnvVars.forEach(v => console.error(`   - ${v}`));
  console.error('   Please configure these in your .env file');
  // Don't exit in development, but warn
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
}

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

// Security headers middleware
const securityHeaders = (req, res, next) => {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Enable XSS filter
  res.setHeader('X-XSS-Protection', '1; mode=block');
  // Control referrer information
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Prevent caching of sensitive data
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  // Remove server identification
  res.removeHeader('X-Powered-By');
  next();
};

app.use(securityHeaders);

// CORS - Allow frontend origin
// SECURITY: Restrict to specific domains only
const allowedOrigins = [
  'https://sancharie.com',
  'https://www.sancharie.com',
  'https://api.sancharie.com'
];

// Add localhost only in development
if (process.env.NODE_ENV !== 'production') {
  allowedOrigins.push(
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:4173',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
    'http://127.0.0.1:4173',
    'http://127.0.0.1:3000'
  );
}

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`⚠️ CORS blocked request from: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400 // Cache preflight for 24 hours
}));

// Parse JSON bodies with size limit (prevent large payload attacks)
app.use(express.json({ limit: '100kb' }));

// Parse URL-encoded bodies with size limit
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ============================================
// ROUTES
// ============================================

// Health check endpoint (minimal info, no sensitive data)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString()
  });
});

// Authentication routes (OTP send/verify)
app.use('/auth', authRoutes);

// Payment routes (Razorpay integration)
app.use('/payment', paymentRoutes);

// User routes (profile, bookings)
app.use('/user', userRoutes);

// Bus and flight API proxy routes (hide actual API URLs from browser)
app.use('/api', busRoutes);
app.use('/api/flights', flightRoutes);
app.use('/flights', flightRoutes);
app.use('/api/hotels', hotelRoutes);

// ============================================
// ERROR HANDLING
// ============================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Endpoint not found' });
});

// Global error handler
// SECURITY: Never expose stack traces or internal errors to clients
app.use((err, req, res, next) => {
  // Log error internally (with full details)
  console.error('Server Error:', {
    message: err.message,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString(),
    // Only log stack in development
    stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined
  });

  // SECURITY: Generic error response to client
  // Never expose internal error details
  const statusCode = err.status || 500;
  res.status(statusCode).json({ 
    success: false, 
    message: statusCode === 500 ? 'Internal server error' : err.message || 'An error occurred'
  });
});

// ============================================
// START SERVER
// ============================================

const server = app.listen(PORT, '0.0.0.0', () => {
  // SECURITY: Don't log sensitive config values
  console.log(`
============================================
🚀 Sancharie Backend Server Started
============================================
Port: ${PORT}
Environment: ${process.env.NODE_ENV || 'development'}
============================================
Configuration Status:
${process.env.JWT_SECRET ? '✅' : '❌'} JWT_SECRET
${process.env.SMS_API_KEY ? '✅' : '❌'} SMS_API_KEY
${process.env.RAZORPAY_KEY_ID ? '✅' : '❌'} RAZORPAY_KEY_ID
${process.env.RAZORPAY_KEY_SECRET ? '✅' : '❌'} RAZORPAY_KEY_SECRET
${process.env.ETS_API_USERNAME ? '✅' : '❌'} ETS_API
${process.env.FLIGHT_API_USERNAME && process.env.FLIGHT_API_PASSWORD ? '✅' : '❌'} FLIGHT_API
${process.env.HOTEL_API_USERNAME && process.env.HOTEL_API_PASSWORD ? '✅' : '⚠️'} HOTEL_API (mock fallback in development)
${process.env.MONGODB_URI ? '✅' : '❌'} MONGODB_URI
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
