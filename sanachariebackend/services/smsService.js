/**
 * ============================================
 * SMS SERVICE - MetaReach API Integration
 * ============================================
 * 
 * THIS IS THE ONLY PLACE WHERE SMS API IS CALLED
 * 
 * SECURITY:
 * - API key read from process.env (NEVER from frontend)
 * - All credentials stored in backend .env file
 * - Frontend cannot access these credentials
 * - Message content is URL encoded before sending
 */

const axios = require('axios');

/**
 * Send OTP via MetaReach SMS API
 * 
 * SECURITY NOTES:
 * 1. SMS_API_KEY is read from process.env - stored in .env file on server
 * 2. SMS_SENDER_ID is read from process.env - not exposed to frontend
 * 3. Frontend NEVER calls this API directly
 * 4. All requests go through backend validation first
 * 
 * @param {string} mobile - Mobile number (10 digits, without country code)
 * @param {string} otp - Generated OTP
 * @returns {object} - { success: boolean, error?: string }
 */
async function sendOTP(mobile, otp) {
  try {
    // SECURITY: Credentials from environment variables ONLY
    const apiKey = process.env.SMS_API_KEY;
    const senderId = process.env.SMS_SENDER_ID;
    const apiUrl = process.env.SMS_API_URL;
    
    // Validate that credentials are configured
    if (!apiKey || !senderId || !apiUrl) {
      console.error('❌ SECURITY ERROR: SMS credentials not configured in .env');
      console.error('Missing:', !apiKey ? 'SMS_API_KEY' : '', !senderId ? 'SMS_SENDER_ID' : '', !apiUrl ? 'SMS_API_URL' : '');
      return { 
        success: false, 
        error: 'SMS service not configured' 
      };
    }
    
    // DLT Entity ID and Template ID (Required by TRAI for Indian SMS)
    const entityId = process.env.SMS_ENTITY_ID;
    const templateId = process.env.SMS_TEMPLATE_ID;
    
    // Format phone number with country code
    const phoneNumber = `91${mobile}`;
    
    // Create OTP message - MUST match registered DLT template EXACTLY!
    // Template: "Welcome to Sancharie! Use {#var#} to complete your Sancharie account login. Never share your OTP with anyone for security reasons. - Team Sancharie"
    const message = `Welcome to Sancharie! Use ${otp} to complete your Sancharie account login. Never share your OTP with anyone for security reasons. - Team Sancharie`;
    
    console.log(`📤 Sending OTP to +${phoneNumber}...`);
    
    // MetaReach SMS API - Using GET request with query parameters
    const params = new URLSearchParams({
      apikey: apiKey,
      senderid: senderId,
      number: phoneNumber,
      message: message
    });
    
    // Add DLT parameters
    if (entityId) params.append('peid', entityId);
    if (templateId) params.append('templateid', templateId);
    
    const fullUrl = `${apiUrl}?${params.toString()}`;
    console.log('📡 Calling SMS API...');
    
    const response = await axios({
      method: 'GET',
      url: fullUrl,
      timeout: 30000,
      headers: {
        'Accept': 'application/json'
      }
    });
    
    console.log('📨 MetaReach API Response:', response.data);
    
    // Check response - MetaReach typically returns success in various formats
    if (response.status === 200) {
      const data = response.data;
      
      // Handle string response
      if (typeof data === 'string') {
        if (data.includes('success') || data.includes('submitted') || data.includes('sent')) {
          return { success: true };
        }
      }
      
      // Handle JSON response
      if (typeof data === 'object') {
        if (data.type === 'success' || data.status === 'success' || 
            data.message?.includes('success') || data.code === '001') {
          return { success: true };
        }
      }
      
      // If we got 200, assume success (many SMS APIs just return 200 on success)
      return { success: true };
    }
    
    return { success: false, error: 'Unexpected API response' };
    
  } catch (error) {
    console.error('❌ SMS Service Error:', error.message);
    
    // Handle specific error types
    if (error.code === 'ECONNREFUSED') {
      return { success: false, error: 'SMS service unavailable' };
    }
    
    if (error.code === 'ETIMEDOUT') {
      return { success: false, error: 'SMS service timeout' };
    }
    
    if (error.response) {
      // API returned an error response
      console.error('API Error Response:', error.response.data);
      return { 
        success: false, 
        error: error.response.data?.message || 'SMS API error' 
      };
    }
    
    return { success: false, error: 'Failed to send SMS' };
  }
}

/**
 * Alternative method using GET request (if required by MetaReach)
 * Some SMS APIs prefer GET with query parameters
 */
async function sendOTPViaGet(mobile, otp) {
  try {
    const apiKey = process.env.SMS_API_KEY;
    const senderId = process.env.SMS_SENDER_ID;
    const apiUrl = process.env.SMS_API_URL || 'https://api.metareach.com/sms/send';
    
    const phoneNumber = `91${mobile}`;
    const message = `Your Sancharie verification code is: ${otp}. Valid for ${process.env.OTP_EXPIRY_MINUTES || 5} minutes.`;
    
    // URL encode the message
    const encodedMessage = encodeURIComponent(message);
    
    // Build URL with query parameters
    const url = `${apiUrl}?apikey=${apiKey}&senderid=${senderId}&number=${phoneNumber}&message=${encodedMessage}`;
    
    const response = await axios.get(url, { timeout: 30000 });
    
    if (response.status === 200) {
      return { success: true };
    }
    
    return { success: false, error: 'SMS sending failed' };
    
  } catch (error) {
    console.error('SMS GET Error:', error.message);
    return { success: false, error: 'Failed to send SMS' };
  }
}

module.exports = {
  sendOTP,
  sendOTPViaGet
};
