/**
 * ============================================
 * VALIDATION MIDDLEWARE
 * ============================================
 * 
 * SECURITY FEATURES:
 * 1. Rate limiting - Prevents brute force / spam attacks
 * 2. Phone validation - Ensures valid Indian mobile numbers
 * 3. Input sanitization - Prevents injection attacks
 */

// Rate limiting storage
// PRODUCTION: Use Redis for distributed rate limiting
const rateLimitStore = new Map();

/**
 * Rate Limiter Middleware
 * 
 * SECURITY:
 * - Limits OTP requests to prevent abuse
 * - Default: 3 requests per 10 minutes per IP/phone
 * - Configurable via environment variables
 */
function rateLimiter(req, res, next) {
  const maxRequests = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 3;
  const windowMinutes = parseInt(process.env.RATE_LIMIT_WINDOW_MINUTES) || 10;
  const windowMs = windowMinutes * 60 * 1000;
  
  // Create a unique key based on IP and mobile number
  const mobile = req.body.mobile || '';
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const key = `${ip}-${mobile}`;
  
  const now = Date.now();
  
  // Get existing rate limit data
  let rateData = rateLimitStore.get(key);
  
  if (!rateData) {
    // First request from this IP/phone combination
    rateData = {
      count: 1,
      firstRequest: now,
      windowExpires: now + windowMs
    };
    rateLimitStore.set(key, rateData);
    
    // Auto-cleanup after window expires
    setTimeout(() => {
      rateLimitStore.delete(key);
    }, windowMs);
    
    return next();
  }
  
  // Check if window has expired
  if (now > rateData.windowExpires) {
    // Reset the window
    rateData = {
      count: 1,
      firstRequest: now,
      windowExpires: now + windowMs
    };
    rateLimitStore.set(key, rateData);
    return next();
  }
  
  // Check if limit exceeded
  if (rateData.count >= maxRequests) {
    const remainingTime = Math.ceil((rateData.windowExpires - now) / 60000);
    
    console.log(`⚠️ Rate limit exceeded for ${key}`);
    
    return res.status(429).json({
      success: false,
      message: `Too many OTP requests. Please try again in ${remainingTime} minute(s).`,
      retryAfter: remainingTime
    });
  }
  
  // Increment counter
  rateData.count += 1;
  rateLimitStore.set(key, rateData);
  
  next();
}

/**
 * Phone Number Validation Middleware
 * 
 * SECURITY:
 * - Validates Indian mobile number format
 * - Prevents invalid numbers from reaching SMS API
 * - Sanitizes input (removes non-digits)
 */
function validatePhone(req, res, next) {
  let { mobile } = req.body;
  
  // Check if mobile number is provided
  if (!mobile) {
    return res.status(400).json({
      success: false,
      message: 'Mobile number is required'
    });
  }
  
  // Convert to string if number
  mobile = String(mobile);
  
  // Remove any non-digit characters (sanitization)
  mobile = mobile.replace(/\D/g, '');
  
  // Remove country code if provided (91 or +91)
  if (mobile.length === 12 && mobile.startsWith('91')) {
    mobile = mobile.substring(2);
  }
  
  // Validate length (10 digits for Indian mobile)
  if (mobile.length !== 10) {
    return res.status(400).json({
      success: false,
      message: 'Please enter a valid 10-digit mobile number'
    });
  }
  
  // Validate Indian mobile number pattern
  // Indian mobile numbers start with 6, 7, 8, or 9
  const indianMobilePattern = /^[6-9]\d{9}$/;
  
  if (!indianMobilePattern.test(mobile)) {
    return res.status(400).json({
      success: false,
      message: 'Please enter a valid Indian mobile number'
    });
  }
  
  // Store sanitized mobile number back to request
  req.body.mobile = mobile;
  
  next();
}

/**
 * Sanitize OTP Input
 * 
 * @param {string} otp - Raw OTP input
 * @returns {string} - Sanitized OTP (digits only)
 */
function sanitizeOTP(otp) {
  if (!otp) return '';
  return String(otp).replace(/\D/g, '').substring(0, 6);
}

module.exports = {
  rateLimiter,
  validatePhone,
  sanitizeOTP
};
