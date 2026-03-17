/**
 * BookingDetails Component
 * Displays detailed ticket information fetched from ETS API using getTicketByETSTNumber
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { bus } from '../services/api';
import { useAuth } from '../context/AuthContext';
import Header from './Header';
import Footer from './Footer';
import { generateTicketPDF } from '../utils/ticketGenerator';
import './BookingDetails.css';

export default function BookingDetails() {
  const { ticketNumber } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  // State
  const [ticketDetails, setTicketDetails] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Cancellation states
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancellationDetails, setCancellationDetails] = useState(null);
  const [isLoadingCancellation, setIsLoadingCancellation] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [cancelSuccess, setCancelSuccess] = useState('');

  // Get ticket number from URL params or location state
  const etsTicketNumber = ticketNumber || location.state?.ticketNumber || location.state?.etsTicketNumber;

  // Fetch ticket details on mount
  useEffect(() => {
    if (!etsTicketNumber) {
      setError('No ticket number provided');
      setIsLoading(false);
      return;
    }

    fetchTicketDetails();
  }, [etsTicketNumber]);

  const fetchTicketDetails = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await bus.getBookingDetails(etsTicketNumber);

      if (result.success) {
        setTicketDetails(result);
      } else {
        setError(result.message || 'Failed to fetch ticket details');
      }
    } catch (err) {
      console.error('Fetch ticket details error:', err);
      setError(err.message || 'Failed to fetch ticket details. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Get cancellation details before showing modal
  const openCancelModal = async () => {
    if (!ticketDetails) return;

    setShowCancelModal(true);
    setIsLoadingCancellation(true);
    setCancelError('');
    setCancellationDetails(null);

    try {
      // Get seat numbers from traveler details
      const seatNbrsToCancel = ticketDetails.travelerDetails?.map(t => t.seatNo) || [];

      if (seatNbrsToCancel.length === 0) {
        setCancelError('No seats found to cancel');
        setIsLoadingCancellation(false);
        return;
      }

      const result = await bus.cancelTicketConfirmation(
        ticketDetails.etsTicketNumber,
        seatNbrsToCancel
      );

      if (result.success && result.cancellable) {
        setCancellationDetails({
          seatNbrsToCancel,
          totalTicketFare: result.totalTicketFare,
          totalRefundAmount: result.totalRefundAmount,
          cancellationCharges: result.cancellationCharges,
          cancelChargesPercentage: result.cancelChargesPercentage,
          partiallyCancellable: result.partiallyCancellable,
        });
      } else {
        setCancelError('This ticket cannot be cancelled. Please contact support.');
      }
    } catch (err) {
      console.error('Get cancellation details error:', err);
      setCancelError(err.message || 'Failed to get cancellation details');
    } finally {
      setIsLoadingCancellation(false);
    }
  };

  // Handle actual cancellation
  const handleCancelTicket = async () => {
    if (!ticketDetails || !cancellationDetails) return;

    setIsCancelling(true);
    setCancelError('');

    try {
      const result = await bus.cancelBooking(
        ticketDetails.etsTicketNumber,
        cancellationDetails.seatNbrsToCancel
      );

      if (result.success) {
        const refundMsg = result.totalRefundAmount 
          ? `Refund of ₹${result.totalRefundAmount} will be processed within 5-7 business days.`
          : 'Refund will be processed as per cancellation policy.';
        
        setCancelSuccess(`Ticket cancelled successfully! ${refundMsg}`);

        // Refresh ticket details after cancellation
        setTimeout(() => {
          setShowCancelModal(false);
          fetchTicketDetails();
        }, 3000);
      } else {
        setCancelError(result.message || 'Cancellation failed. Please try again.');
      }
    } catch (err) {
      console.error('Cancel ticket error:', err);
      setCancelError(err.message || 'Failed to cancel ticket');
    } finally {
      setIsCancelling(false);
    }
  };

  const closeCancelModal = () => {
    setShowCancelModal(false);
    setCancellationDetails(null);
    setCancelError('');
    setCancelSuccess('');
  };

  // Download ticket PDF
  const handleDownloadTicket = () => {
    if (!ticketDetails) return;

    generateTicketPDF({
      bookingId: ticketDetails.etsTicketNumber,
      pnr: ticketDetails.opPNR,
      busName: ticketDetails.serviceProvider,
      busType: ticketDetails.serviceType,
      fromCity: ticketDetails.sourceCity,
      toCity: ticketDetails.destinationCity,
      journeyDate: ticketDetails.journeyDate,
      boardingPoint: ticketDetails.boardingPoint,
      droppingPoint: ticketDetails.droppingPoint,
      departureTime: ticketDetails.departureTime,
      seats: ticketDetails.travelerDetails?.map(t => t.seatNo) || [],
      passengers: ticketDetails.travelerDetails?.map(t => ({
        name: `${t.name} ${t.lastName || ''}`.trim(),
        age: t.age,
        gender: t.gender,
        seatNumber: t.seatNo,
      })) || [],
      totalFare: ticketDetails.travelerDetails?.reduce((sum, t) => sum + (t.fare || 0), 0) || 0,
    });
  };

  // Format date
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
      weekday: 'long',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  // Get status color
  const getStatusColor = (status) => {
    switch (status?.toUpperCase()) {
      case 'CONFIRMED':
        return '#38a169';
      case 'CANCELLED':
        return '#e53e3e';
      case 'TRAVELLED':
        return '#3182ce';
      case 'SERVICE_CANCELLED':
        return '#dd6b20';
      default:
        return '#718096';
    }
  };

  // Render loading state
  if (isLoading) {
    return (
      <>
        <Header />
        <div className="booking-details-page">
          <div className="loading-container">
            <div className="spinner"></div>
            <p>Loading ticket details...</p>
          </div>
        </div>
        <Footer />
      </>
    );
  }

  // Render error state
  if (error) {
    return (
      <>
        <Header />
        <div className="booking-details-page">
          <div className="error-container">
            <div className="error-icon">❌</div>
            <h2>Unable to Load Ticket</h2>
            <p>{error}</p>
            <div className="error-actions">
              <button onClick={fetchTicketDetails} className="retry-btn">
                Try Again
              </button>
              <button onClick={() => navigate('/my-bookings')} className="back-btn">
                Back to Bookings
              </button>
            </div>
          </div>
        </div>
        <Footer />
      </>
    );
  }

  // Render no ticket found
  if (!ticketDetails) {
    return (
      <>
        <Header />
        <div className="booking-details-page">
          <div className="error-container">
            <div className="error-icon">🎫</div>
            <h2>Ticket Not Found</h2>
            <p>The requested ticket could not be found.</p>
            <button onClick={() => navigate('/my-bookings')} className="back-btn">
              Back to Bookings
            </button>
          </div>
        </div>
        <Footer />
      </>
    );
  }

  const isCancellable = ticketDetails.ticketStatus?.toUpperCase() === 'CONFIRMED';

  return (
    <>
      <Header />
      <div className="booking-details-page">
        <div className="booking-details-container">
          {/* Header */}
          <div className="details-header">
            <button className="back-button" onClick={() => navigate(-1)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              <span className="back-text">Back</span>
            </button>
            <h1>Ticket Details</h1>
          </div>

          {/* Ticket Status Banner */}
          <div 
            className="status-banner"
            style={{ backgroundColor: getStatusColor(ticketDetails.ticketStatus) }}
          >
            <span className="status-icon">
              {ticketDetails.ticketStatus?.toUpperCase() === 'CONFIRMED' ? '✓' : 
               ticketDetails.ticketStatus?.toUpperCase() === 'CANCELLED' ? '✕' : 'ℹ'}
            </span>
            <span className="status-text">
              Ticket {ticketDetails.ticketStatus}
            </span>
          </div>

          {/* Main Ticket Card */}
          <div className="ticket-detail-card">
            {/* Ticket Numbers */}
            <div className="ticket-numbers">
              <div className="ticket-number-item">
                <span className="label">ETS Ticket No</span>
                <span className="value">{ticketDetails.etsTicketNumber}</span>
              </div>
              {ticketDetails.opPNR && (
                <div className="ticket-number-item">
                  <span className="label">Operator PNR</span>
                  <span className="value">{ticketDetails.opPNR}</span>
                </div>
              )}
              {ticketDetails.tripCode && (
                <div className="ticket-number-item">
                  <span className="label">Trip Code</span>
                  <span className="value">{ticketDetails.tripCode}</span>
                </div>
              )}
            </div>

            {/* Journey Details */}
            <div className="journey-section">
              <div className="journey-point">
                <div className="point-time">{ticketDetails.departureTime || 'N/A'}</div>
                <div className="point-city">{ticketDetails.sourceCity}</div>
                <div className="point-location">{ticketDetails.boardingPoint}</div>
              </div>
              
              <div className="journey-line">
                <div className="journey-duration">
                  <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                    <path d="M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10zm3.5 1c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1.5-6H6V6h12v5z"/>
                  </svg>
                </div>
                <div className="line"></div>
              </div>
              
              <div className="journey-point">
                <div className="point-time">{ticketDetails.arrivalTime || 'N/A'}</div>
                <div className="point-city">{ticketDetails.destinationCity}</div>
                <div className="point-location">{ticketDetails.droppingPoint}</div>
              </div>
            </div>

            {/* Journey Date */}
            <div className="journey-date">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              {formatDate(ticketDetails.journeyDate)}
            </div>

            {/* Bus Details */}
            <div className="bus-details-section">
              <h3>Bus Details</h3>
              <div className="bus-info-grid">
                <div className="info-item">
                  <span className="label">Operator</span>
                  <span className="value">{ticketDetails.serviceProvider}</span>
                </div>
                <div className="info-item">
                  <span className="label">Bus Type</span>
                  <span className="value">{ticketDetails.serviceType}</span>
                </div>
                {ticketDetails.serviceProviderContact && (
                  <div className="info-item">
                    <span className="label">Contact</span>
                    <span className="value">{ticketDetails.serviceProviderContact}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Traveler Details */}
            <div className="traveler-details-section">
              <h3>Passenger Details</h3>
              <div className="travelers-list">
                {ticketDetails.travelerDetails?.map((traveler, index) => (
                  <div key={index} className="traveler-item">
                    <div className="traveler-info">
                      <span className="traveler-name">
                        {traveler.name} {traveler.lastName}
                      </span>
                      <span className="traveler-meta">
                        {traveler.age} yrs • {traveler.gender === 'M' ? 'Male' : 'Female'}
                      </span>
                    </div>
                    <div className="traveler-seat">
                      <span className="seat-label">Seat</span>
                      <span className="seat-number">{traveler.seatNo}</span>
                    </div>
                    <div className="traveler-fare">
                      <span className="fare-label">Fare</span>
                      <span className="fare-amount">₹{traveler.fare || 0}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Booking Info */}
            <div className="booking-info-section">
              <h3>Booking Information</h3>
              <div className="booking-info-grid">
                {ticketDetails.bookingDate && (
                  <div className="info-item">
                    <span className="label">Booked On</span>
                    <span className="value">{formatDate(ticketDetails.bookingDate)}</span>
                  </div>
                )}
                {ticketDetails.cancelDate && (
                  <div className="info-item">
                    <span className="label">Cancelled On</span>
                    <span className="value">{formatDate(ticketDetails.cancelDate)}</span>
                  </div>
                )}
                {ticketDetails.refundAmount && (
                  <div className="info-item">
                    <span className="label">Refund Amount</span>
                    <span className="value refund">₹{ticketDetails.refundAmount}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Cancellation Policy */}
            {ticketDetails.cancellationPolicy && (
              <div className="cancellation-policy-section">
                <h3>Cancellation Policy</h3>
                <div className="policy-list">
                  {(() => {
                    try {
                      const policies = typeof ticketDetails.cancellationPolicy === 'string' 
                        ? JSON.parse(ticketDetails.cancellationPolicy) 
                        : ticketDetails.cancellationPolicy;
                      
                      return policies.map((policy, index) => (
                        <div key={index} className="policy-item">
                          <span className="policy-time">
                            {policy.cutoffTime} hrs before departure
                          </span>
                          <span className="policy-refund">
                            {policy.refundInPercentage}% refund
                          </span>
                        </div>
                      ));
                    } catch {
                      return <p className="policy-text">{ticketDetails.cancellationPolicy}</p>;
                    }
                  })()}
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="action-buttons">
            {ticketDetails.ticketStatus?.toUpperCase() === 'CONFIRMED' && (
              <>
                <button className="download-btn" onClick={handleDownloadTicket}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Download Ticket
                </button>
                <button className="cancel-btn" onClick={openCancelModal}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="15" y1="9" x2="9" y2="15"/>
                    <line x1="9" y1="9" x2="15" y2="15"/>
                  </svg>
                  Cancel Ticket
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Cancel Modal */}
      {showCancelModal && (
        <div className="cancel-modal-overlay" onClick={closeCancelModal}>
          <div className="cancel-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cancel-modal-header">
              <h3>Cancel Ticket</h3>
              <button className="close-btn" onClick={closeCancelModal}>✕</button>
            </div>
            
            <div className="cancel-modal-body">
              {cancelSuccess ? (
                <div className="success-message">
                  <span className="success-icon">✓</span>
                  <p>{cancelSuccess}</p>
                </div>
              ) : isLoadingCancellation ? (
                <div className="loading-state">
                  <div className="spinner"></div>
                  <p>Loading cancellation details...</p>
                </div>
              ) : (
                <>
                  <div className="cancel-info">
                    <p className="warning-text">Are you sure you want to cancel this ticket?</p>
                    
                    <div className="ticket-summary">
                      <p><strong>Route:</strong> {ticketDetails.sourceCity} → {ticketDetails.destinationCity}</p>
                      <p><strong>Date:</strong> {formatDate(ticketDetails.journeyDate)}</p>
                      <p><strong>Ticket No:</strong> {ticketDetails.etsTicketNumber}</p>
                    </div>

                    {cancellationDetails && (
                      <div className="cancellation-breakdown">
                        <h4>Cancellation Charges</h4>
                        <div className="breakdown-item">
                          <span>Total Ticket Fare:</span>
                          <span>₹{cancellationDetails.totalTicketFare}</span>
                        </div>
                        <div className="breakdown-item charges">
                          <span>Cancellation Charges ({cancellationDetails.cancelChargesPercentage}):</span>
                          <span>-₹{cancellationDetails.cancellationCharges}</span>
                        </div>
                        <div className="breakdown-item refund">
                          <span>Refund Amount:</span>
                          <span>₹{cancellationDetails.totalRefundAmount}</span>
                        </div>
                      </div>
                    )}

                    {cancelError && (
                      <div className="error-message">
                        <p>{cancelError}</p>
                      </div>
                    )}
                  </div>

                  <div className="modal-actions">
                    <button className="keep-btn" onClick={closeCancelModal} disabled={isCancelling}>
                      Keep Ticket
                    </button>
                    <button 
                      className="confirm-cancel-btn" 
                      onClick={handleCancelTicket}
                      disabled={isCancelling || !cancellationDetails}
                    >
                      {isCancelling ? 'Cancelling...' : 'Confirm Cancel'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <Footer />
    </>
  );
}
