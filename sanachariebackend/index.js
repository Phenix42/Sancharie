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
const helmet = require('helmet');
const authRoutes = require('./routes/auth');
const paymentRoutes = require('./routes/payment');
const userRoutes = require('./routes/user');
const busRoutes = require('./routes/bus');
const { router: flightRoutes } = require('./routes/flight');
const { router: hotelRoutes } = require('./routes/hotel');
const { reconcileAllUsers } = require('./services/bookingReconciliationService');
const adminRoutes = require('./routes/admin');
const { ApplicationSettings, FestivalTheme, Banner, Discount, Coupon, Offer, AppAsset } = require('./models/AdminResources');

const app = express();
const PORT = process.env.PORT || 8000;
if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1);

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
let reconciliationTimer = null;
let reconciliationStartTimer = null;
let reconciliationRunning = false;

const runBookingReconciliation = async () => {
  if (reconciliationRunning) return;
  reconciliationRunning = true;
  try {
    const summary = await reconcileAllUsers();
    console.log('✅ Booking reconciliation completed:', summary);
  } catch (error) {
    console.error('⚠️ Booking reconciliation failed:', error.message);
  } finally {
    reconciliationRunning = false;
  }
};

const startBookingReconciliation = () => {
  if (!process.env.ETS_API_USERNAME || !process.env.ETS_API_PASSWORD ||
      !process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    console.warn('⚠️ Booking reconciliation disabled: provider/payment credentials are missing');
    return;
  }

  const requestedInterval = Number(process.env.BOOKING_RECONCILIATION_INTERVAL_MS) || 15 * 60 * 1000;
  const interval = Math.max(5 * 60 * 1000, requestedInterval);
  reconciliationStartTimer = setTimeout(runBookingReconciliation, 30 * 1000);
  reconciliationTimer = setInterval(runBookingReconciliation, interval);
  reconciliationStartTimer.unref();
  reconciliationTimer.unref();
};

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('✅ Connected to MongoDB');
    startBookingReconciliation();
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
app.use(helmet());

// CORS - Allow frontend origin
// SECURITY: Restrict to specific domains only
const defaultAllowedOrigins = [
  'https://sancharie.com',
  'https://www.sancharie.com',
  'https://api.sancharie.com'
];

