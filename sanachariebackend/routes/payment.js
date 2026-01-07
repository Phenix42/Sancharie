/**
 * ============================================
 * RAZORPAY PAYMENT ROUTES
 * ============================================
 * 
 * SECURITY ARCHITECTURE:
 * - All payment operations happen server-side
 * - Secret key never exposed to frontend
 * - Signature verification prevents fraud
 * - Input validation on all endpoints
 * 
 * ENDPOINTS:
 * POST /payment/create-order - Create Razorpay order
 * POST /payment/verify-payment - Verify payment signature
 * GET  /payment/config - Get public configuration
 * GET  /payment/order/:orderId - Get order status
 */

const express = require('express');
const router = express.Router();
const paymentService = require('../services/paymentService');

// ============================================
// INPUT VALIDATION MIDDLEWARE
// ============================================

/**
 * Validate create order request
 */
const validateCreateOrder = (req, res, next) => {
  const { amount, currency, receipt, notes, bookingDetails } = req.body;

  console.log('Create order request:', { amount, currency, bookingDetails });

  // Amount is required and must be positive number (not NaN, not undefined)
  if (amount === undefined || amount === null || typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
    return res.status(400).json({
      success: false,
      message: `Valid amount is required (must be positive number). Received: ${amount} (type: ${typeof amount})`,
    });
  }

  // Maximum amount check (Razorpay limit: 50,00,000 INR)
  if (amount > 5000000) {
    return res.status(400).json({
      success: false,
      message: 'Amount exceeds maximum limit',
    });
  }

  // Currency validation (if provided)
  if (currency && typeof currency !== 'string') {
    return res.status(400).json({
      success: false,
      message: 'Invalid currency format',
    });
  }

  next();
};

/**
 * Validate verify payment request
 */
const validateVerifyPayment = (req, res, next) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({
      success: false,
      message: 'Missing required payment verification parameters',
    });
  }

  // Validate format of Razorpay IDs
  if (!razorpay_order_id.startsWith('order_') || !razorpay_payment_id.startsWith('pay_')) {
    return res.status(400).json({
      success: false,
      message: 'Invalid Razorpay ID format',
    });
  }

  next();
};

// ============================================
// ROUTES
// ============================================

/**
 * GET /payment/config
 * 
 * Returns public Razorpay configuration for frontend
 * 
 * SECURITY:
 * - Only returns the public key ID (safe to expose)
 * - Never returns the secret key
 * - Frontend needs this to initialize Razorpay checkout
 */
router.get('/config', (req, res) => {
  try {
    // Check if Razorpay is configured
    if (!paymentService.isConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'Payment service not configured',
      });
    }

    // SECURITY: Only send public key, NEVER the secret
    res.json({
      success: true,
      data: {
        key_id: paymentService.getPublicKeyId(),
        currency: 'INR',
        name: process.env.RAZORPAY_MERCHANT_NAME || 'Sancharie Travels',
        description: 'Bus Booking Payment',
        // SECURITY: No sensitive data in response
      },
    });
  } catch (error) {
    console.error('Error getting payment config:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to get payment configuration',
    });
  }
});

/**
 * POST /payment/create-order
 * 
 * Creates a new Razorpay order
 * 
 * Request Body:
 * - amount: number (required) - Amount in INR
 * - currency: string (optional) - Default: INR
 * - receipt: string (optional) - Your receipt ID
 * - notes: object (optional) - Additional notes
 * - bookingDetails: object (optional) - Booking information
 * 
 * SECURITY:
 * - Order created using secret key (server-side only)
 * - Only order_id returned to frontend
 * - Amount validated server-side
 */
