/**
 * ============================================
 * OTP SERVICE
 * ============================================
 * 
 * Handles OTP generation, storage, and verification
 * 
 * SECURITY FEATURES:
 * 1. Cryptographically secure random OTP generation
 * 2. OTP expiry (configurable, default 5 minutes)
 * 3. Single-use OTPs (deleted after verification)
 * 4. In-memory storage (use Redis in production)
 */

const crypto = require('crypto');

// In-memory OTP storage
// PRODUCTION NOTE: Use Redis or a database for scalability
// Format: { mobile: { otp: '123456', expiresAt: Date, attempts: 0 } }
const otpStore = new Map();

// Maximum verification attempts before OTP is invalidated
const MAX_ATTEMPTS = 3;

/**
 * Generate a secure 6-digit OTP
 * 
 * SECURITY: Uses crypto.randomInt for cryptographically secure randomness
 * (Better than Math.random which is not cryptographically secure)
 */
function generateOTP() {
  // Generate a random 6-digit number (100000-999999)
  const otp = crypto.randomInt(100000, 999999).toString();
  return otp;
}

/**
 * Store OTP with expiry time
 * 
 * @param {string} mobile - Mobile number
 * @param {string} otp - Generated OTP
 */
function storeOTP(mobile, otp) {
  const expiryMinutes = parseInt(process.env.OTP_EXPIRY_MINUTES) || 5;
  const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);
  
  otpStore.set(mobile, {
    otp: otp,
    expiresAt: expiresAt,
    attempts: 0,
    createdAt: new Date()
  });
  
  console.log(`📱 OTP stored for ${mobile}, expires at ${expiresAt.toISOString()}`);
  
  // Auto-cleanup after expiry
  setTimeout(() => {
    if (otpStore.has(mobile)) {
      const stored = otpStore.get(mobile);
      if (stored.otp === otp) {
        otpStore.delete(mobile);
        console.log(`🗑️ OTP expired and cleaned up for ${mobile}`);
      }
    }
  }, expiryMinutes * 60 * 1000);
}

/**
 * Verify OTP
 * 
 * SECURITY:
 * - Checks expiry
 * - Limits verification attempts
 * - Deletes OTP after successful verification (single use)
 * 
 * @param {string} mobile - Mobile number
 * @param {string} inputOtp - OTP entered by user
 * @returns {object} - { valid: boolean, reason: string }
 */
function verifyOTP(mobile, inputOtp) {
  const stored = otpStore.get(mobile);
  
  // Check if OTP exists
  if (!stored) {
    return { 
      valid: false, 
      reason: 'OTP not found or expired. Please request a new OTP.' 
    };
  }
  
  // Check if OTP is expired
  if (new Date() > stored.expiresAt) {
    otpStore.delete(mobile);
    return { 
      valid: false, 
      reason: 'OTP has expired. Please request a new OTP.' 
    };
  }
  
  // Check attempt limit
  if (stored.attempts >= MAX_ATTEMPTS) {
    otpStore.delete(mobile);
    return { 
      valid: false, 
      reason: 'Too many incorrect attempts. Please request a new OTP.' 
    };
  }
  
  // Verify OTP
  if (stored.otp === inputOtp) {
    // SECURITY: Delete OTP after successful verification (single use)
    otpStore.delete(mobile);
    return { valid: true, reason: 'OTP verified successfully' };
  } else {
    // Increment attempt counter
    stored.attempts += 1;
    otpStore.set(mobile, stored);
    
    const remainingAttempts = MAX_ATTEMPTS - stored.attempts;
    return { 
      valid: false, 
      reason: `Invalid OTP. ${remainingAttempts} attempts remaining.` 
    };
  }
}

/**
 * Invalidate existing OTP for a mobile number
 * 
 * @param {string} mobile - Mobile number
 */
function invalidateOTP(mobile) {
  if (otpStore.has(mobile)) {
    otpStore.delete(mobile);
    console.log(`🗑️ OTP invalidated for ${mobile}`);
  }
}

/**
 * Check if OTP exists and is valid (not expired)
 * 
 * @param {string} mobile - Mobile number
 * @returns {boolean}
 */
function hasValidOTP(mobile) {
  const stored = otpStore.get(mobile);
  if (!stored) return false;
  return new Date() <= stored.expiresAt;
}

module.exports = {
  generateOTP,
  storeOTP,
  verifyOTP,
  invalidateOTP,
  hasValidOTP
};
