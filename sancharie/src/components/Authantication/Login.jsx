import React, { useState, useRef, useEffect } from "react";
import "./Login.css";
import { IoClose } from "react-icons/io5";
import { FaPhone, FaMobileAlt } from "react-icons/fa";
import { FcGoogle } from "react-icons/fc";
import Logo from "../../assets/logosancharie.svg";
// Import our secure API service
// SECURITY: This service calls our backend ONLY, never the SMS provider directly
import { sendOTP, verifyOTP, resendOTP } from "../../services/authApi";

export default function AuthModal({ isOpen, onClose, onLoginSuccess }) {
  const [step, setStep] = useState("phone"); // "phone" or "otp"
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [timer, setTimer] = useState(30);
  const [canResend, setCanResend] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  
  const otpRefs = useRef([]);

  // Timer for OTP resend
  useEffect(() => {
    let interval;
    if (step === "otp" && timer > 0) {
      interval = setInterval(() => {
        setTimer((prev) => prev - 1);
      }, 1000);
    } else if (timer === 0) {
      setCanResend(true);
    }
    return () => clearInterval(interval);
  }, [step, timer]);

  // Reset when modal closes
  useEffect(() => {
    if (!isOpen) {
      setStep("phone");
      setPhoneNumber("");
      setOtp(["", "", "", "", "", ""]);
      setTimer(30);
      setCanResend(false);
      setError("");
      setSuccessMessage("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handlePhoneChange = (e) => {
    const value = e.target.value.replace(/\D/g, "");
    if (value.length <= 10) {
      setPhoneNumber(value);
      setError("");
    }
  };

  const handleSendOtp = async () => {
    if (!phoneNumber) {
      setError("Please enter your mobile number");
      return;
    }
    if (phoneNumber.length !== 10) {
      setError("Please enter a valid 10-digit mobile number");
      return;
    }

    setIsLoading(true);
    setError("");
    
    // SECURITY: Call our backend API, NOT the SMS provider directly
    // The backend handles all SMS API credentials securely
    const result = await sendOTP(phoneNumber);
    
    setIsLoading(false);
    
    if (result.success) {
      setStep("otp");
      setTimer(30);
      setCanResend(false);
      setSuccessMessage(result.message);
    } else {
      // Handle rate limiting
      if (result.retryAfter) {
        setError(`${result.message}`);
      } else {
        setError(result.message);
      }
    }
  };

  const handleOtpChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    setError("");

    // Auto focus next input
    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    // Handle backspace
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pastedData) {
      const newOtp = [...otp];
      pastedData.split("").forEach((char, i) => {
        if (i < 6) newOtp[i] = char;
      });
      setOtp(newOtp);
      // Focus last filled input or last input
      const lastIndex = Math.min(pastedData.length, 5);
      otpRefs.current[lastIndex]?.focus();
    }
  };

  const handleVerifyOtp = async () => {
    const otpValue = otp.join("");
    if (otpValue.length !== 6) {
      setError("Please enter the complete 6-digit OTP");
      return;
    }

    setIsLoading(true);
    setError("");
    
    // SECURITY: OTP verification happens on the backend
    // Backend validates, expires, and deletes used OTPs
    const result = await verifyOTP(phoneNumber, otpValue);
    
    if (result.success) {
      // Login successful!
      setSuccessMessage("Login successful!");
      
      // Call the success callback with phone number
      // The parent component will handle the completeLogin via AuthContext
      // Wait for it to complete before closing
      if (onLoginSuccess) {
        await onLoginSuccess(phoneNumber);
      }
      
      setIsLoading(false);
      
      // Close modal after a short delay
      setTimeout(() => {
        onClose();
      }, 500);
    } else {
      setIsLoading(false);
      setError(result.message);
    }
  };

  const handleResendOtp = async () => {
    if (!canResend) return;
    
    setIsLoading(true);
    setError("");
    setOtp(["", "", "", "", "", ""]);
    
    // SECURITY: Resend OTP through our backend
    const result = await resendOTP(phoneNumber);
    
    setIsLoading(false);
    
    if (result.success) {
      setTimer(30);
      setCanResend(false);
      setSuccessMessage("OTP resent successfully!");
    } else {
      if (result.retryAfter) {
        setError(`${result.message}`);
      } else {
        setError(result.message);
      }
    }
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleBack = () => {
    setStep("phone");
    setOtp(["", "", "", "", "", ""]);
    setError("");
  };

  return (
    <div className="auth-modal-overlay" onClick={handleOverlayClick}>
      <div className="auth-modal">
        {/* Close Button */}
        <button className="auth-close-btn" onClick={onClose}>
          <IoClose />
        </button>

        {/* Modal Header */}
        <div className="auth-header">
          <div className="auth-logo">
            <img src={Logo} alt="Sancharie" className="auth-logo-img" />
          </div>
          <p className="auth-subtitle">
            {step === "phone" 
              ? "Login or create account with your mobile number" 
              : `Enter OTP sent to +91 ${phoneNumber}`}
          </p>
        </div>

        {/* Phone Number Step */}
        {step === "phone" && (
          <div className="auth-form">
            <div className="phone-illustration">
              <FaMobileAlt />
            </div>

            <div className={`form-group ${error ? 'error' : ''}`}>
              <label>Mobile Number</label>
              <div className="phone-input-wrapper">
                <span className="country-code">+91</span>
                <input
                  type="tel"
                  placeholder="Enter 10-digit mobile number"
                  value={phoneNumber}
                  onChange={handlePhoneChange}
                  maxLength={10}
                  autoFocus
                />
              </div>
              {error && <span className="error-text">{error}</span>}
            </div>

            <button 
              className={`auth-submit-btn ${isLoading ? 'loading' : ''}`} 
              onClick={handleSendOtp}
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="btn-loader"></span>
              ) : (
                "Get OTP"
              )}
            </button>

            <p className="auth-terms">
              By continuing, you agree to our <a href="/privacy-policy">Terms of Service</a> and <a href="/privacy-policy">Privacy Policy</a>
            </p>

            <div className="auth-divider">
              <span>OR</span>
            </div>

            <button className="google-sign-in-btn" onClick={() => alert('Google Sign In clicked!')}>
              <FcGoogle />
              <span>Continue with Google</span>
            </button>
          </div>
        )}

        {/* OTP Step */}
        {step === "otp" && (
          <div className="auth-form otp-form">
            <button className="back-btn" onClick={handleBack}>
              ← Change Number
            </button>

            <div className="otp-illustration">
              <div className="otp-icon">🔐</div>
            </div>

            <div className={`form-group ${error ? 'error' : ''}`}>
              <label>Enter 6-digit OTP</label>
              <div className="otp-inputs" onPaste={handleOtpPaste}>
                {otp.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => (otpRefs.current[index] = el)}
                    type="text"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(index, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(index, e)}
                    autoFocus={index === 0}
                  />
                ))}
              </div>
              {error && <span className="error-text">{error}</span>}
              {successMessage && <span className="success-text">{successMessage}</span>}
            </div>

            <div className="otp-timer">
              {canResend ? (
                <button className="resend-btn" onClick={handleResendOtp}>
                  Resend OTP
                </button>
              ) : (
                <span>Resend OTP in <strong>{timer}s</strong></span>
              )}
            </div>

            <button 
              className={`auth-submit-btn ${isLoading ? 'loading' : ''}`} 
              onClick={handleVerifyOtp}
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="btn-loader"></span>
              ) : (
                "Verify & Login"
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

