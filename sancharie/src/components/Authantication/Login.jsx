import { useState, useRef, useEffect } from "react";
import "./Login.css";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  KeyRound,
  LockKeyhole,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  X,
} from "lucide-react";
import Logo from "../../assets/logosan.svg";
// Import our secure API service
// SECURITY: This service calls our backend ONLY, never the SMS provider directly
import { auth } from "../../services/api";

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

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (step === "otp") {
      window.setTimeout(() => otpRefs.current[0]?.focus(), 0);
    }
  }, [step]);

  if (!isOpen) return null;

  const handlePhoneChange = (e) => {
    const value = e.target.value.replace(/\D/g, "");
    if (value.length <= 10) {
      setPhoneNumber(value);
      setError("");
      setSuccessMessage("");
    }
  };

  const handleSendOtp = async (event) => {
    event?.preventDefault();

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
    setSuccessMessage("");
    
    try {
      const result = await auth.sendOTP(phoneNumber);

      if (result.success) {
        setStep("otp");
        setTimer(30);
        setCanResend(false);
        setSuccessMessage(result.message || "Verification code sent.");
      } else {
        setError(result.message || "Unable to send OTP. Please try again.");
      }
    } catch (requestError) {
      setError(requestError.message || "Unable to send OTP. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;
    const nextValue = value.slice(-1);

    const newOtp = [...otp];
    newOtp[index] = nextValue;
    setOtp(newOtp);
    setError("");
    setSuccessMessage("");

    // Auto focus next input
    if (nextValue && index < 5) {
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
      setError("");
      setSuccessMessage("");
      // Focus last filled input or last input
      const lastIndex = Math.min(pastedData.length, 5);
      otpRefs.current[lastIndex]?.focus();
    }
  };

  const handleVerifyOtp = async (event) => {
    event?.preventDefault();

    const otpValue = otp.join("");
    if (otpValue.length !== 6) {
      setError("Please enter the complete 6-digit OTP");
      return;
    }

    setIsLoading(true);
    setError("");
    setSuccessMessage("");
    
    try {
      const result = await auth.verifyOTP(phoneNumber, otpValue);

      if (result.success) {
        setSuccessMessage("Login successful.");

        if (onLoginSuccess) {
          await onLoginSuccess(phoneNumber);
        }

        setTimeout(() => {
          onClose();
        }, 500);
      } else {
        setError(result.message || "The OTP you entered is not valid.");
      }
    } catch (requestError) {
      setError(requestError.message || "The OTP could not be verified. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!canResend) return;
    
    setIsLoading(true);
    setError("");
    setSuccessMessage("");
    setOtp(["", "", "", "", "", ""]);
    
    try {
      const result = await auth.resendOTP(phoneNumber);

      if (result.success) {
        setTimer(30);
        setCanResend(false);
        setSuccessMessage("OTP resent successfully.");
      } else {
        setError(result.message || "Unable to resend OTP. Please try again.");
      }
    } catch (requestError) {
      setError(requestError.message || "Unable to resend OTP. Please try again.");
    } finally {
      setIsLoading(false);
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
    setSuccessMessage("");
  };

  const maskedPhone = `+91 ${phoneNumber.slice(0, 2)}****${phoneNumber.slice(-2)}`;
  const isOtpStep = step === "otp";

  return (
    <div className="auth-modal-overlay" onClick={handleOverlayClick}>
      <div className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="auth-close-btn" onClick={onClose} type="button" aria-label="Close login">
          <X size={19} />
        </button>

        <aside className="auth-brand-panel">
          <div className="auth-logo-mark">
            <img src={Logo} alt="Sancharie" className="auth-logo-img" />
          </div>
          <div className="auth-brand-copy">
            <span className="auth-kicker"><ShieldCheck size={16} /> Secure access</span>
            <h2>Sancharie account portal</h2>
            <p>Sign in once to continue bookings, manage travellers, and keep your trip records in sync.</p>
          </div>
          <div className="auth-assurance-list" aria-label="Account safeguards">
            <div>
              <LockKeyhole size={18} />
              <span>
                <strong>OTP verification</strong>
                <small>Single-use code for every sign-in.</small>
              </span>
            </div>
            <div>
              <CheckCircle2 size={18} />
              <span>
                <strong>Protected checkout</strong>
                <small>Required before payment and booking.</small>
              </span>
            </div>
          </div>
        </aside>

        <section className="auth-content-panel">
          <div className="auth-step-row" aria-label="Login progress">
            <span className={step === "phone" ? "active" : "complete"}>1</span>
            <i />
            <span className={isOtpStep ? "active" : ""}>2</span>
          </div>

          <div className="auth-header">
            <span className="auth-panel-eyebrow">{isOtpStep ? "Verification required" : "Login or create account"}</span>
            <h1 id="auth-title">{isOtpStep ? "Verify your mobile" : "Welcome to Sancharie"}</h1>
            <p className="auth-subtitle">
              {isOtpStep
                ? `Enter the 6-digit code sent to ${maskedPhone}.`
                : "Use your Indian mobile number to securely access your account."}
            </p>
          </div>

          {(error || successMessage) && (
            <div className={`auth-status-message ${error ? "error" : "success"}`} role="status">
              {error ? <AlertCircle size={17} /> : <CheckCircle2 size={17} />}
              <span>{error || successMessage}</span>
            </div>
          )}

          {step === "phone" && (
            <form className="auth-form" onSubmit={handleSendOtp}>
              <div className={`auth-field ${error ? "error" : ""}`}>
                <label htmlFor="auth-phone">Mobile number</label>
                <div className="phone-input-wrapper">
                  <span className="country-code">+91</span>
                  <input
                    id="auth-phone"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    placeholder="98765 43210"
                    value={phoneNumber}
                    onChange={handlePhoneChange}
                    maxLength={10}
                    aria-invalid={Boolean(error)}
                    autoFocus
                  />
                  <Smartphone size={19} />
                </div>
              </div>

              <button
                className={`auth-submit-btn ${isLoading ? "loading" : ""}`}
                type="submit"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <span className="btn-loader" aria-hidden="true"></span>
                    Sending code
                  </>
                ) : (
                  <>
                    Continue securely <ArrowRight size={18} />
                  </>
                )}
              </button>

              <div className="auth-method-note">
                <KeyRound size={16} />
                <span>Mobile OTP is the active sign-in method for this account.</span>
              </div>

              <p className="auth-terms">
                By continuing, you agree to our <a href="/privacy-policy">Terms</a> and <a href="/privacy-policy">Privacy Policy</a>.
              </p>
            </form>
          )}

          {step === "otp" && (
            <form className="auth-form otp-form" onSubmit={handleVerifyOtp}>
              <button className="change-number-link" onClick={handleBack} type="button">
                <ArrowLeft size={16} />
                Change mobile number
              </button>

              <div className="otp-phone-display">
                <span>Code sent to</span>
                <strong>{maskedPhone}</strong>
              </div>

              <div className={`auth-field ${error ? "error" : ""}`}>
                <label>One-time password</label>
                <div className="otp-inputs" onPaste={handleOtpPaste}>
                  {otp.map((digit, index) => (
                    <input
                      key={index}
                      ref={(el) => (otpRefs.current[index] = el)}
                      type="text"
                      inputMode="numeric"
                      autoComplete={index === 0 ? "one-time-code" : "off"}
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(index, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(index, e)}
                      aria-label={`OTP digit ${index + 1}`}
                    />
                  ))}
                </div>
              </div>

              <div className="otp-timer">
                {canResend ? (
                  <button className="resend-btn" onClick={handleResendOtp} disabled={isLoading} type="button">
                    <RotateCcw size={16} />
                    Resend code
                  </button>
                ) : (
                  <span>Resend code in <strong>{timer}s</strong></span>
                )}
              </div>

              <button
                className={`auth-submit-btn ${isLoading ? "loading" : ""}`}
                type="submit"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <span className="btn-loader" aria-hidden="true"></span>
                    Verifying
                  </>
                ) : (
                  <>
                    Verify and sign in <ShieldCheck size={18} />
                  </>
                )}
              </button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
