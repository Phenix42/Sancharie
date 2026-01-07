/**
 * ============================================
 * RAZORPAY PAYMENT API SERVICE
 * ============================================
 * 
 * SECURITY ARCHITECTURE:
 * - This file contains NO SECRET KEYS
 * - All payment processing happens via backend
 * - Frontend only handles:
 *   1. Loading Razorpay checkout script
 *   2. Opening payment modal
 *   3. Sending payment response to backend for verification
 * 
 * FLOW:
 * 1. Call createPaymentOrder() → Backend creates Razorpay order
 * 2. Call openRazorpayCheckout() → User pays on Razorpay
 * 3. Call verifyPayment() → Backend verifies signature
 * 
 * NEVER store or use Razorpay secret key in frontend code!
 */

// Backend API URL from environment variable
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// Razorpay public key from environment variable
// SECURITY: This is the PUBLIC key only - safe to use in frontend
const RAZORPAY_KEY_ID = import.meta.env.VITE_RAZORPAY_KEY_ID;

/**
 * Load Razorpay checkout script dynamically
 * 
 * SECURITY: Script loaded from official Razorpay CDN
 * 
 * @returns {Promise<boolean>} Whether script loaded successfully
 */
export const loadRazorpayScript = () => {
  return new Promise((resolve) => {
    // Check if already loaded
    if (window.Razorpay) {
      resolve(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => {
      console.error('Failed to load Razorpay script');
      resolve(false);
    };
    document.body.appendChild(script);
  });
};

/**
 * Get Razorpay configuration from backend
 * 
 * SECURITY:
 * - Backend only sends public key
 * - Secret key is never sent to frontend
 * 
 * @returns {Promise<object>} Razorpay public configuration
 */
export const getRazorpayConfig = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/payment/config`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.message || 'Failed to get payment configuration');
    }

    return data.data;
  } catch (error) {
    console.error('Error fetching Razorpay config:', error.message);
    throw error;
  }
};

/**
 * Create a payment order via backend
 * 
 * SECURITY:
 * - Backend creates order using secret key
 * - Frontend only receives order_id (safe to expose)
 * - Amount is validated on backend
 * 
 * @param {number} amount - Amount in INR
 * @param {object} bookingDetails - Booking information
 * @returns {Promise<object>} Order details with order_id
 */
export const createPaymentOrder = async (amount, bookingDetails = {}) => {
  try {
    const response = await fetch(`${API_BASE_URL}/payment/create-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount,
        currency: 'INR',
        notes: {
          source: 'web_booking',
        },
        bookingDetails,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.message || 'Failed to create payment order');
    }

    return data.data;
  } catch (error) {
    console.error('Error creating payment order:', error.message);
    throw error;
  }
};

/**
 * Verify payment signature via backend
 * 
 * CRITICAL SECURITY:
 * - Signature verification MUST happen on backend
 * - Backend uses secret key for HMAC verification
 * - Never trust frontend payment status alone
 * 
 * @param {object} paymentResponse - Response from Razorpay checkout
 * @param {object} bookingData - Additional booking data to save
 * @returns {Promise<object>} Verification result
 */
