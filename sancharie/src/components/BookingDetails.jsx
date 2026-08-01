/**
 * BookingDetails Component
 * Displays detailed ticket information fetched from ETS API using getTicketByETSTNumber
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Armchair,
  BusFront,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  Download,
  Headphones,
  IndianRupee,
  Info,
  MapPin,
  Phone,
  ReceiptText,
  Route,
  ShieldCheck,
  Ticket,
  UserRound,
  X,
  XCircle,
} from 'lucide-react';
import { bus } from '../services/api';
import Header from './Header';
import Footer from './Footer';
import { generateTicketPDF } from '../utils/ticketGenerator';
import './BookingDetails.css';

const STATUS_DETAILS = {
  CONFIRMED: {
    label: 'Booking confirmed',
    description: 'Your seat is reserved and ready for the journey.',
    className: 'confirmed',
    Icon: CheckCircle2,
  },
  CANCELLED: {
    label: 'Booking cancelled',
    description: 'This booking has been cancelled.',
    className: 'cancelled',
    Icon: XCircle,
  },
  TRAVELLED: {
    label: 'Journey completed',
    description: 'We hope you had a comfortable journey.',
    className: 'travelled',
    Icon: CheckCircle2,
  },
  SERVICE_CANCELLED: {
    label: 'Service cancelled',
    description: 'The operator has cancelled this service.',
    className: 'service-cancelled',
    Icon: AlertTriangle,
  },
};

const formatDate = (dateString) => {
  if (!dateString) return 'Not available';

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;

  return date.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const formatCurrency = (value) => {
  const amount = Number(value) || 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
};

const parseCancellationPolicy = (policy) => {
  if (!policy) return { items: [], text: '' };

  if (Array.isArray(policy)) return { items: policy, text: '' };

  if (typeof policy === 'string') {
    try {
      const parsed = JSON.parse(policy);
      return Array.isArray(parsed)
        ? { items: parsed, text: '' }
        : { items: [], text: policy };
    } catch {
      return { items: [], text: policy };
    }
  }

  return { items: [], text: '' };
};

export default function BookingDetails() {
  const { ticketNumber } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [ticketDetails, setTicketDetails] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copiedField, setCopiedField] = useState('');

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancellationDetails, setCancellationDetails] = useState(null);
  const [isLoadingCancellation, setIsLoadingCancellation] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [cancelSuccess, setCancelSuccess] = useState('');

  const etsTicketNumber = ticketNumber || location.state?.ticketNumber || location.state?.etsTicketNumber;

  const fetchTicketDetails = useCallback(async () => {
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
  }, [etsTicketNumber]);

  useEffect(() => {
    if (!etsTicketNumber) {
      setError('No ticket number provided');
      setIsLoading(false);
      return;
    }

    fetchTicketDetails();
  }, [etsTicketNumber, fetchTicketDetails]);

  const totalFare = useMemo(
    () => ticketDetails?.travelerDetails?.reduce(
      (sum, traveler) => sum + (Number(traveler.fare) || 0),
      0,
    ) || 0,
    [ticketDetails],
  );

  const closeCancelModal = () => {
    setShowCancelModal(false);
    setCancellationDetails(null);
    setCancelError('');
    setCancelSuccess('');
  };

  useEffect(() => {
    if (!showCancelModal) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !isCancelling) closeCancelModal();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showCancelModal, isCancelling]);

  const copyReference = async (value, field) => {
    if (!value) return;

    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      window.setTimeout(() => setCopiedField(''), 1800);
    } catch (copyError) {
      console.error('Unable to copy ticket reference:', copyError);
    }
  };

  const openCancelModal = async () => {
    if (!ticketDetails) return;

    setShowCancelModal(true);
    setIsLoadingCancellation(true);
    setCancelError('');
    setCancellationDetails(null);

    try {
      const seatNbrsToCancel = ticketDetails.travelerDetails?.map((traveler) => traveler.seatNo) || [];

      if (seatNbrsToCancel.length === 0) {
        setCancelError('No seats found to cancel');
        return;
      }

      const result = await bus.cancelTicketConfirmation(
        ticketDetails.etsTicketNumber,
        seatNbrsToCancel,
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

  const handleCancelTicket = async () => {
    if (!ticketDetails || !cancellationDetails) return;

    setIsCancelling(true);
    setCancelError('');

    try {
      const result = await bus.cancelBooking(
        ticketDetails.etsTicketNumber,
        cancellationDetails.seatNbrsToCancel,
      );

      if (result.success) {
        const refundMsg = result.totalRefundAmount
          ? `Refund of ${formatCurrency(result.totalRefundAmount)} will be processed within 5–7 business days.`
          : 'Refund will be processed as per the cancellation policy.';

        setCancelSuccess(`Ticket cancelled successfully. ${refundMsg}`);

        window.setTimeout(() => {
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
      seats: ticketDetails.travelerDetails?.map((traveler) => traveler.seatNo) || [],
      passengers: ticketDetails.travelerDetails?.map((traveler) => ({
        name: `${traveler.name} ${traveler.lastName || ''}`.trim(),
        age: traveler.age,
        gender: traveler.gender,
        seatNumber: traveler.seatNo,
      })) || [],
      totalFare,
    });
  };

  if (isLoading) {
    return (
      <>
        <Header />
        <main className="booking-details-page state-page">
          <div className="booking-state-card loading-container">
            <div className="ticket-loader" aria-hidden="true">
              <BusFront size={24} />
            </div>
            <h2>Getting your ticket ready</h2>
            <p>Fetching the latest trip and passenger details…</p>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  if (error || !ticketDetails) {
    return (
      <>
        <Header />
        <main className="booking-details-page state-page">
          <div className="booking-state-card error-container">
            <span className="state-icon" aria-hidden="true">
              {error ? <AlertTriangle size={30} /> : <Ticket size={30} />}
            </span>
            <h2>{error ? 'Unable to load your ticket' : 'Ticket not found'}</h2>
            <p>{error || 'The requested ticket could not be found.'}</p>
            <div className="error-actions">
              {error && (
                <button onClick={fetchTicketDetails} className="retry-btn" type="button">
                  Try again
                </button>
              )}
              <button onClick={() => navigate('/my-bookings')} className="back-btn" type="button">
                Back to bookings
              </button>
            </div>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  const normalizedStatus = ticketDetails.ticketStatus?.toUpperCase() || 'PENDING';
  const status = STATUS_DETAILS[normalizedStatus] || {
    label: ticketDetails.ticketStatus || 'Status pending',
    description: 'Check back later for the latest booking status.',
    className: 'pending',
    Icon: Info,
  };
  const StatusIcon = status.Icon;
  const travelers = ticketDetails.travelerDetails || [];
  const seatNumbers = travelers.map((traveler) => traveler.seatNo).filter(Boolean);
  const cancellationPolicy = parseCancellationPolicy(ticketDetails.cancellationPolicy);
  const isCancellable = normalizedStatus === 'CONFIRMED';

  const references = [
    { key: 'ticket', label: 'Ticket number', value: ticketDetails.etsTicketNumber },
    { key: 'pnr', label: 'Operator PNR', value: ticketDetails.opPNR },
    { key: 'trip', label: 'Trip code', value: ticketDetails.tripCode },
  ].filter((reference) => reference.value);

  return (
    <>
      <Header />
      <main className="booking-details-page">
        <div className="booking-details-container">
          <div className="details-header">
            <button className="back-button" onClick={() => navigate(-1)} type="button">
              <ArrowLeft size={19} />
              <span>My bookings</span>
            </button>
            <div className="details-title-copy">
              <span className="details-eyebrow">Your journey</span>
              <h1>Booking details</h1>
              <p>Everything you need for a smooth departure.</p>
            </div>
            <div className={`header-status-pill ${status.className}`}>
              <StatusIcon size={17} />
              <span>{status.label}</span>
            </div>
          </div>

          <div className="booking-content-grid">
            <article className="ticket-detail-card">
              <section className="ticket-cover">
                <div className="ticket-cover-orbit orbit-one" aria-hidden="true" />
                <div className="ticket-cover-orbit orbit-two" aria-hidden="true" />
                <div className="ticket-cover-topline">
                  <div className="operator-mark">
                    <span className="operator-icon"><BusFront size={22} /></span>
                    <div>
                      <span className="cover-kicker">Travelling with</span>
                      <h2>{ticketDetails.serviceProvider || 'Bus operator'}</h2>
                    </div>
                  </div>
                  <span className="service-type">{ticketDetails.serviceType || 'Bus service'}</span>
                </div>

                <div className="route-hero">
                  <div className="route-city route-city-origin">
                    <span className="route-time">{ticketDetails.departureTime || '--:--'}</span>
                    <strong>{ticketDetails.sourceCity || 'Origin'}</strong>
                    <span>{ticketDetails.boardingPoint || 'Boarding point to be confirmed'}</span>
                  </div>

                  <div className="route-track" aria-hidden="true">
                    <span className="route-dot" />
                    <span className="route-dash" />
                    <span className="route-bus"><BusFront size={18} /></span>
                    <span className="route-dash" />
                    <span className="route-dot destination" />
                  </div>

                  <div className="route-city route-city-destination">
                    <span className="route-time">{ticketDetails.arrivalTime || '--:--'}</span>
                    <strong>{ticketDetails.destinationCity || 'Destination'}</strong>
                    <span>{ticketDetails.droppingPoint || 'Dropping point to be confirmed'}</span>
                  </div>
                </div>

                <div className="booking-journey-date-chip">
                  <CalendarDays size={17} />
                  <span>{formatDate(ticketDetails.journeyDate)}</span>
                </div>
              </section>

              <section className="ticket-references" aria-label="Booking references">
                {references.map((reference) => (
                  <div className="ticket-reference" key={reference.key}>
                    <span>{reference.label}</span>
                    <div>
                      <strong>{reference.value}</strong>
                      <button
                        type="button"
                        className={`copy-reference ${copiedField === reference.key ? 'copied' : ''}`}
                        onClick={() => copyReference(reference.value, reference.key)}
                        aria-label={`Copy ${reference.label}`}
                        title={`Copy ${reference.label}`}
                      >
                        {copiedField === reference.key ? <Check size={14} /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>
                ))}
              </section>

              <div className="ticket-body">
                <section className="detail-section bus-details-section">
                  <div className="section-heading">
                    <span className="section-icon"><Route size={18} /></span>
                    <div>
                      <h3>Trip details</h3>
                      <p>Your service and boarding information</p>
                    </div>
                  </div>
                  <div className="info-card-grid">
                    <div className="info-card">
                      <span className="info-card-icon"><BusFront size={17} /></span>
                      <div><span>Operator</span><strong>{ticketDetails.serviceProvider || 'Not available'}</strong></div>
                    </div>
                    <div className="info-card">
                      <span className="info-card-icon"><Ticket size={17} /></span>
                      <div><span>Bus type</span><strong>{ticketDetails.serviceType || 'Not available'}</strong></div>
                    </div>
                    <div className="info-card">
                      <span className="info-card-icon"><MapPin size={17} /></span>
                      <div><span>Boarding point</span><strong>{ticketDetails.boardingPoint || 'Not available'}</strong></div>
                    </div>
                    {ticketDetails.serviceProviderContact && (
                      <div className="info-card">
                        <span className="info-card-icon"><Phone size={17} /></span>
                        <div><span>Operator contact</span><strong>{ticketDetails.serviceProviderContact}</strong></div>
                      </div>
                    )}
                  </div>
                </section>

                <section className="detail-section traveler-details-section">
                  <div className="section-heading section-heading-row">
                    <div className="section-heading-main">
                      <span className="section-icon"><UserRound size={18} /></span>
                      <div>
                        <h3>Passengers</h3>
                        <p>{travelers.length} {travelers.length === 1 ? 'traveller' : 'travellers'} on this booking</p>
                      </div>
                    </div>
                    <span className="booking-passenger-count">{travelers.length.toString().padStart(2, '0')}</span>
                  </div>
                  <div className="travelers-list">
                    {travelers.map((traveler, index) => (
                      <div key={`${traveler.seatNo || 'seat'}-${index}`} className="traveler-item">
                        <span className="traveler-avatar">{String(index + 1).padStart(2, '0')}</span>
                        <div className="traveler-info">
                          <span className="traveler-name">
                            {`${traveler.name || ''} ${traveler.lastName || ''}`.trim() || `Passenger ${index + 1}`}
                          </span>
                          <span className="traveler-meta">
                            {traveler.age ? `${traveler.age} yrs` : 'Age not added'}
                            {traveler.gender && ` · ${traveler.gender === 'M' ? 'Male' : traveler.gender === 'F' ? 'Female' : traveler.gender}`}
                          </span>
                        </div>
                        <div className="traveler-seat">
                          <span className="seat-label"><Armchair size={13} /> Seat</span>
                          <span className="seat-number">{traveler.seatNo || '—'}</span>
                        </div>
                        <div className="traveler-fare">
                          <span className="fare-label">Fare</span>
                          <span className="fare-amount">{formatCurrency(traveler.fare)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="detail-section booking-info-section">
                  <div className="section-heading">
                    <span className="section-icon"><ReceiptText size={18} /></span>
                    <div>
                      <h3>Booking information</h3>
                      <p>Important dates and refund information</p>
                    </div>
                  </div>
                  <div className="booking-info-grid">
                    <div className="booking-info-item">
                      <CalendarDays size={16} />
                      <span>Booked on</span>
                      <strong>{formatDate(ticketDetails.bookingDate)}</strong>
                    </div>
                    {ticketDetails.cancelDate && (
                      <div className="booking-info-item">
                        <XCircle size={16} />
                        <span>Cancelled on</span>
                        <strong>{formatDate(ticketDetails.cancelDate)}</strong>
                      </div>
                    )}
                    {ticketDetails.refundAmount && (
                      <div className="booking-info-item refund-info">
                        <IndianRupee size={16} />
                        <span>Refund amount</span>
                        <strong>{formatCurrency(ticketDetails.refundAmount)}</strong>
                      </div>
                    )}
                  </div>
                </section>

                {(cancellationPolicy.items.length > 0 || cancellationPolicy.text) && (
                  <section className="detail-section cancellation-policy-section">
                    <div className="section-heading">
                      <span className="section-icon"><ShieldCheck size={18} /></span>
                      <div>
                        <h3>Cancellation policy</h3>
                        <p>Refund eligibility before departure</p>
                      </div>
                    </div>
                    <div className="policy-list">
                      {cancellationPolicy.items.length > 0 ? cancellationPolicy.items.map((policy, index) => (
                        <div key={`${policy.cutoffTime}-${index}`} className="booking-policy-item">
                          <span className="policy-clock"><Clock3 size={16} /></span>
                          <div>
                            <span className="policy-time">Cancel {policy.cutoffTime} hrs before departure</span>
                            <span className="policy-note">Refund as per operator terms</span>
                          </div>
                          <span className="policy-refund">{policy.refundInPercentage}% refund</span>
                        </div>
                      )) : (
                        <p className="policy-text">{cancellationPolicy.text}</p>
                      )}
                    </div>
                  </section>
                )}
              </div>
            </article>

            <aside className="booking-side-panel">
              <section className={`status-card ${status.className}`}>
                <span className="status-card-icon"><StatusIcon size={22} /></span>
                <div>
                  <span className="status-kicker">Current status</span>
                  <h3>{status.label}</h3>
                  <p>{status.description}</p>
                </div>
              </section>

              <section className="fare-summary-card">
                <div className="side-card-heading">
                  <div>
                    <span className="side-card-kicker">Booking summary</span>
                    <h3>Trip total</h3>
                  </div>
                  <span className="summary-icon"><ReceiptText size={19} /></span>
                </div>
                <div className="summary-list">
                  <div><span>Passengers</span><strong>{travelers.length}</strong></div>
                  <div><span>Seats</span><strong>{seatNumbers.join(', ') || '—'}</strong></div>
                  <div><span>Journey</span><strong>{ticketDetails.sourceCity} → {ticketDetails.destinationCity}</strong></div>
                </div>
                <div className="fare-total">
                  <span>Total paid</span>
                  <strong>{formatCurrency(totalFare)}</strong>
                </div>
              </section>

              {isCancellable && (
                <div className="action-buttons">
                  <button className="download-btn" onClick={handleDownloadTicket} type="button">
                    <Download size={18} />
                    <span>Download ticket</span>
                  </button>
                  <button className="cancel-btn" onClick={openCancelModal} type="button">
                    <XCircle size={18} />
                    <span>Cancel booking</span>
                  </button>
                </div>
              )}

              <section className="help-card">
                <span className="help-icon"><Headphones size={20} /></span>
                <div>
                  <h3>Need help?</h3>
                  <p>Our support team can help with this booking.</p>
                </div>
              </section>
            </aside>
          </div>
        </div>
      </main>

      {showCancelModal && (
        <div className="booking-details-cancel-overlay" onClick={closeCancelModal} role="presentation">
          <div
            className="cancel-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-modal-title"
          >
            <div className="cancel-modal-header">
              <div className="modal-title-group">
                <span className="modal-warning-icon"><AlertTriangle size={19} /></span>
                <div>
                  <span>Review carefully</span>
                  <h3 id="cancel-modal-title">Cancel this booking?</h3>
                </div>
              </div>
              <button className="close-btn" onClick={closeCancelModal} type="button" aria-label="Close cancellation dialog">
                <X size={19} />
              </button>
            </div>

            <div className="cancel-modal-body">
              {cancelSuccess ? (
                <div className="success-message">
                  <span className="success-icon"><Check size={30} /></span>
                  <h4>Cancellation confirmed</h4>
                  <p>{cancelSuccess}</p>
                </div>
              ) : isLoadingCancellation ? (
                <div className="loading-state">
                  <div className="modal-loader" />
                  <h4>Checking your refund</h4>
                  <p>We’re calculating the latest cancellation charges…</p>
                </div>
              ) : (
                <>
                  <div className="cancel-info">
                    <p className="warning-text">This action applies to every passenger and seat on this ticket.</p>

                    <div className="ticket-summary">
                      <div><span>Route</span><strong>{ticketDetails.sourceCity} → {ticketDetails.destinationCity}</strong></div>
                      <div><span>Journey date</span><strong>{formatDate(ticketDetails.journeyDate)}</strong></div>
                      <div><span>Seats</span><strong>{seatNumbers.join(', ') || '—'}</strong></div>
                    </div>

                    {cancellationDetails && (
                      <div className="cancellation-breakdown">
                        <div className="breakdown-heading">
                          <h4>Refund breakdown</h4>
                          <span>{cancellationDetails.cancelChargesPercentage} charge</span>
                        </div>
                        <div className="breakdown-item">
                          <span>Total ticket fare</span>
                          <strong>{formatCurrency(cancellationDetails.totalTicketFare)}</strong>
                        </div>
                        <div className="breakdown-item charges">
                          <span>Cancellation charges</span>
                          <strong>−{formatCurrency(cancellationDetails.cancellationCharges)}</strong>
                        </div>
                        <div className="breakdown-item refund">
                          <span>You’ll receive</span>
                          <strong>{formatCurrency(cancellationDetails.totalRefundAmount)}</strong>
                        </div>
                      </div>
                    )}

                    {cancelError && (
                      <div className="error-message">
                        <AlertTriangle size={17} />
                        <p>{cancelError}</p>
                      </div>
                    )}
                  </div>

                  <div className="modal-actions">
                    <button className="keep-btn" onClick={closeCancelModal} disabled={isCancelling} type="button">
                      Keep my ticket
                    </button>
                    <button
                      className="confirm-cancel-btn"
                      onClick={handleCancelTicket}
                      disabled={isCancelling || !cancellationDetails}
                      type="button"
                    >
                      {isCancelling ? 'Cancelling…' : 'Confirm cancellation'}
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
