/**
 * ============================================
 * AUTHENTICATION API SERVICE
 * ============================================
 * 
 * SECURITY:
 * - This file contains NO API keys or secrets
 * - All SMS logic is handled by the backend
 * - Frontend only communicates with our backend API
 * - Never calls MetaReach or any SMS provider directly
 * 
 * FLOW:
 * React Component → This Service → Backend API → MetaReach SMS
 */

// Backend API base URL
// In production, this should be your deployed backend URL
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/**
 * Send OTP to mobile number
 * 
 * SECURITY NOTE:
 * - We ONLY send the mobile number to our backend
 * - Our backend handles all SMS API credentials
 * - No secrets are exposed in this frontend code
 * 
 * @param {string} mobile - 10-digit mobile number
 * @returns {Promise<object>} - { success, message, expiresIn? }
 */
export async function sendOTP(mobile) {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/send-otp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ mobile }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: data.message || 'Failed to send OTP',
        retryAfter: data.retryAfter || null
      };
    }

    return {
      success: true,
      message: data.message || 'OTP sent successfully',
      expiresIn: data.expiresIn || 5
    };
  } catch (error) {
    console.error('Send OTP Error:', error);
    return {
      success: false,
      message: 'Network error. Please check your connection and try again.'
    };
  }
}

/**
 * Verify OTP entered by user
 * 
 * SECURITY NOTE:
 * - OTP verification happens on the backend
 * - Backend validates, expires, and deletes used OTPs
 * - Frontend only displays success/failure to user
 * 
 * @param {string} mobile - 10-digit mobile number
 * @param {string} otp - 6-digit OTP entered by user
 * @returns {Promise<object>} - { success, message, user? }
 */
export async function verifyOTP(mobile, otp) {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/verify-otp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ mobile, otp }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: data.message || 'Invalid OTP'
      };
    }

    return {
      success: true,
      message: data.message || 'OTP verified successfully',
      user: data.user || null
    };
  } catch (error) {
    console.error('Verify OTP Error:', error);
    return {
      success: false,
      message: 'Network error. Please check your connection and try again.'
    };
  }
}

/**
 * Resend OTP to mobile number
 * 
 * @param {string} mobile - 10-digit mobile number
 * @returns {Promise<object>} - { success, message, expiresIn? }
 */
export async function resendOTP(mobile) {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/resend-otp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ mobile }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: data.message || 'Failed to resend OTP',
        retryAfter: data.retryAfter || null
      };
    }

    return {
      success: true,
      message: data.message || 'OTP resent successfully',
      expiresIn: data.expiresIn || 5
    };
  } catch (error) {
    console.error('Resend OTP Error:', error);
    return {
      success: false,
      message: 'Network error. Please check your connection and try again.'
    };
  }
}

/**
 * Health check for backend API
 * 
 * @returns {Promise<boolean>} - true if backend is reachable
 */
export async function checkApiHealth() {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    return response.ok;
  } catch {
    return false;
  }
}
