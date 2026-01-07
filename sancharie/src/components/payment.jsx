import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "./payment.css";
import { IoArrowBack, IoShieldCheckmark } from "react-icons/io5";
import { FaCreditCard, FaCheckCircle, FaBus } from "react-icons/fa";
import { MdEventSeat } from "react-icons/md";
import { BsShieldLock, BsArrowRight } from "react-icons/bs";
import { bookTicket } from "../services/busApi";
import { useBooking } from "../context/BookingContext";
import { useAuth } from "../context/AuthContext";
// SECURITY: Import Razorpay payment service (no secrets exposed here)
import { initiatePayment, loadRazorpayScript } from "../services/paymentApi";
import { generateTicketPDF } from "../services/ticketPdf";

export default function Payment() {
  const location = useLocation();
  const navigate = useNavigate();
  const { state: bookingState, actions } = useBooking();
  const { createBooking, isAuthenticated } = useAuth();

  // Get data from navigation state
  const { fareData, selectedSeats, boardingPoint, droppingPoint, bus, passengers, contactDetails, assurance, blockSeatData } = location.state || {};
  
  // Get city names from booking context search params
  const fromCity = bookingState?.searchParams?.from || bus?.source || 'Origin';
  const toCity = bookingState?.searchParams?.to || bus?.destination || 'Destination';

  // Payment status
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [bookingResponse, setBookingResponse] = useState(null);
  const [bookingError, setBookingError] = useState(null);
  const [razorpayLoaded, setRazorpayLoaded] = useState(false);
  const [paymentId, setPaymentId] = useState(null);

  // Load Razorpay script on mount
  useEffect(() => {
    loadRazorpayScript().then(setRazorpayLoaded);
  }, []);

  // Redirect to home if no booking data
  if (!fareData || !selectedSeats) {
    return (
      <div className="payment-page">
        <div className="payment-container">
          <div className="payment-header">
            <div className="header-left">
              <button className="back-btn" onClick={() => navigate('/')}>
                <IoArrowBack />
              </button>
              <div className="header-title">
                <h4>No Payment Data</h4>
              </div>
            </div>
          </div>
          <div className="payment-body">
            <div className="no-data-card">
              <div className="no-data-icon">🎫</div>
              <h3>No Booking Data Found</h3>
              <p>Please complete the booking details first before proceeding to payment.</p>
              <button className="go-home-btn" onClick={() => navigate('/')}>
                <IoArrowBack /> Go Back to Home
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
    // Check if first item is object or string
    if (typeof selectedSeats[0] === 'object' && selectedSeats[0].seatName) {
      return selectedSeats.map(seat => seat.seatName);
    }
    return selectedSeats; // Already strings
  };
  
  const seatNames = getSeatNames();
  const assuranceTotal = assurance === 'yes' ? 24 * selectedSeats.length : 0;
  const grandTotal = (fareData?.totalFare || 0) + assuranceTotal;

  // Debug logging
  console.log('Payment Debug:', { fareData, grandTotal, assuranceTotal });

  // Validation is now handled by Razorpay checkout
  const validatePayment = () => {
    // Basic validation - ensure we have booking data
    if (!fareData || !selectedSeats || selectedSeats.length === 0) {
      alert("Invalid booking data. Please try again.");
      return false;
    }
    if (grandTotal <= 0) {
      alert("Invalid payment amount.");
      return false;
    }
    return true;
  };

  // ⚠️ TEST MODE - Set to true to bypass Razorpay payment
  const TEST_MODE = true;

  const handlePayNow = async () => {
    if (!validatePayment()) return;

    setIsProcessing(true);
    setBookingError(null);

    try {
      // ⚠️ TEST MODE: Bypass Razorpay payment for testing
      if (TEST_MODE) {
        console.log('🧪 TEST MODE: Bypassing Razorpay payment');
        
        // Simulate payment delay
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Generate fake payment ID
        const fakePaymentId = 'test_pay_' + Date.now();
        setPaymentId(fakePaymentId);
        
        // Create a mock booking result (skip external API too for testing)
        const mockBookingResult = {
          bookingId: 'SAN' + Date.now().toString().slice(-8),
          ticketNo: 'TKT' + Math.random().toString(36).substr(2, 8).toUpperCase(),
          travelOperatorPNR: 'PNR' + Math.random().toString(36).substr(2, 6).toUpperCase(),
          bookingStatus: 'Confirmed',
          invoiceAmount: grandTotal
        };
        
        // Store booking data
        setBookingResponse({
          ...mockBookingResult,
          paymentId: fakePaymentId,
          orderId: 'test_order_' + Date.now(),
        });
        actions.setBookingData(mockBookingResult);
        
        // Save booking to backend database
        if (isAuthenticated) {
          try {
            await createBooking({
              busName: bus?.name || bus?.TravelName || 'Bus Service',
              busType: bus?.type || bus?.BusType || 'Sleeper',
              busNumber: bus?.busNumber || '',
              source: boardingPoint?.name || boardingPoint?.CityPointName || '',
              destination: droppingPoint?.name || droppingPoint?.CityPointName || '',
              fromCity: fromCity,
              toCity: toCity,
              journeyDate: bus?.date || bus?.DepartureTime || new Date().toISOString(),
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
              paymentId: fakePaymentId,
              paymentStatus: 'completed',
              paymentMethod: 'test_mode',
              externalBookingId: mockBookingResult?.bookingId,
              ticketNo: mockBookingResult?.ticketNo,
              pnr: mockBookingResult?.travelOperatorPNR
            });
            console.log('✅ Booking saved to database (TEST MODE)');
          } catch (dbError) {
            console.error('Failed to save booking to database:', dbError);
          }
        }
        
        // Auto-download PDF ticket
        const ticketData = {
          bookingId: mockBookingResult?.bookingId,
          pnr: mockBookingResult?.travelOperatorPNR,
          busName: bus?.name || bus?.TravelName || 'Bus Service',
          busType: bus?.type || bus?.BusType || 'Sleeper',
          fromCity: fromCity,
          toCity: toCity,
          journeyDate: bus?.date || bus?.DepartureTime,
          boardingPoint: boardingPoint,
          droppingPoint: droppingPoint,
          departureTime: boardingPoint?.time || boardingPoint?.Time,
          arrivalTime: droppingPoint?.time || droppingPoint?.Time,
          seats: seatNames,
          passengers: passengers,
          totalFare: grandTotal,
          paymentId: fakePaymentId,
          contactPhone: contactDetails?.phone,
          contactEmail: contactDetails?.email
        };
        
        setTimeout(() => {
          generateTicketPDF(ticketData);
        }, 1000);
        
        setPaymentSuccess(true);
        setIsProcessing(false);
        return;
      }
      // ⚠️ END TEST MODE

      /**
       * RAZORPAY PAYMENT FLOW
       * =====================
       * SECURITY: All secret key operations happen on backend
       * 
       * 1. Frontend calls backend /create-order → Backend creates order using secret
       * 2. Razorpay checkout opens with order_id (no secrets in frontend)
       * 3. User completes payment on Razorpay's secure page
       * 4. Frontend calls backend /verify-payment → Backend verifies using secret
       * 5. Only after verification, we confirm the booking
       */
      
      // Prepare booking details for Razorpay notes
      const bookingDetails = {
        busName: bus?.name || bus?.TravelName || "Bus Service",
        travelDate: bus?.departureDate || new Date().toISOString().split('T')[0],
        seats: seatNames.join(", "),
        passengerCount: passengers?.length || selectedSeats.length,
        description: `Bus Ticket - ${boardingPoint?.name || 'Origin'} to ${droppingPoint?.name || 'Destination'}`,
      };

      // Customer info for Razorpay prefill
      const customerInfo = {
        name: contactDetails?.name || passengers?.[0]?.name || '',
        email: contactDetails?.email || '',
        phone: contactDetails?.phone || '',
      };

      // Initiate Razorpay payment
      // SECURITY: This function handles the entire secure flow:
      // 1. Creates order on backend (uses secret key)
      // 2. Opens Razorpay checkout (uses public key only)
      // 3. Verifies payment on backend (uses secret key for signature verification)
      const paymentResult = await initiatePayment({
        amount: grandTotal, // Amount in INR
        customerInfo,
        bookingDetails,
        onPaymentStart: () => {
          console.log('Payment initiated...');
        },
        onPaymentSuccess: async (verification) => {
          console.log('Payment verified successfully:', verification.data?.payment_id);
          setPaymentId(verification.data?.payment_id);
        },
        onPaymentFailure: (error) => {
          console.error('Payment failed:', error);
        },
        onPaymentDismiss: () => {
          console.log('Payment modal closed by user');
        },
      });

      // Payment was successful and verified
      // Now proceed with booking confirmation
      if (paymentResult.verified) {
        // Call the booking API to confirm the reservation
        const bookingResult = await bookTicket(
          bus?.searchTokenId,
          bus?.resultIndex || bus?.ResultIndex,
          boardingPoint?.id,
          droppingPoint?.id,
          passengers
        );
        
        // Store booking data in context and state
        setBookingResponse({
          ...bookingResult,
          paymentId: paymentResult.data?.payment_id,
          orderId: paymentResult.data?.order_id,
        });
        actions.setBookingData(bookingResult);
        
        // Save booking to backend database (associated with user's phone number)
        if (isAuthenticated) {
          try {
            await createBooking({
              busName: bus?.name || bus?.TravelName || 'Bus Service',
              busType: bus?.type || bus?.BusType || 'Sleeper',
              busNumber: bus?.busNumber || '',
              source: boardingPoint?.name || boardingPoint?.CityPointName || bus?.fromCity || '',
              destination: droppingPoint?.name || droppingPoint?.CityPointName || bus?.toCity || '',
              fromCity: bus?.fromCity || boardingPoint?.name || '',
              toCity: bus?.toCity || droppingPoint?.name || '',
              journeyDate: bus?.date || bus?.DepartureTime || new Date().toISOString(),
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
              externalBookingId: bookingResult?.bookingId,
              ticketNo: bookingResult?.ticketNo,
              pnr: bookingResult?.travelOperatorPNR
            });
            console.log('✅ Booking saved to database');
          } catch (dbError) {
            console.error('Failed to save booking to database:', dbError);
            // Don't fail the booking - external booking was successful
          }
        }
        
        // Auto-download PDF ticket after successful payment
        const ticketData = {
          bookingId: bookingResult?.bookingId || `SAN${Date.now().toString().slice(-8)}`,
          pnr: bookingResult?.travelOperatorPNR,
          busName: bus?.name || bus?.TravelName || 'Bus Service',
          busType: bus?.type || bus?.BusType || 'Sleeper',
          fromCity: fromCity,
          toCity: toCity,
          journeyDate: bus?.date || bus?.DepartureTime,
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
        
        // Small delay to ensure UI updates first, then download
        setTimeout(() => {
          generateTicketPDF(ticketData);
        }, 1000);
        
        setPaymentSuccess(true);
      }
    } catch (error) {
      console.error("Payment/Booking error:", error);
      
      // Handle different error types
      if (error.message === 'Payment cancelled by user') {
        // User closed the modal - not an error, just cancelled
        setBookingError(null);
      } else {
        setBookingError(error.message || "Payment failed. Please try again.");
        alert(`Payment failed: ${error.message}`);
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
    const invoiceNumber = bookingResponse?.InvoiceNumber || bookingResponse?.invoiceNumber;
    const pnr = bookingResponse?.TravelOperatorPNR || bookingResponse?.pnr;
    
    return (
      <div className="payment-page">
        <div className="payment-success-container">
          <div className="success-content">
            <div className="success-animation">
              <div className="success-circle">
                <FaCheckCircle className="success-check" />
              </div>
              <div className="success-rings">
                <div className="ring ring-1"></div>
                <div className="ring ring-2"></div>
                <div className="ring ring-3"></div>
              </div>
            </div>
            
            <h2>Payment Successful!</h2>
            <p className="booking-id">Booking ID: <strong>{bookingId}</strong></p>
            {ticketNo && <p className="ticket-no">Ticket No: <strong>{ticketNo}</strong></p>}
            {pnr && <p className="pnr-no">PNR: <strong>{pnr}</strong></p>}
            
            <div className="success-ticket">
              <div className="ticket-header">
                <FaBus className="bus-icon" />
                <div>
                  <strong>{bus?.name || bus?.TravelName || "Bus Service"}</strong>
                  <span>{bus?.type || bus?.BusType || "Sleeper"}</span>
                </div>
              </div>
              
              <div className="ticket-route">
                <div className="route-from">
                  <span className="time">{boardingPoint?.time || boardingPoint?.Time}</span>
                  <span className="place">{boardingPoint?.name || boardingPoint?.CityPointName}</span>
                </div>
                <div className="route-line">
                  <BsArrowRight />
                </div>
                <div className="route-to">
                  <span className="time">{droppingPoint?.time || droppingPoint?.Time}</span>
                  <span className="place">{droppingPoint?.name || droppingPoint?.CityPointName}</span>
                </div>
              </div>
              
              <div className="ticket-details">
                <div className="detail-item">
                  <MdEventSeat />
                  <span>Seats: {seatNames.join(", ")}</span>
                </div>
                <div className="detail-item">
                  <span className="amount">₹{grandTotal}</span>
                </div>
              </div>
            </div>

            <p className="confirmation-text">
              ✉️ Confirmation sent to <strong>{contactDetails?.phone || "your phone"}</strong>
              {contactDetails?.email && <><br/>and <strong>{contactDetails.email}</strong></>}
            </p>

            <div className="success-actions">
              <button className="download-btn" onClick={() => generateTicketPDF({
                bookingId,
                pnr,
                busName: bus?.name || bus?.TravelName || 'Bus Service',
                busType: bus?.type || bus?.BusType || 'Sleeper',
                fromCity: fromCity,
                toCity: toCity,
                journeyDate: bus?.date || bus?.DepartureTime,
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
                <span>📥</span> Download Ticket
              </button>
              <button className="home-btn" onClick={() => navigate('/')}>
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
      <div className="payment-page">
        <div className="processing-container">
          <div className="processing-content">
            <div className="processing-animation">
              <div className="processing-spinner"></div>
              <div className="processing-pulse"></div>
            </div>
            <h3>Processing Payment...</h3>
            <p>Please do not close this window or press back button</p>
            <div className="processing-amount">₹{grandTotal}</div>
            <div className="processing-steps">
              <div className="step active">
                <span className="step-dot"></span>
                <span>Verifying details</span>
              </div>
              <div className="step">
                <span className="step-dot"></span>
                <span>Processing payment</span>
              </div>
              <div className="step">
                <span className="step-dot"></span>
                <span>Confirming booking</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="payment-page">
      <div className="payment-container">
        {/* HEADER */}
        <div className="payment-header">
          <div className="header-left">
            <button className="back-btn" onClick={handleBack}>
              <IoArrowBack />
            </button>
            <div className="header-title">
              <h4>Secure Payment</h4>
              <span className="header-subtitle">Complete your booking</span>
            </div>
          </div>
          <div className="header-right">
            <div className="secure-badge">
              <BsShieldLock />
              <span>256-bit SSL</span>
            </div>
            <div className="amount-badge">
              <span>Pay</span>
              <strong>₹{grandTotal}</strong>
            </div>
          </div>
        </div>


        <div className="payment-body payment-body-centered">
          {/* BOOKING SUMMARY - CENTERED */}
          <div className="booking-summary-section booking-summary-main">
            <div className="summary-card">
              <div className="summary-header">
                <h3>Booking Summary</h3>
                <span className="edit-link" onClick={handleBack}>Edit</span>
              </div>
              
              <div className="journey-card">
                <div className="bus-info">
                  <FaBus className="bus-icon" />
                  <div>
                    <strong>{bus?.name || bus?.TravelName || "Bus Service"}</strong>
                    <span>{bus?.type || bus?.BusType || "Sleeper"}</span>
                  </div>
                </div>

                <div className="route-timeline">
                  <div className="timeline-point start">
                    <div className="point-dot"></div>
                    <div className="point-info">
                      <span className="time">{boardingPoint?.time || boardingPoint?.Time}</span>
                      <span className="place">{boardingPoint?.name || boardingPoint?.CityPointName}</span>
                    </div>
                  </div>
                  <div className="timeline-line"></div>
                  <div className="timeline-point end">
                    <div className="point-dot"></div>
                    <div className="point-info">
                      <span className="time">{droppingPoint?.time || droppingPoint?.Time}</span>
                      <span className="place">{droppingPoint?.name || droppingPoint?.CityPointName}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="info-row">
                <div className="info-item">
                  <MdEventSeat className="info-icon" />
                  <div>
                    <span className="label">Seats</span>
                    <div className="seats-badges">
                      {seatNames.map(seat => (
                        <span key={seat} className="seat-badge">{seat}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Passenger Details */}
              {passengers && passengers.length > 0 && (
                <div className="passengers-summary">
                  <h4>Passenger Details</h4>
                  {passengers.map((passenger, index) => (
                    <div key={index} className="passenger-row">
                      <span className="passenger-name">{passenger.name}</span>
                      <span className="passenger-info">{passenger.age} yrs, {passenger.gender}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="fare-breakdown">
                <div className="fare-row">
                  <span>Base Fare × {fareData?.seatCount || seatNames.length}</span>
                  <span>₹{fareData?.baseFare || 0}</span>
                </div>
                <div className="fare-row">
                  <span>GST (5%)</span>
                  <span>₹{fareData?.gst || 0}</span>
                </div>
                <div className="fare-row">
                  <span>Service Charge</span>
                  <span>₹{fareData?.serviceCharge || 0}</span>
                </div>
                {assurance === 'yes' && (
                  <div className="fare-row assurance">
                    <span>🛡️ Sancharie Assurance</span>
                    <span>₹{assuranceTotal}</span>
                  </div>
                )}
                <div className="fare-row total">
                  <span>Total Amount</span>
                  <span>₹{grandTotal}</span>
                </div>
              </div>
            </div>

            {/* Trust Badges */}
            <div className="trust-badges trust-badges-horizontal">
              <div className="badge">
                <BsShieldLock />
                <span>Secure Payment</span>
              </div>
              <div className="badge">
                <IoShieldCheckmark />
                <span>100% Safe</span>
              </div>
              <div className="badge">
                <FaCreditCard />
                <span>All Payment Modes</span>
              </div>
            </div>

            <div className="help-info help-info-centered">
              <p>Need help? Call <a href="tel:1800123456" className="helpline">📞 1800-123-456</a></p>
            </div>

            {/* PROCEED TO PAYMENT BUTTON */}
            <button 
              className="proceed-payment-btn" 
              onClick={handlePayNow}
              disabled={isProcessing || !razorpayLoaded}
            >
              {isProcessing ? (
                <>
                  <span className="btn-spinner"></span>
                  Processing...
                </>
              ) : (
                <>
                  <BsShieldLock />
                  Proceed to Pay ₹{grandTotal}
                </>
              )}
            </button>

            <p className="terms-text terms-text-centered">
              By proceeding, you agree to our <a href="/privacy-policy">Terms</a> & <a href="/privacy-policy">Privacy Policy</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
