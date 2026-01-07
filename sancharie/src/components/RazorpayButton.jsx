/**
 * ============================================
 * RAZORPAY PAYMENT BUTTON COMPONENT
 * ============================================
 * 
 * A reusable, secure Razorpay payment button component.
 * 
 * SECURITY:
 * - No secret keys in this component
 * - All payment processing via backend
 * - Handles complete payment flow securely
 * 
 * USAGE:
 * <RazorpayButton
 *   amount={500}
 *   customerInfo={{ name: "John", email: "john@example.com", phone: "9999999999" }}
 *   bookingDetails={{ description: "Bus Ticket" }}
 *   onSuccess={(result) => console.log("Success", result)}
 *   onFailure={(error) => console.log("Failed", error)}
 * />
 */

import React, { useState, useEffect } from 'react';
import { loadRazorpayScript, initiatePayment } from '../services/paymentApi';
import { BsShieldLock } from 'react-icons/bs';
import './RazorpayButton.css';

const RazorpayButton = ({
  amount,
  currency = 'INR',
  customerInfo = {},
  bookingDetails = {},
  onSuccess,
  onFailure,
  onDismiss,
  disabled = false,
  buttonText = 'Pay Now',
  className = '',
  showSecureBadge = true,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isScriptLoaded, setIsScriptLoaded] = useState(false);
  const [error, setError] = useState(null);

  // Load Razorpay script on mount
  useEffect(() => {
    loadRazorpayScript()
      .then((loaded) => {
        setIsScriptLoaded(loaded);
        if (!loaded) {
          setError('Failed to load payment gateway. Please refresh the page.');
        }
      })
      .catch(() => {
        setError('Failed to initialize payment. Please try again.');
      });
  }, []);

  const handlePayment = async () => {
    if (!amount || amount <= 0) {
      setError('Invalid payment amount');
      return;
    }

    if (!isScriptLoaded) {
      setError('Payment gateway not loaded. Please refresh.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await initiatePayment({
        amount,
        customerInfo,
        bookingDetails: {
          ...bookingDetails,
          currency,
        },
        onPaymentStart: () => {
          console.log('Razorpay checkout opening...');
        },
        onPaymentSuccess: (verification) => {
          setIsLoading(false);
          if (onSuccess) {
            onSuccess(verification);
          }
        },
        onPaymentFailure: (err) => {
          setIsLoading(false);
          setError(err.description || 'Payment failed');
          if (onFailure) {
            onFailure(err);
          }
        },
        onPaymentDismiss: () => {
          setIsLoading(false);
          if (onDismiss) {
            onDismiss();
          }
        },
      });

      return result;
    } catch (err) {
      setIsLoading(false);
      
      // Don't show error for user cancellation
      if (err.message !== 'Payment cancelled by user') {
        setError(err.message || 'Payment failed. Please try again.');
        if (onFailure) {
          onFailure(err);
        }
      } else if (onDismiss) {
        onDismiss();
      }
    }
  };

  return (
    <div className={`razorpay-button-wrapper ${className}`}>
      <button
        type="button"
        className={`razorpay-pay-button ${isLoading ? 'loading' : ''}`}
        onClick={handlePayment}
        disabled={disabled || isLoading || !isScriptLoaded}
      >
        {isLoading ? (
          <>
            <span className="razorpay-spinner"></span>
            Processing...
          </>
        ) : (
          <>
            {buttonText}
            {amount && (
              <span className="razorpay-amount">
                ₹{amount.toLocaleString('en-IN')}
              </span>
            )}
          </>
        )}
      </button>

      {showSecureBadge && (
        <div className="razorpay-secure-badge">
          <BsShieldLock />
          <span>Secured by Razorpay</span>
        </div>
      )}

      {error && (
        <div className="razorpay-error">
          {error}
        </div>
      )}
    </div>
  );
};

export default RazorpayButton;
