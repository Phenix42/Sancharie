import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "./payment.css";
import { 
  ArrowLeft, 
  ShieldCheck, 
  CreditCard, 
  CheckCircle, 
  Bus, 
  Armchair, 
  Lock, 
  ArrowRight,
  Download,
  Home,
  Phone,
  Mail,
  Clock,
  MapPin,
  User,
  Ticket,
  AlertCircle,
  Loader2,
  Calendar,
  BadgeCheck,
  Wallet,
  FileText,
  AlertTriangle,
  RefreshCw
} from "lucide-react";
import { bus, payment } from "../services/api";
import { useBooking } from "../context/BookingContext";
import { useAuth } from "../context/AuthContext";
import { generateTicketPDF } from "../utils/ticketGenerator";
import { useToast } from "./Toast";

export default function Payment() {
  const location = useLocation();
  const navigate = useNavigate();
  const { state: bookingState, actions } = useBooking();
  const { createBooking, isAuthenticated } = useAuth();
  const toast = useToast();
  
  // Get session expired state from booking context
  const { sessionExpired } = bookingState;

  // Get data from navigation state
  const { fareData, selectedSeats, boardingPoint, droppingPoint, bus: busData, passengers, contactDetails, assurance, blockSeatData } = location.state || {};
  
  // Get city names from booking context search params
  const fromCity = bookingState?.searchParams?.from || busData?.source || 'Origin';
  const toCity = bookingState?.searchParams?.to || busData?.destination || 'Destination';

  // Payment status
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [bookingResponse, setBookingResponse] = useState(null);
  const [bookingError, setBookingError] = useState(null);
  const [razorpayLoaded, setRazorpayLoaded] = useState(false);
  const [paymentId, setPaymentId] = useState(null);

  // GST Invoice state
  const [requireGstInvoice, setRequireGstInvoice] = useState(false);
  const [gstDetails, setGstDetails] = useState({
    companyName: '',
    gstin: '',
    address: ''
  });

  // Load Razorpay script on mount
  useEffect(() => {
    payment.loadScript().then(setRazorpayLoaded);
  }, []);

  // Handle session expiration - go to home
  const handleGoHome = () => {
    actions.resetSession();
    navigate('/');
  };

  // Handle refresh search
  const handleRefreshSearch = () => {
    actions.resetSession();
    navigate('/');
  };

  // Session Expired Popup - show on any page if session expires during booking
  if (sessionExpired && !paymentSuccess) {
    return (
      <div className="payment-page">
        <div className="session-expired-overlay">
          <div className="session-expired-popup">
            <div className="session-expired-icon">
              <AlertTriangle size={56} strokeWidth={1.5} />
            </div>
            <h2>Session Expired</h2>
            <p>Your booking session has expired after 10 minutes of inactivity. Please start a new search to continue.</p>
            <div className="session-expired-actions">
              <button className="session-btn-primary" onClick={handleGoHome}>
                <Home size={20} />
                Go to Home
              </button>
              <button className="session-btn-secondary" onClick={handleRefreshSearch}>
                <RefreshCw size={20} />
                Start New Search
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Redirect to home if no booking data
  if (!fareData || !selectedSeats) {
    return (
      <div className="payment-page">
        <div className="payment-container">
          <div className="payment-header">
            <div className="header-left">
              <button className="back-btn" onClick={() => navigate('/')}>
                <ArrowLeft size={20} />
              </button>
              <div className="header-title">
                <h4>No Payment Data</h4>
              </div>
            </div>
          </div>
          <div className="payment-body">
            <div className="no-data-card">
              <div className="no-data-icon">
                <Ticket size={64} strokeWidth={1.5} />
              </div>
              <h3>No Booking Data Found</h3>
              <p>Please complete the booking details first before proceeding to payment.</p>
              <button className="go-home-btn" onClick={() => navigate('/')}>
                <ArrowLeft size={18} /> Go Back to Home
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Helper to get seat names (handles both string and object formats)
  const getSeatNames = () => {
    if (!selectedSeats || selectedSeats.length === 0) return [];
    if (typeof selectedSeats[0] === 'object' && selectedSeats[0].seatName) {
      return selectedSeats.map(seat => seat.seatName);
    }
    return selectedSeats;
  };
  
  const seatNames = getSeatNames();
  const assuranceTotal = assurance === 'yes' ? 24 * selectedSeats.length : 0;
  const grandTotal = (fareData?.totalFare || 0) + assuranceTotal;

  const validatePayment = () => {
    if (!fareData || !selectedSeats || selectedSeats.length === 0) {
      toast.error("Invalid booking data. Please try again.");
      return false;
    }
    if (grandTotal <= 0) {
      toast.error("Invalid payment amount.");
      return false;
    }
    return true;
  };

  const handlePayNow = async () => {
    if (!validatePayment()) return;

    // Validate blockSeatData is available
    if (!blockSeatData?.blockTicketKey) {
      setBookingError('Block ticket session expired. Please select seats again.');
      toast.error('Please select seats again and complete booking details.');
      setTimeout(() => navigate(-2), 2000);
      return;
    }

    setIsProcessing(true);
    setBookingError(null);

    try {

      const bookingDetails = {
        busName: busData?.name || busData?.TravelName || "Bus Service",
        travelDate: busData?.departureDate || new Date().toISOString().split('T')[0],
        seats: seatNames.join(", "),
        passengerCount: passengers?.length || selectedSeats.length,
        description: `Bus Ticket - ${boardingPoint?.name || 'Origin'} to ${droppingPoint?.name || 'Destination'}`,
      };

      const customerInfo = {
        name: contactDetails?.name || passengers?.[0]?.name || '',
        email: contactDetails?.email || '',
        phone: contactDetails?.phone || '',
      };

      const paymentResult = await payment.initiatePayment({
        amount: grandTotal,
        customerInfo,
        bookingDetails,
        onStart: () => {
          console.log('Payment initiated...');
        },
        onSuccess: async (verification) => {
          console.log('Payment verified successfully:', verification.data?.payment_id);
          setPaymentId(verification.data?.payment_id);
        },
        onFailure: (error) => {
          console.error('Payment failed:', error);
        },
        onDismiss: () => {
          console.log('Payment modal closed by user');
        },
      });

      if (paymentResult.verified) {
        // Use blockTicketKey from blockSeat response for final booking
        const blockTicketKey = blockSeatData?.blockTicketKey;

        if (!blockTicketKey) {
          throw new Error('Block ticket key not found. Please select seats and complete details again.');
        }

        console.log('[Booking Flow] Starting seatBooking with blockTicketKey:', blockTicketKey.substring(0, 20) + '...');

        let rtcFareData = null;
        
        // For RTC services, get updated fare FIRST before seatBooking
        if (busData?.isRTC) {
          try {
            console.log('[Booking Flow] Bus is RTC, calling getRtcUpdatedFare...');
            rtcFareData = await bus.getRtcUpdatedFare(blockTicketKey);
            console.log('[Booking Flow] RTC fare update received:', rtcFareData);
          } catch (rtcError) {
            console.warn('[Booking Flow] RTC fare update failed (continuing anyway):', rtcError.message);
            // Continue with booking even if RTC fare update fails
          }
        }
        
        // Call seatBooking to complete reservation
        console.log('[Booking Flow] Calling seatBooking...');
        const bookingResult = await bus.bookTicket(blockTicketKey);
        console.log('[Booking Flow] Booking successful:', bookingResult);
        
        setBookingResponse({
          ...bookingResult,
          paymentId: paymentResult.data?.payment_id,
          orderId: paymentResult.data?.order_id,
        });
        actions.setBookingData(bookingResult);
        
        if (isAuthenticated) {
          try {
            await createBooking({
              busName: busData?.name || busData?.TravelName || 'Bus Service',
              busType: busData?.type || busData?.BusType || 'Sleeper',
              busNumber: busData?.busNumber || '',
              source: boardingPoint?.name || boardingPoint?.CityPointName || busData?.fromCity || '',
              destination: droppingPoint?.name || droppingPoint?.CityPointName || busData?.toCity || '',
              fromCity: busData?.fromCity || boardingPoint?.name || '',
              toCity: busData?.toCity || droppingPoint?.name || '',
              journeyDate: busData?.date || busData?.DepartureTime || new Date().toISOString(),
              boardingPoint: boardingPoint?.name || boardingPoint?.CityPointName || '',
              droppingPoint: droppingPoint?.name || droppingPoint?.CityPointName || '',
              departureTime: boardingPoint?.time || boardingPoint?.Time || '',
              arrivalTime: droppingPoint?.time || droppingPoint?.Time || '',
              seats: seatNames,
              selectedSeats: seatNames,
              passengers: passengers.map(p => ({
                name: p.name,
                age: p.age,
                gender: p.gender,
                seatNumber: p.seatName || p.seatNumber
              })),
              baseFare: fareData?.baseFare || fareData?.totalFare || grandTotal,
              serviceTax: fareData?.serviceTax || 0,
              totalFare: grandTotal,
              paymentId: paymentResult.data?.payment_id,
              paymentStatus: 'completed',
              paymentMethod: 'razorpay',
              externalBookingId: bookingResult?.etsTicketNumber || bookingResult?.bookingId,
              ticketNo: bookingResult?.etsTicketNumber || bookingResult?.ticketNo,
              pnr: bookingResult?.opPNR || bookingResult?.travelOperatorPNR
            });
            console.log('Booking saved to database');
          } catch (dbError) {
            console.error('Failed to save booking to database:', dbError);
          }
        }
        
        const ticketData = {
          bookingId: bookingResult?.bookingId || `SAN${Date.now().toString().slice(-8)}`,
          pnr: bookingResult?.opPNR || bookingResult?.travelOperatorPNR,
          busName: busData?.name || busData?.TravelName || 'Bus Service',
          busType: busData?.type || busData?.BusType || 'Sleeper',
          fromCity: fromCity,
          toCity: toCity,
          journeyDate: busData?.date || busData?.DepartureTime,
          boardingPoint: boardingPoint,
          droppingPoint: droppingPoint,
          departureTime: boardingPoint?.time || boardingPoint?.Time,
          arrivalTime: droppingPoint?.time || droppingPoint?.Time,
          seats: seatNames,
          passengers: passengers,
          totalFare: grandTotal,
          paymentId: paymentResult.data?.payment_id,
          contactPhone: contactDetails?.phone,
          contactEmail: contactDetails?.email
        };
        
        setTimeout(() => {
          generateTicketPDF(ticketData);
        }, 1000);
        
        // Stop session timer on successful booking
        actions.resetSession();
        
        setPaymentSuccess(true);
      }
    } catch (error) {
      console.error("Payment/Booking error:", error);
      
      // Handle specific API errors
      if (error.message && error.message.includes('missing API')) {
        setBookingError('Booking session expired. Please select seats again and complete details to retry.');
        toast.error('Session expired. Starting fresh booking...');
        setTimeout(() => navigate('/', { replace: true }), 3000);
      } else if (error.message === 'Payment cancelled by user') {
        setBookingError(null);
      } else if (error.message && error.message.includes('Block ticket')) {
        setBookingError('Failed to reserve seats. Please try again.');
        toast.error('Seat reservation failed. Please try a different route or bus.');
      } else {
        setBookingError(error.message || "Booking failed. Please try again.");
        toast.error(error.message || 'Booking failed. Please try again.');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBack = () => {
    navigate(-1);
  };

  // Payment Success Screen
  if (paymentSuccess) {
    const bookingId = bookingResponse?.BookingID || bookingResponse?.bookingId || `SAN${Date.now().toString().slice(-8)}`;
    const ticketNo = bookingResponse?.TicketNo || bookingResponse?.ticketNo;
    const pnr = bookingResponse?.TravelOperatorPNR || bookingResponse?.pnr;
    
    return (
      <div className="payment-page payment-page-success">
        <div className="success-container">
          <div className="success-card">
            {/* Success Animation */}
            <div className="success-animation">
              <div className="success-circle">
                <CheckCircle size={80} strokeWidth={1.5} />
              </div>
              <div className="success-pulse"></div>
            </div>
            
            <h1 className="success-title">Payment Successful!</h1>
            <p className="success-subtitle">Your booking has been confirmed</p>
            
            {/* Booking Reference */}
            <div className="booking-reference">
              <div className="reference-item">
                <span className="reference-label">Booking ID</span>
                <span className="reference-value">{bookingId}</span>
              </div>
              {ticketNo && (
                <div className="reference-item">
                  <span className="reference-label">Ticket No</span>
                  <span className="reference-value">{ticketNo}</span>
                </div>
              )}
              {pnr && (
                <div className="reference-item">
                  <span className="reference-label">PNR</span>
                  <span className="reference-value">{pnr}</span>
                </div>
              )}
            </div>

            {/* Redesigned Ticket Card */}
            <div className="ticket-card-redesigned">
              {/* Top Decorative Strip */}
              <div className="ticket-top-strip">
                <div className="strip-pattern"></div>
              </div>

              {/* Main Ticket Content */}
              <div className="ticket-content">
                {/* Bus Info Row */}
                <div className="ticket-bus-row">
                  <div className="bus-info-left">
                    <div className="bus-icon-badge">
                      <Bus size={20} />
                    </div>
                    <div className="bus-text">
                      <h4>{busData?.name || busData?.TravelName || "Bus Service"}</h4>
                      <span>{busData?.type || busData?.BusType || "Sleeper"}</span>
                    </div>
                  </div>
                  <div className="total-paid-badge">
                    <span className="paid-label">TOTAL PAID</span>
                    <span className="paid-amount">₹{grandTotal}</span>
                  </div>
                </div>

                {/* Divider with circles */}
                <div className="ticket-divider">
                  <div className="divider-circle left"></div>
                  <div className="divider-line"></div>
                  <div className="divider-circle right"></div>
                </div>

                {/* Journey Route */}
                <div className="journey-route-section">
                  <div className="journey-point departure">
                    <div className="journey-time">{boardingPoint?.time || boardingPoint?.Time}</div>
                    <div className="journey-city">{fromCity}</div>
                    <div className="journey-location">
                      <MapPin size={12} />
                      <span>{boardingPoint?.name || boardingPoint?.CityPointName}</span>
                    </div>
                  </div>

                  <div className="journey-connector">
                    <div className="connector-line">
                      <span></span>
                      <span></span>
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                    <ArrowRight size={18} className="connector-arrow" />
                  </div>

                  <div className="journey-point arrival">
                    <div className="journey-time">{droppingPoint?.time || droppingPoint?.Time}</div>
                    <div className="journey-city">{toCity}</div>
                    <div className="journey-location">
                      <MapPin size={12} />
                      <span>{droppingPoint?.name || droppingPoint?.CityPointName}</span>
                    </div>
                  </div>
                </div>

                {/* Bottom Info Chips */}
                <div className="ticket-info-chips">
                  <div className="info-chip">
                    <Armchair size={18} />
                    <div className="chip-content">
                      <span className="chip-label">Seats</span>
                      <span className="chip-value">{seatNames.join(", ")}</span>
                    </div>
                  </div>
                  <div className="info-chip">
                    <User size={18} />
                    <div className="chip-content">
                      <span className="chip-label">Passengers</span>
                      <span className="chip-value">{passengers?.length || seatNames.length}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Decorative Strip */}
              <div className="ticket-bottom-strip">
                <div className="strip-pattern"></div>
              </div>
            </div>

            {/* Confirmation Message */}
            <div className="confirmation-message">
              <Mail size={18} />
              <p>
                Confirmation sent to <strong>{contactDetails?.phone || "your phone"}</strong>
                {contactDetails?.email && <> and <strong>{contactDetails.email}</strong></>}
              </p>
            </div>

            {/* Action Buttons */}
            <div className="success-actions">
              <button className="btn-primary" onClick={() => generateTicketPDF({
                bookingId,
                pnr,
                busName: busData?.name || busData?.TravelName || 'Bus Service',
                busType: busData?.type || busData?.BusType || 'Sleeper',
                fromCity: fromCity,
                toCity: toCity,
                journeyDate: busData?.date || busData?.DepartureTime,
                boardingPoint: boardingPoint,
                droppingPoint: droppingPoint,
                departureTime: boardingPoint?.time || boardingPoint?.Time,
                arrivalTime: droppingPoint?.time || droppingPoint?.Time,
                seats: seatNames,
                passengers: passengers,
                totalFare: grandTotal,
                paymentId: paymentId,
                contactPhone: contactDetails?.phone,
                contactEmail: contactDetails?.email
              })}>
                <Download size={18} />
                Download Ticket
              </button>
              <button className="btn-secondary" onClick={() => navigate('/')}>
                <Home size={18} />
                Back to Home
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Processing Screen
  if (isProcessing) {
    return (
      <div className="payment-page payment-page-processing">
        <div className="processing-container">
          <div className="processing-card">
            <div className="processing-animation">
              <Loader2 size={64} className="spinner" />
            </div>
            <h2>Processing Payment</h2>
            <p>Please do not close this window or press back button</p>
            <div className="processing-amount">₹{grandTotal}</div>
            <div className="processing-steps">
              <div className="step active">
                <div className="step-indicator"></div>
                <span>Verifying details</span>
              </div>
              <div className="step">
                <div className="step-indicator"></div>
                <span>Processing payment</span>
              </div>
              <div className="step">
                <div className="step-indicator"></div>
                <span>Confirming booking</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Main Payment Page
  return (
    <div className="payment-page">
      <div className="payment-container">
        {/* Header */}
        <header className="payment-header">
          <div className="header-left">
            <button className="back-btn" onClick={handleBack} aria-label="Go back">
              <ArrowLeft size={20} />
            </button>
            <div className="header-content">
              <h1>Secure Checkout</h1>
              <span className="header-subtitle">Complete your booking</span>
            </div>
          </div>
          <div className="header-right">
            <div className="secure-indicator">
              <Lock size={16} />
              <span>256-bit SSL Secured</span>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="payment-main">
          <div className="payment-content">
            {/* Journey Summary Card */}
            <section className="summary-section">
              <div className="section-header">
                <h2>Journey Summary</h2>
                <button className="edit-btn" onClick={handleBack}>Edit</button>
              </div>

              <div className="journey-summary-card">
                {/* Bus Info */}
                <div className="bus-header">
                  <div className="bus-icon-wrapper">
                    <Bus size={24} />
                  </div>
                  <div className="bus-details">
                    <h3>{busData?.name || busData?.TravelName || "Bus Service"}</h3>
                    <span className="bus-type">{busData?.type || busData?.BusType || "Sleeper"}</span>
                  </div>
                </div>

                {/* Route Timeline */}
                <div className="route-timeline">
                  <div className="timeline-item start">
                    <div className="timeline-marker"></div>
                    <div className="timeline-content">
                      <div className="timeline-time">
                        <Clock size={14} />
                        {boardingPoint?.time || boardingPoint?.Time}
                      </div>
                      <div className="timeline-city">{fromCity}</div>
                      <div className="timeline-location">
                        <MapPin size={14} />
                        {boardingPoint?.name || boardingPoint?.CityPointName}
                      </div>
                    </div>
                  </div>
                  <div className="timeline-connector"></div>
                  <div className="timeline-item end">
                    <div className="timeline-marker"></div>
                    <div className="timeline-content">
                      <div className="timeline-time">
                        <Clock size={14} />
                        {droppingPoint?.time || droppingPoint?.Time}
                      </div>
                      <div className="timeline-city">{toCity}</div>
                      <div className="timeline-location">
                        <MapPin size={14} />
                        {droppingPoint?.name || droppingPoint?.CityPointName}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Seats */}
                <div className="seats-section">
                  <div className="seats-label">
                    <Armchair size={18} />
                    <span>Selected Seats</span>
                  </div>
                  <div className="seats-list">
                    {seatNames.map(seat => (
                      <span key={seat} className="seat-tag">{seat}</span>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* Passenger Details */}
            {passengers && passengers.length > 0 && (
              <section className="passengers-section">
                <div className="section-header">
                  <h2>Passenger Details</h2>
                  <span className="passenger-count">{passengers.length} Passenger(s)</span>
                </div>
                <div className="passengers-list">
                  {passengers.map((passenger, index) => (
                    <div key={index} className="passenger-card">
                      <div className="passenger-avatar">
                        <User size={20} />
                      </div>
                      <div className="passenger-info">
                        <span className="passenger-name">{passenger.name}</span>
                        <span className="passenger-meta">{passenger.age} yrs • {passenger.gender}</span>
                      </div>
                      <div className="passenger-seat">
                        <Armchair size={16} />
                        <span>{passenger.seatName || passenger.seatNumber}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Fare Breakdown */}
            <section className="fare-section">
              <div className="section-header">
                <h2>Fare Details</h2>
              </div>
              <div className="fare-breakdown">
                <div className="fare-item">
                  <span>Base Fare ({fareData?.seatCount || seatNames.length} seat{seatNames.length > 1 ? 's' : ''})</span>
                  <span>₹{fareData?.baseFare || 0}</span>
                </div>
                <div className="fare-item">
                  <span>GST (5%)</span>
                  <span>₹{fareData?.gst || 0}</span>
                </div>
                <div className="fare-item">
                  <span>Service Charge</span>
                  <span>₹{fareData?.serviceCharge || 0}</span>
                </div>
                {assurance === 'yes' && (
                  <div className="fare-item assurance">
                    <span>
                      <ShieldCheck size={16} />
                      Sancharie Assurance
                    </span>
                    <span>₹{assuranceTotal}</span>
                  </div>
                )}
                <div className="fare-total">
                  <span>Total Amount</span>
                  <span>₹{grandTotal}</span>
                </div>
              </div>
            </section>

            {/* GST Invoice Option */}
            <section className="gst-invoice-section">
              <div className="gst-checkbox-wrapper">
                <label className="gst-checkbox-label">
                  <input
                    type="checkbox"
                    checked={requireGstInvoice}
                    onChange={(e) => setRequireGstInvoice(e.target.checked)}
                    className="gst-checkbox"
                  />
                  <span className="gst-checkbox-custom"></span>
                  <span className="gst-checkbox-text">
                    <FileText size={18} />
                    Required for GST Invoice
                  </span>
                </label>
              </div>
              
              {requireGstInvoice && (
                <div className="gst-details-form">
                  <div className="gst-input-group">
                    <label>Company Name</label>
                    <input
                      type="text"
                      placeholder="Enter company name"
                      value={gstDetails.companyName}
                      onChange={(e) => setGstDetails({...gstDetails, companyName: e.target.value})}
                    />
                  </div>
                  <div className="gst-input-group">
                    <label>GSTIN</label>
                    <input
                      type="text"
                      placeholder="Enter 15-digit GSTIN"
                      value={gstDetails.gstin}
                      onChange={(e) => setGstDetails({...gstDetails, gstin: e.target.value.toUpperCase()})}
                      maxLength={15}
                    />
                  </div>
                  <div className="gst-input-group">
                    <label>Billing Address</label>
                    <input
                      type="text"
                      placeholder="Enter billing address"
                      value={gstDetails.address}
                      onChange={(e) => setGstDetails({...gstDetails, address: e.target.value})}
                    />
                  </div>
                </div>
              )}
            </section>

            {/* Trust Badges */}
            <div className="trust-section">
              <div className="trust-badge">
                <ShieldCheck size={20} />
                <span>Secure Payment</span>
              </div>
              <div className="trust-badge">
                <BadgeCheck size={20} />
                <span>100% Safe</span>
              </div>
              <div className="trust-badge">
                <Wallet size={20} />
                <span>All Payment Modes</span>
              </div>
            </div>

            {/* Pay Button */}
            <button 
              className="pay-button" 
              onClick={handlePayNow}
              disabled={isProcessing || !razorpayLoaded}
            >
              {isProcessing ? (
                <>
                  <Loader2 size={20} className="spinner" />
                  Processing...
                </>
              ) : (
                <>
                  <Lock size={20} />
                  Pay Securely ₹{grandTotal}
                </>
              )}
            </button>

            {/* Help & Terms */}
            <div className="footer-info">
              <p className="help-text">
                Need help? <a href="tel:1800123456" className="help-link">
                  <Phone size={14} />
                  1800-123-456
                </a>
              </p>
              <p className="terms-text">
                By proceeding, you agree to our <a href="/privacy-policy">Terms</a> & <a href="/privacy-policy">Privacy Policy</a>
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
