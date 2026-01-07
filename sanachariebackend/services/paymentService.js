/**
 * ============================================
 * RAZORPAY PAYMENT SERVICE
 * ============================================
 * 
 * SECURITY ARCHITECTURE:
 * - Razorpay Secret Key is ONLY used in this backend file
 * - Secret key is loaded from environment variables
 * - Frontend NEVER receives the secret key
 * - All payment verification happens server-side
 * - Signatures are verified using HMAC SHA256
 * 
 * FLOW:
 * 1. Frontend calls /create-order → This service creates Razorpay order
 * 2. Frontend opens Razorpay checkout with order_id
 * 3. User completes payment on Razorpay
 * 4. Frontend calls /verify-payment with payment details
 * 5. This service verifies signature server-side
 */

const Razorpay = require('razorpay');
const crypto = require('crypto');

// ============================================
// SECURITY: Initialize Razorpay with env vars
// ============================================
// NEVER hardcode keys here - always use environment variables

let razorpayInstance = null;

/**
 * Get or create Razorpay instance
 * Lazy initialization to ensure env vars are loaded
 * 
 * @returns {Razorpay} Razorpay instance
 * @throws {Error} If credentials are not configured
 */
const getRazorpayInstance = () => {
  if (!razorpayInstance) {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    // SECURITY: Validate credentials exist before proceeding
    if (!keyId || !keySecret) {
      throw new Error('Razorpay credentials not configured. Check environment variables.');
    }

    razorpayInstance = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });
  }

  return razorpayInstance;
};

/**
 * Create a Razorpay order
 * 
 * SECURITY NOTES:
 * - Amount is validated and converted to paise server-side
 * - Order is created with Razorpay secret (never exposed to frontend)
 * - Only order_id is sent to frontend (safe to expose)
 * 
 * @param {number} amount - Amount in INR (will be converted to paise)
 * @param {string} currency - Currency code (default: INR)
 * @param {string} receipt - Unique receipt ID for your records
 * @param {object} notes - Additional notes for the order
 * @returns {Promise<object>} Razorpay order object
 */
const createOrder = async (amount, currency = 'INR', receipt = null, notes = {}) => {
  try {
    const razorpay = getRazorpayInstance();

    // SECURITY: Validate amount
    if (!amount || amount <= 0) {
      throw new Error('Invalid amount');
    }

    // Convert to paise (Razorpay requires amount in smallest currency unit)
    // 1 INR = 100 paise
    const amountInPaise = Math.round(amount * 100);

    // Generate receipt if not provided
    const orderReceipt = receipt || `rcpt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const options = {
      amount: amountInPaise,
      currency: currency,
      receipt: orderReceipt,
      notes: {
        ...notes,
        created_at: new Date().toISOString(),
      },
    };

    const order = await razorpay.orders.create(options);

    // SECURITY: Log only non-sensitive info for debugging
    console.log('Razorpay order created:', {
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      receipt: order.receipt,
    });

    return order;
  } catch (error) {
    // Razorpay errors come in different formats
    const errorMessage = error.error?.description || error.message || JSON.stringify(error);
    console.error('Error creating Razorpay order:', errorMessage);
    console.error('Full error:', error);
    throw new Error(errorMessage);
  }
};

/**
 * Verify Razorpay payment signature
 * 
 * CRITICAL SECURITY:
 * - This verification MUST happen on the server
 * - Uses HMAC SHA256 with secret key
 * - Prevents payment tampering/fraud
 * - Never trust frontend payment status alone
 * 
 * Signature Generation (by Razorpay):
 * signature = HMAC_SHA256(order_id + "|" + payment_id, secret)
 * 
 * @param {string} orderId - Razorpay order ID
 * @param {string} paymentId - Razorpay payment ID
 * @param {string} signature - Signature from Razorpay
 * @returns {boolean} Whether signature is valid
 */
const verifyPaymentSignature = (orderId, paymentId, signature) => {
  try {
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    // SECURITY: Ensure secret exists
    if (!keySecret) {
      throw new Error('Razorpay secret not configured');
    }

    // SECURITY: Validate all required parameters
    if (!orderId || !paymentId || !signature) {
      console.error('Missing required parameters for signature verification');
      return false;
    }

    // Generate expected signature using HMAC SHA256
    // Format: order_id|payment_id
    const body = orderId + '|' + paymentId;
    
    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(body)
      .digest('hex');

    // SECURITY: Use timing-safe comparison to prevent timing attacks
    const isValid = crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(signature)
    );

    if (isValid) {
      console.log('Payment signature verified successfully:', {
        order_id: orderId,
        payment_id: paymentId,
      });
    } else {
      console.warn('Payment signature verification failed:', {
        order_id: orderId,
        payment_id: paymentId,
      });
    }

    return isValid;
  } catch (error) {
    console.error('Error verifying payment signature:', error.message);
    return false;
  }
};

/**
 * Fetch payment details from Razorpay
 * 
 * Use this to get payment status, method, etc.
 * Only call after signature verification
 * 
 * @param {string} paymentId - Razorpay payment ID
 * @returns {Promise<object>} Payment details
 */
const fetchPaymentDetails = async (paymentId) => {
  try {
    const razorpay = getRazorpayInstance();
    const payment = await razorpay.payments.fetch(paymentId);
    
    // SECURITY: Return only necessary fields, not raw response
    return {
      id: payment.id,
      order_id: payment.order_id,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      method: payment.method,
      captured: payment.captured,
      created_at: payment.created_at,
    };
  } catch (error) {
    console.error('Error fetching payment details:', error.message);
    throw error;
  }
};

/**
 * Fetch order details from Razorpay
 * 
 * @param {string} orderId - Razorpay order ID
 * @returns {Promise<object>} Order details
 */
const fetchOrderDetails = async (orderId) => {
  try {
    const razorpay = getRazorpayInstance();
    const order = await razorpay.orders.fetch(orderId);
    
    return {
      id: order.id,
      amount: order.amount,
      currency: order.currency,
      status: order.status,
      receipt: order.receipt,
      created_at: order.created_at,
    };
  } catch (error) {
    console.error('Error fetching order details:', error.message);
    throw error;
  }
};

/**
 * Check if Razorpay is properly configured
 * 
 * @returns {boolean} Whether Razorpay is configured
 */
const isConfigured = () => {
  return !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
};

/**
 * Get public key for frontend
 * 
 * SECURITY: Only the KEY_ID (public key) is safe to send to frontend
 * The KEY_SECRET must NEVER be exposed
 * 
 * @returns {string} Razorpay public key ID
 */
const getPublicKeyId = () => {
  return process.env.RAZORPAY_KEY_ID;
};

module.exports = {
  createOrder,
  verifyPaymentSignature,
  fetchPaymentDetails,
  fetchOrderDetails,
  isConfigured,
  getPublicKeyId,
};