const configuredOrigins = [
  process.env.FRONTEND_URL,
  process.env.ADMIN_URL,
  process.env.CORS_ORIGINS,
]
  .filter(Boolean)
  .flatMap((value) => value.split(','))
  .map((origin) => origin.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const allowedOrigins = Array.from(new Set([
  ...defaultAllowedOrigins,
  ...configuredOrigins,
]));

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
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
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

// Public, read-only runtime configuration consumed by the customer app.
app.get('/api/config', async (req, res, next) => {
  try {
    const now = new Date();
    const [settings, theme, banners, discounts, coupons, offers, appIcon] = await Promise.all([
      ApplicationSettings.findOne({ key: 'global' }).lean(),
      FestivalTheme.findOne({ enabled: true, startDate: { $lte: now }, endDate: { $gte: now } }).sort({ priority: -1, startDate: -1 }).lean(),
      Banner.find({ enabled: true, startDate: { $lte: now }, endDate: { $gte: now } }).sort({ priority: -1 }).limit(20).lean(),
      Discount.find({ enabled: true, startDate: { $lte: now }, endDate: { $gte: now } }).select('name description code bannerImage percentage maximumDiscount minimumBooking applicableRoutes startDate endDate').sort({ startDate: 1 }).lean(),
      Coupon.find({ enabled: true, startDate: { $lte: now }, endDate: { $gte: now } }).select('code name type value maximumDiscount minimumBooking applicableRoutes endDate').sort({ createdAt: -1 }).limit(50).lean(),
      Offer.find({ enabled: true, startDate: { $lte: now }, endDate: { $gte: now } }).select('name description type discountType discountValue maximumDiscount minimumBooking applicableRoutes bannerImage priority startDate endDate').sort({ priority: -1 }).limit(20).lean(),
      AppAsset.findOne({ key: 'app-icon' }).select('updatedAt').lean(),
    ]);
    const customerBanners = [
      ...banners.filter((banner) => banner.kind !== 'notification').map(({ title, description, image, ctaText, ctaUrl, kind, priority }) => ({ title, description, image, ctaText, ctaUrl, kind, priority })),
      ...offers.filter((offer) => offer.bannerImage).map((offer) => ({ title: offer.name, description: offer.description, image: offer.bannerImage, ctaText: 'Explore offer', ctaUrl: '/', kind: 'promotion', priority: offer.priority })),
    ].sort((left, right) => right.priority - left.priority).slice(0, 20);
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.json({ success: true, data: {
      appIconUrl: appIcon ? `/api/app-icon?v=${appIcon.updatedAt.getTime()}` : null,
      settings: {
        maintenanceMode: settings?.maintenanceMode ?? false,
        bookingsEnabled: settings?.bookingsEnabled ?? true,
        registrationEnabled: settings?.registrationEnabled ?? true,
        couponsEnabled: settings?.couponsEnabled ?? true,
        discountsEnabled: settings?.discountsEnabled ?? true,
        festivalThemeEnabled: settings?.festivalThemeEnabled ?? true,
        contactEmail: settings?.contactEmail || '', contactPhone: settings?.contactPhone || '',
        supportInformation: settings?.supportInformation || '', announcement: settings?.announcement || '',
      },
      theme: settings?.festivalThemeEnabled === false ? null : theme ? {
        name: theme.name, festival: theme.festival, primaryColor: theme.primaryColor,
        secondaryColor: theme.secondaryColor, backgroundColor: theme.backgroundColor,
        bannerImage: theme.bannerImage, logoImage: theme.logoImage, icon: theme.icon,
        promotionalText: theme.promotionalText, ctaText: theme.ctaText,
      } : null,
      banners: customerBanners,
      discounts: settings?.discountsEnabled === false ? [] : discounts,
      coupons: settings?.couponsEnabled === false ? [] : coupons,
      offers,
    } });
  } catch (error) { next(error); }
});

app.get('/api/app-icon', async (req, res, next) => {
  try {
    const asset = await AppAsset.findOne({ key: 'app-icon' }).select('image contentType updatedAt').lean();
    if (!asset) return res.status(404).json({ success: false, message: 'App icon has not been uploaded' });
    const etag = `W/"app-icon-${asset.updatedAt.getTime()}"`;
    res.set({ 'Content-Type': asset.contentType, 'Content-Length': asset.image.length, 'Cache-Control': 'public, max-age=300', ETag: etag });
    if (req.headers['if-none-match'] === etag) return res.status(304).end();
    res.send(asset.image);
  } catch (error) { next(error); }
});

// Authentication routes (OTP send/verify)
app.use('/auth', authRoutes);

// Payment routes (Razorpay integration)
app.use('/payment', paymentRoutes);

// User routes (profile, bookings)
app.use('/user', userRoutes);
app.use('/api/admin', adminRoutes);

// Bus and flight API proxy routes (hide actual API URLs from browser)
app.use('/api/airservice/rest', flightRoutes);
app.use('/api/flights', flightRoutes);
app.use('/api/flight', flightRoutes);
app.use('/airservice/rest', flightRoutes);
app.use('/flights', flightRoutes);
app.use('/flight', flightRoutes);
app.use('/api', busRoutes);
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
  const statusCode = err.status || (err.name === 'ValidationError' || err.name === 'CastError' || err.code === 11000 ? 400 : 500);
  res.status(statusCode).json({ 
    success: false, 
    message: statusCode === 500 ? 'Internal server error' : (err.code === 11000 ? 'A record with this value already exists' : err.message || 'An error occurred')
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
  if (reconciliationStartTimer) clearTimeout(reconciliationStartTimer);
  if (reconciliationTimer) clearInterval(reconciliationTimer);
  server.close(() => {
    process.exit(0);
  });
});

module.exports = app;