router.post('/create-order', validateCreateOrder, async (req, res) => {
  try {
    const { amount, currency, receipt, notes, bookingDetails } = req.body;

    // Check if Razorpay is configured
    if (!paymentService.isConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'Payment service not configured',
      });
    }

    // Prepare notes with booking details
    const orderNotes = {
      ...notes,
      booking_source: 'sancharie_web',
    };

    // Add booking details to notes if provided
    if (bookingDetails) {
      orderNotes.bus_name = bookingDetails.busName || '';
      orderNotes.travel_date = bookingDetails.travelDate || '';
      orderNotes.seats = Array.isArray(bookingDetails.seats) 
        ? bookingDetails.seats.join(', ') 
        : bookingDetails.seats || '';
      orderNotes.passenger_count = bookingDetails.passengerCount || '';
    }

    // Create Razorpay order
    const order = await paymentService.createOrder(
      amount,
      currency || 'INR',
      receipt,
      orderNotes
    );

    // SECURITY: Only return safe data to frontend
    res.json({
      success: true,
      data: {
        order_id: order.id,
        amount: order.amount, // in paise
        amount_inr: order.amount / 100, // in INR for display
        currency: order.currency,
        receipt: order.receipt,
        // SECURITY: Don't return internal details
      },
    });
  } catch (error) {
    console.error('Error creating order:', error.message);
    
    // SECURITY: Don't expose internal error details
    res.status(500).json({
      success: false,
      message: 'Failed to create payment order. Please try again.',
    });
  }
});

/**
 * POST /payment/verify-payment
 * 
 * Verifies Razorpay payment signature
 * 
 * Request Body:
 * - razorpay_order_id: string (required)
 * - razorpay_payment_id: string (required)
 * - razorpay_signature: string (required)
 * - bookingData: object (optional) - For finalizing booking
 * 
 * CRITICAL SECURITY:
 * - Signature verification is MANDATORY
 * - Uses HMAC SHA256 with secret key
 * - Prevents payment fraud/tampering
 * - Never trust frontend payment status alone
 */
router.post('/verify-payment', validateVerifyPayment, async (req, res) => {
  try {
    const { 
      razorpay_order_id, 
      razorpay_payment_id, 
      razorpay_signature,
      bookingData 
    } = req.body;

    // SECURITY: Verify signature using secret key (server-side only)
    const isValidSignature = paymentService.verifyPaymentSignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    );

    if (!isValidSignature) {
      // SECURITY: Log failed verification attempt
      console.warn('Payment signature verification failed:', {
        order_id: razorpay_order_id,
        payment_id: razorpay_payment_id,
        timestamp: new Date().toISOString(),
      });

      return res.status(400).json({
        success: false,
        message: 'Payment verification failed. Invalid signature.',
        verified: false,
      });
    }

    // Fetch payment details for confirmation
    let paymentDetails = null;
    try {
      paymentDetails = await paymentService.fetchPaymentDetails(razorpay_payment_id);
    } catch (fetchError) {
      console.warn('Could not fetch payment details:', fetchError.message);
      // Continue even if fetch fails - signature is already verified
    }

    // Here you would typically:
    // 1. Update your database with payment status
    // 2. Confirm the booking
    // 3. Send confirmation email/SMS
    // 4. Generate ticket/invoice

    console.log('Payment verified successfully:', {
      order_id: razorpay_order_id,
      payment_id: razorpay_payment_id,
      status: paymentDetails?.status || 'verified',
    });

    res.json({
      success: true,
      message: 'Payment verified successfully',
      verified: true,
      data: {
        order_id: razorpay_order_id,
        payment_id: razorpay_payment_id,
        status: paymentDetails?.status || 'captured',
        method: paymentDetails?.method || null,
        // Include booking confirmation details
        booking_confirmed: true,
      },
    });
  } catch (error) {
    console.error('Error verifying payment:', error.message);
    
    res.status(500).json({
      success: false,
      message: 'Payment verification failed. Please contact support.',
      verified: false,
    });
  }
});

/**
 * GET /payment/order/:orderId
 * 
 * Get order status from Razorpay
 * 
 * Useful for:
 * - Checking if order is still valid
 * - Getting payment status
 * - Handling payment recovery
 */
router.get('/order/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;

    // Validate order ID format
    if (!orderId || !orderId.startsWith('order_')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid order ID format',
      });
    }

    const orderDetails = await paymentService.fetchOrderDetails(orderId);

    res.json({
      success: true,
      data: orderDetails,
    });
  } catch (error) {
    console.error('Error fetching order:', error.message);
    
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order details',
    });
  }
});

/**
 * POST /payment/refund
 * 
 * Initiate refund for a payment
 * 
 * NOTE: Implement this based on your refund policy
 * This is a placeholder for future implementation
 */
router.post('/refund', async (req, res) => {
  // TODO: Implement refund logic
  res.status(501).json({
    success: false,
    message: 'Refund functionality not yet implemented',
  });
});

module.exports = router;