export const verifyPayment = async (paymentResponse, bookingData = {}) => {
  try {
    const response = await fetch(`${API_BASE_URL}/payment/verify-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        razorpay_order_id: paymentResponse.razorpay_order_id,
        razorpay_payment_id: paymentResponse.razorpay_payment_id,
        razorpay_signature: paymentResponse.razorpay_signature,
        bookingData,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.message || 'Payment verification failed');
    }

    return data;
  } catch (error) {
    console.error('Error verifying payment:', error.message);
    throw error;
  }
};

/**
 * Get order status from backend
 * 
 * @param {string} orderId - Razorpay order ID
 * @returns {Promise<object>} Order status
 */
export const getOrderStatus = async (orderId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/payment/order/${orderId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.message || 'Failed to get order status');
    }

    return data.data;
  } catch (error) {
    console.error('Error getting order status:', error.message);
    throw error;
  }
};

/**
 * Open Razorpay checkout modal
 * 
 * SECURITY:
 * - Uses public key only
 * - Order ID comes from backend
 * - Payment handled by Razorpay's secure checkout
 * 
 * @param {object} options - Checkout options
 * @param {string} options.orderId - Razorpay order ID from backend
 * @param {number} options.amount - Amount in paise
 * @param {string} options.currency - Currency code
 * @param {object} options.customerInfo - Customer details
 * @param {object} options.bookingDetails - Booking information
 * @param {function} options.onSuccess - Success callback
 * @param {function} options.onFailure - Failure callback
 * @param {function} options.onDismiss - Modal dismiss callback
 * @returns {Promise<void>}
 */
export const openRazorpayCheckout = async (options) => {
  const {
    orderId,
    amount,
    currency = 'INR',
    customerInfo = {},
    bookingDetails = {},
    onSuccess,
    onFailure,
    onDismiss,
  } = options;

  // Load Razorpay script if not loaded
  const isLoaded = await loadRazorpayScript();
  if (!isLoaded) {
    throw new Error('Failed to load Razorpay. Please check your internet connection.');
  }

  // Get key from environment or config
  let keyId = RAZORPAY_KEY_ID;
  
  // If not in env, try to get from backend config
  if (!keyId) {
    try {
      const config = await getRazorpayConfig();
      keyId = config.key_id;
    } catch (error) {
      throw new Error('Payment configuration not available');
    }
  }

  if (!keyId) {
    throw new Error('Razorpay configuration error. Please contact support.');
  }

  // Razorpay checkout options
  const razorpayOptions = {
    key: keyId, // SECURITY: Public key only
    amount: amount, // Amount in paise
    currency: currency,
    name: 'Sancharie Travels',
    description: bookingDetails.description || 'Bus Ticket Booking',
    order_id: orderId, // Order ID from backend
    image: '/logo.png', // Your logo
    
    // Customer prefill (optional, improves UX)
    prefill: {
      name: customerInfo.name || '',
      email: customerInfo.email || '',
      contact: customerInfo.phone || '',
    },
    
    // Additional notes
    notes: {
      bus_name: bookingDetails.busName || '',
      travel_date: bookingDetails.travelDate || '',
      seats: bookingDetails.seats || '',
    },
    
    // Theme customization
    theme: {
      color: '#FF6B35', // Your brand color
    },
    
    // Payment handler - called on successful payment
    handler: function (response) {
      // SECURITY: Send response to backend for verification
      // Never trust this response alone - always verify server-side
      if (onSuccess) {
        onSuccess({
          razorpay_order_id: response.razorpay_order_id,
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_signature: response.razorpay_signature,
        });
      }
    },
    
    // Modal configuration
    modal: {
      ondismiss: function () {
        if (onDismiss) {
          onDismiss();
        }
      },
      escape: true,
      animation: true,
    },
  };

  // Open Razorpay checkout
  const razorpay = new window.Razorpay(razorpayOptions);
  
  // Handle payment failures
  razorpay.on('payment.failed', function (response) {
    console.error('Payment failed:', response.error.code);
    if (onFailure) {
      onFailure({
        code: response.error.code,
        description: response.error.description,
        source: response.error.source,
        step: response.error.step,
        reason: response.error.reason,
        order_id: response.error.metadata?.order_id,
        payment_id: response.error.metadata?.payment_id,
      });
    }
  });

  razorpay.open();
};

/**
 * Complete payment flow
 * 
 * Convenience function that handles the entire payment flow:
 * 1. Create order
 * 2. Open checkout
 * 3. Verify payment
 * 
 * @param {object} paymentData - Payment details
 * @returns {Promise<object>} Payment result
 */
export const initiatePayment = async (paymentData) => {
  const {
    amount,
    customerInfo,
    bookingDetails,
    onPaymentStart,
    onPaymentSuccess,
    onPaymentFailure,
    onPaymentDismiss,
  } = paymentData;

  try {
    // Step 1: Create order on backend
    if (onPaymentStart) onPaymentStart();
    
    const order = await createPaymentOrder(amount, bookingDetails);

    // Step 2: Open Razorpay checkout
    return new Promise((resolve, reject) => {
      openRazorpayCheckout({
        orderId: order.order_id,
        amount: order.amount, // Already in paise from backend
        currency: order.currency,
        customerInfo,
        bookingDetails,
        
        onSuccess: async (paymentResponse) => {
          try {
            // Step 3: Verify payment on backend
            const verification = await verifyPayment(paymentResponse, bookingDetails);
            
            if (verification.verified) {
              if (onPaymentSuccess) onPaymentSuccess(verification);
              resolve(verification);
            } else {
              const error = new Error('Payment verification failed');
              if (onPaymentFailure) onPaymentFailure(error);
              reject(error);
            }
          } catch (verifyError) {
            if (onPaymentFailure) onPaymentFailure(verifyError);
            reject(verifyError);
          }
        },
        
        onFailure: (error) => {
          if (onPaymentFailure) onPaymentFailure(error);
          reject(new Error(error.description || 'Payment failed'));
        },
        
        onDismiss: () => {
          if (onPaymentDismiss) onPaymentDismiss();
          reject(new Error('Payment cancelled by user'));
        },
      });
    });
  } catch (error) {
    if (onPaymentFailure) onPaymentFailure(error);
    throw error;
  }
};

export default {
  loadRazorpayScript,
  getRazorpayConfig,
  createPaymentOrder,
  verifyPayment,
  getOrderStatus,
  openRazorpayCheckout,
  initiatePayment,
};
