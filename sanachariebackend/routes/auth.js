/**
 * ============================================
 * OTP AUTHENTICATION ROUTES
 * ============================================
 * 
 * SECURITY FEATURES:
 * 1. Rate limiting - Prevents brute force attacks
 * 2. OTP expiry - Prevents replay attacks
 * 3. Single use OTP - Prevents reuse
 * 4. Phone validation - Prevents invalid requests
 * 5. All SMS credentials on backend only
 */

const express = require('express');
const router = express.Router();
const otpService = require('../services/otpService');
const smsService = require('../services/smsService');
const { validatePhone, rateLimiter } = require('../middleware/validation');

/**
 * POST /auth/send-otp
 * 
 * Generates and sends OTP to the provided mobile number
 * 
 * SECURITY:
 * - Rate limited to prevent abuse
 * - Phone number validated
 * - OTP generated on server (not frontend)
 * - SMS sent via backend (credentials never exposed)
 */
router.post('/send-otp', rateLimiter, validatePhone, async (req, res) => {
  try {
    const { mobile } = req.body;
    
    // Generate a secure 6-digit OTP
    const otp = otpService.generateOTP();
    
    // Store OTP with expiry (in-memory for now, use Redis in production)
    otpService.storeOTP(mobile, otp);
    
    // Send OTP via MetaReach SMS API
    // SECURITY: API key is read from process.env, NEVER from frontend
    const smsResult = await smsService.sendOTP(mobile, otp);
    
    if (smsResult.success) {
      console.log(`✅ OTP sent successfully to +91${mobile}`);
      res.json({
        success: true,
        message: 'OTP sent successfully',
        // SECURITY: Never send the actual OTP in response
        // Only send metadata
        expiresIn: parseInt(process.env.OTP_EXPIRY_MINUTES) || 5
      });
    } else {
      console.error(`❌ Failed to send OTP: ${smsResult.error}`);
      res.status(500).json({
        success: false,
        message: 'Failed to send OTP. Please try again.'
      });
    }
  } catch (error) {
    console.error('Send OTP Error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred. Please try again.'
    });
  }
});

/**
 * POST /auth/verify-otp
 * 
 * Verifies the OTP entered by the user
 * 
 * SECURITY:
 * - OTP validated on server
 * - OTP deleted after successful verification (single use)
 * - Expired OTPs rejected
 */
router.post('/verify-otp', validatePhone, async (req, res) => {
  try {
    const { mobile, otp } = req.body;
    
    // Validate OTP format
    if (!otp || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid 6-digit OTP'
      });
    }
    
    // Verify OTP
    const verification = otpService.verifyOTP(mobile, otp);
    
    if (verification.valid) {
      console.log(`✅ OTP verified successfully for +91${mobile}`);
      
      // TODO: Generate JWT token or session for authenticated user
      // For now, we return success
      res.json({
        success: true,
        message: 'OTP verified successfully',
        // In production, return a JWT token here
        user: {
          mobile: mobile,
          isAuthenticated: true
        }
      });
    } else {
      console.log(`❌ OTP verification failed for +91${mobile}: ${verification.reason}`);
      res.status(400).json({
        success: false,
        message: verification.reason
      });
    }
  } catch (error) {
    console.error('Verify OTP Error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred. Please try again.'
    });
  }
});

/**
 * POST /auth/resend-otp
 * 
 * Resends OTP to the mobile number
 * Uses the same logic as send-otp with rate limiting
 */
router.post('/resend-otp', rateLimiter, validatePhone, async (req, res) => {
  try {
    const { mobile } = req.body;
    
    // Invalidate any existing OTP
    otpService.invalidateOTP(mobile);
    
    // Generate new OTP
    const otp = otpService.generateOTP();
    otpService.storeOTP(mobile, otp);
    
    // Send via SMS
    const smsResult = await smsService.sendOTP(mobile, otp);
    
    if (smsResult.success) {
      res.json({
        success: true,
        message: 'OTP resent successfully',
        expiresIn: parseInt(process.env.OTP_EXPIRY_MINUTES) || 5
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to resend OTP. Please try again.'
      });
    }
  } catch (error) {
    console.error('Resend OTP Error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred. Please try again.'
    });
  }
});

module.exports = router;
