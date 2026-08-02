/**
 * MyBookings Component - Display and manage the user's booking history.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Armchair,
  AlertTriangle,
  ArrowRight,
  BusFront,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Download,
  IndianRupee,
  MapPin,
  Route,
  Search,
  Sparkles,
  TicketCheck,
  UserRound,
  UsersRound,
  WalletCards,
  X,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Header from './Header';
import Footer from './Footer';
import { generateTicketPDF } from '../utils/ticketGenerator';
import { flushPendingBookingUpdates } from '../utils/bookingSync';
import { bus, user as userApi } from '../services/api';
import './MyBookings.css';

const TABS = ['All', 'Upcoming', 'Completed', 'Failed', 'Cancelled'];

const TAB_STATUSES = {
  Upcoming: ['confirmed', 'pending'],
  Completed: ['completed'],
  Failed: ['failed'],
  Cancelled: ['cancelled'],
};

const STATUS_META = {
  confirmed: { label: 'Confirmed', className: 'confirmed' },
  pending: { label: 'Pending', className: 'pending' },
  completed: { label: 'Completed', className: 'completed' },
  cancelled: { label: 'Cancelled', className: 'cancelled' },
  failed: { label: 'Failed', className: 'failed' },
};

const getStatusMeta = (status) => (
  STATUS_META[String(status || '').toLowerCase()] || {
    label: status || 'Unknown',
    className: 'unknown',
  }
);

const formatDate = (dateString) => {
  if (!dateString) return 'Date unavailable';

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return String(dateString);

  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const getDayName = (dateString) => {
  if (!dateString) return '';

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleDateString('en-IN', { weekday: 'long' });
};

const formatCurrency = (value) => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
}).format(Number(value) || 0);

const formatLocation = (location, fallback) => {
  if (!location) return fallback;
  if (typeof location === 'string') return location;

  return location.name
    || location.Name
    || location.location
    || location.Location
    || location.address
    || location.Address
    || location.landmark
    || fallback;
};

const getBookingSeats = (booking) => {
  const directSeats = booking.selectedSeats?.length ? booking.selectedSeats : booking.seats;
  if (directSeats?.length) return directSeats;

  return booking.passengers
    ?.map((passenger) => passenger.seatNumber || passenger.seatNbr)
    .filter(Boolean) || [];
};

export default function MyBookings() {
  const { isAuthenticated, getBookings, reconcileBookings, updateBooking, isLoading: authLoading, user } = useAuth();
  const navigate = useNavigate();

  const [bookings, setBookings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('All');
  const [expandedCard, setExpandedCard] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancellingBooking, setCancellingBooking] = useState(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [cancelSuccess, setCancelSuccess] = useState('');
  const [cancellationDetails, setCancellationDetails] = useState(null);
  const [isLoadingCancellation, setIsLoadingCancellation] = useState(false);

  const fetchBookings = useCallback(async (options = {}) => {
    const silent = options?.silent === true;
    if (!silent) setIsLoading(true);
    setError('');

    await flushPendingBookingUpdates(updateBooking);
    let result = options?.reconcile === true ? await reconcileBookings() : await getBookings();
    if (!result.success && options?.reconcile === true) {
      result = await getBookings();
    }

    if (result.success) {
      setBookings(result.bookings || []);
    } else if (!silent) {
      setError(result.message || 'Failed to load bookings');
    }

    if (!silent) setIsLoading(false);
  }, [getBookings, reconcileBookings, updateBooking]);

  useEffect(() => {
    if (authLoading) return;

    if (!isAuthenticated) {
      navigate('/');
      return;
    }

    fetchBookings({ reconcile: true });
  }, [authLoading, fetchBookings, isAuthenticated, navigate]);

  useEffect(() => {
    if (!isAuthenticated || authLoading) return undefined;

    const refreshSavedBookings = () => {
      if (document.visibilityState === 'visible') fetchBookings({ silent: true });
    };
    const reconcileVisibleDashboard = () => {
      if (document.visibilityState === 'visible') fetchBookings({ silent: true, reconcile: true });
    };
    const intervalId = window.setInterval(refreshSavedBookings, 30000);

    window.addEventListener('focus', reconcileVisibleDashboard);
    document.addEventListener('visibilitychange', reconcileVisibleDashboard);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', reconcileVisibleDashboard);
      document.removeEventListener('visibilitychange', reconcileVisibleDashboard);
    };
  }, [authLoading, fetchBookings, isAuthenticated]);

  useEffect(() => {
    if (!showCancelModal) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !isCancelling) {
        setShowCancelModal(false);
        setCancellingBooking(null);
        setCancelError('');
        setCancellationDetails(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isCancelling, showCancelModal]);

  const filteredBookings = useMemo(() => {
    let filtered = bookings;

    if (activeTab !== 'All') {
      const statuses = TAB_STATUSES[activeTab] || [];
      filtered = filtered.filter((booking) => (
        statuses.includes(String(booking.status || '').toLowerCase())
      ));
    }

    const query = searchQuery.trim().toLowerCase();
    if (!query) return filtered;

    return filtered.filter((booking) => [
      booking.bookingId,
      booking.pnr,
      booking.ticketNo,
      booking.busName,
      booking.fromCity || booking.source,
      booking.toCity || booking.destination,
    ].some((value) => String(value || '').toLowerCase().includes(query)));
  }, [activeTab, bookings, searchQuery]);

  const bookingStats = useMemo(() => ({
    total: bookings.length,
    upcoming: bookings.filter((booking) => (
      TAB_STATUSES.Upcoming.includes(String(booking.status || '').toLowerCase())
    )).length,
    completed: bookings.filter((booking) => (
      String(booking.status || '').toLowerCase() === 'completed'
    )).length,
  }), [bookings]);

  const getTabCount = (tab) => {
    if (tab === 'All') return bookings.length;
    const statuses = TAB_STATUSES[tab] || [];
    return bookings.filter((booking) => (
      statuses.includes(String(booking.status || '').toLowerCase())
    )).length;
  };

  const closeCancelModal = () => {
    setShowCancelModal(false);
    setCancellingBooking(null);
    setCancelError('');
    setCancellationDetails(null);
  };

  const getCancellationDetails = async (booking) => {
    setIsLoadingCancellation(true);
    setCancelError('');

    try {
      const etsTicketNo = booking.ticketNo || booking.etsTicketNumber || booking.externalBookingId;
      const seatNbrsToCancel = getBookingSeats(booking);

      if (!etsTicketNo || seatNbrsToCancel.length === 0) {
        setCancelError(!etsTicketNo
          ? 'Ticket number not found. Please contact support for cancellation.'
          : 'Seat information is missing. Please contact support.');
        return;
      }

      const result = await bus.cancelTicketConfirmation(etsTicketNo, seatNbrsToCancel);

      if (result.success && result.cancellable) {
        setCancellationDetails({
          etsTicketNo,
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
    } catch (cancellationError) {
      console.error('Get cancellation details error:', cancellationError);
      setCancelError(cancellationError.message || 'Failed to get cancellation details. Please try again.');
    } finally {
      setIsLoadingCancellation(false);
    }
  };

  const openCancelModal = async (booking) => {
    setCancellingBooking(booking);
    setCancelError('');
    setCancelSuccess('');
    setCancellationDetails(null);
    setShowCancelModal(true);
    await getCancellationDetails(booking);
  };

  const handleCancelTicket = async () => {
    if (!cancellingBooking || !cancellationDetails) return;

    setIsCancelling(true);
    setCancelError('');

    try {
      const { etsTicketNo, seatNbrsToCancel } = cancellationDetails;
      const result = await bus.cancelBooking(etsTicketNo, seatNbrsToCancel);

      if (result.success) {
        const refundMessage = result.totalRefundAmount
          ? `Refund of ${formatCurrency(result.totalRefundAmount)} will be processed within 5–7 business days.`
          : 'Your refund will be processed according to the cancellation policy.';

        setCancelSuccess(`Ticket cancelled successfully. ${refundMessage}`);

        const bookingDbId = cancellingBooking.id || cancellingBooking._id;
        setBookings((previousBookings) => previousBookings.map((booking) => {
          const bookingId = booking.id || booking._id;
          return bookingId === bookingDbId
            ? { ...booking, status: 'cancelled', refundAmount: result.totalRefundAmount }
            : booking;
        }));

        if (bookingDbId) {
          try {
            await userApi.updateBooking(bookingDbId, {
              status: 'cancelled',
              refundAmount: parseFloat(result.totalRefundAmount) || 0,
              refundStatus: 'processing',
            });
          } catch (databaseError) {
            console.error('Failed to update booking status in DB:', databaseError);
          }
        }

        window.setTimeout(() => {
          closeCancelModal();
          setCancelSuccess('');
          fetchBookings();
        }, 3000);
      } else {
        setCancelError(result.message || 'Cancellation failed. Please try again or contact support.');
      }
    } catch (cancellationError) {
      console.error('Cancel ticket error:', cancellationError);
      setCancelError(cancellationError.message || 'Failed to cancel ticket. Please try again or contact support.');
    } finally {
      setIsCancelling(false);
    }
  };

  const downloadTicket = (booking) => {
    generateTicketPDF({
      bookingId: booking.bookingId,
      ticketNo: booking.ticketNo || booking.externalBookingId,
      pnr: booking.pnr,
      busName: booking.busName,
      busType: booking.busType,
      serviceNo: booking.busNumber,
      status: booking.status,
      fromCity: booking.fromCity || booking.source,
      toCity: booking.toCity || booking.destination,
      journeyDate: booking.journeyDate,
      boardingPoint: booking.boardingPoint,
      droppingPoint: booking.droppingPoint,
      departureTime: booking.departureTime,
      arrivalTime: booking.arrivalTime,
      seats: getBookingSeats(booking),
      passengers: booking.passengers,
      totalFare: booking.totalFare,
      paymentId: booking.paymentId,
    });
  };

  const firstName = user?.name?.trim().split(/\s+/)[0];
  const userInitial = firstName?.charAt(0).toUpperCase() || 'U';
  const userContact = user?.email || user?.phone || 'Sancharie traveller';

  if (authLoading) {
    return (
      <>
        <Header />
        <main className="my-bookings-page">
          <div className="bookings-state" role="status">
            <span className="bookings-spinner" aria-hidden="true" />
            <p>Preparing your journeys…</p>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="my-bookings-page">
        <div className="bookings-orbit bookings-orbit-one" aria-hidden="true" />
        <div className="bookings-orbit bookings-orbit-two" aria-hidden="true" />

        <div className="bookings-shell">
          <aside className="bookings-sidebar">
            <div className="bookings-profile">
              <div className="bookings-avatar">
                {user?.profileImage ? (
                  <img src={user.profileImage} alt={`${firstName || 'User'} profile`} />
                ) : (
                  <span>{userInitial}</span>
                )}
                <span className="bookings-avatar-status" aria-label="Signed in" />
              </div>
              <div className="bookings-profile-copy">
                <span>Welcome back</span>
                <strong>{firstName || 'Traveller'}</strong>
                <small title={userContact}>{userContact}</small>
              </div>
            </div>

            <nav className="bookings-nav" aria-label="Account navigation">
              <button className="bookings-nav-item active" type="button" aria-current="page">
                <span><TicketCheck size={18} />My bookings</span>
                <span className="bookings-nav-count">{bookings.length}</span>
              </button>
              <button className="bookings-nav-item" type="button" onClick={() => navigate('/profile')}>
                <span><UserRound size={18} />My profile</span>
                <ArrowRight size={17} />
              </button>
              <button className="bookings-nav-item" type="button" disabled>
                <span><WalletCards size={18} />Wallet & cards</span>
                <small>Soon</small>
              </button>
            </nav>

            <div className="bookings-sidebar-cta">
              <span className="bookings-cta-icon"><BusFront size={21} /></span>
              <div>
                <strong>Where to next?</strong>
                <p>Discover a new route and make another memory.</p>
              </div>
              <button type="button" onClick={() => navigate('/')}>
                Explore buses <ArrowRight size={16} />
              </button>
            </div>
          </aside>

          <section className="bookings-content" aria-labelledby="bookings-title">
            <header className="bookings-hero">
              <div className="bookings-hero-route" aria-hidden="true">
                <span />
                <BusFront size={30} />
                <span />
              </div>
              <div className="bookings-hero-copy">
                <div className="bookings-eyebrow"><Sparkles size={15} /> Your travel story</div>
                <h1 id="bookings-title">
                  {firstName ? `${firstName}’s journeys,` : 'Your journeys,'}<br />
                  <span>beautifully organised.</span>
                </h1>
                <p>Every ticket, route and travel detail is ready when you need it.</p>
              </div>
              <div className="bookings-stats" aria-label="Booking summary">
                <div>
                  <strong>{bookingStats.total}</strong>
                  <span>All journeys</span>
                </div>
                <div>
                  <strong>{bookingStats.upcoming}</strong>
                  <span>Ready to go</span>
                </div>
                <div>
                  <strong>{bookingStats.completed}</strong>
                  <span>Memories made</span>
                </div>
              </div>
            </header>

            <div className="bookings-toolbar">
              <div>
                <span className="bookings-toolbar-kicker">Journey vault</span>
                <h2>Your tickets</h2>
              </div>
              <label className="bookings-search">
                <Search size={19} aria-hidden="true" />
                <span className="sr-only">Search bookings</span>
                <input
                  type="search"
                  placeholder="Search route, bus or booking ID"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
                {searchQuery && (
                  <button type="button" onClick={() => setSearchQuery('')} aria-label="Clear search">
                    <X size={17} />
                  </button>
                )}
              </label>
            </div>

            <div className="booking-tabs" role="tablist" aria-label="Filter bookings by status">
              {TABS.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab}
                  className={`booking-tab ${activeTab === tab ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab}<span>{getTabCount(tab)}</span>
                </button>
              ))}
            </div>

            {isLoading ? (
              <div className="bookings-state" role="status">
                <span className="bookings-spinner" aria-hidden="true" />
                <h3>Gathering your tickets</h3>
                <p>Just a moment while we fetch your journeys.</p>
              </div>
            ) : error ? (
              <div className="bookings-state bookings-error" role="alert">
                <span className="bookings-state-icon"><XCircle size={30} /></span>
                <h3>We couldn’t load your journeys</h3>
                <p>{error}</p>
                <button type="button" onClick={fetchBookings}>Try again</button>
              </div>
            ) : filteredBookings.length === 0 ? (
              <div className="bookings-state bookings-empty">
                <div className="empty-ticket" aria-hidden="true">
                  <TicketCheck size={42} />
                  <span />
                </div>
                <h3>{searchQuery ? 'No matching tickets' : `No ${activeTab === 'All' ? '' : activeTab.toLowerCase()} journeys yet`}</h3>
                <p>
                  {searchQuery
                    ? 'Try another route, operator or booking reference.'
                    : 'Your next adventure deserves a place on this page.'}
                </p>
                {searchQuery ? (
                  <button type="button" onClick={() => setSearchQuery('')}>Clear search</button>
                ) : (
                  <button type="button" onClick={() => navigate('/')}>Find your next bus</button>
                )}
              </div>
            ) : (
              <div className="bookings-list">
                <div className="bookings-result-note">
                  <span>{filteredBookings.length} {filteredBookings.length === 1 ? 'journey' : 'journeys'}</span>
                  <span>Tap a ticket to see all details</span>
                </div>

                {filteredBookings.map((booking) => {
                  const bookingKey = booking.id || booking._id || booking.bookingId;
                  const isExpanded = expandedCard === bookingKey;
                  const status = getStatusMeta(booking.status);
                  const origin = booking.fromCity || booking.source || 'Origin';
                  const destination = booking.toCity || booking.destination || 'Destination';
                  const seats = getBookingSeats(booking);
                  const statusKey = String(booking.status || '').toLowerCase();
                  const canManage = statusKey === 'confirmed';

                  return (
                    <article
                      key={bookingKey}
                      className={`booking-card status-${status.className} ${isExpanded ? 'expanded' : ''}`}
                    >
                      <button
                        type="button"
                        className="booking-card-summary"
                        aria-expanded={isExpanded}
                        aria-controls={`booking-details-${bookingKey}`}
                        onClick={() => setExpandedCard(isExpanded ? null : bookingKey)}
                      >
                        <div className="booking-card-topline">
                          <div className="booking-date">
                            <span><CalendarDays size={16} />{getDayName(booking.journeyDate)}</span>
                            <strong>{formatDate(booking.journeyDate)}</strong>
                          </div>
                          <div className="booking-reference">
                            <span>Booking ID</span>
                            <strong>{booking.bookingId || 'Not available'}</strong>
                          </div>
                          <span className={`booking-status ${status.className}`}>
                            <span aria-hidden="true" />{status.label}
                          </span>
                        </div>

                        <div className="booking-route">
                          <div className="booking-route-stop">
                            <span>{booking.departureTime || '—'}</span>
                            <strong>{origin}</strong>
                            <small>Departure</small>
                          </div>
                          <div className="booking-route-line" aria-hidden="true">
                            <span />
                            <div><BusFront size={20} /></div>
                            <span />
                          </div>
                          <div className="booking-route-stop destination">
                            <span>{booking.arrivalTime || '—'}</span>
                            <strong>{destination}</strong>
                            <small>Arrival</small>
                          </div>
                        </div>

                        <div className="booking-card-footer">
                          <div className="booking-operator">
                            <span className="booking-operator-icon"><BusFront size={19} /></span>
                            <span>
                              <strong>{booking.busName || 'Bus operator'}</strong>
                              <small>{booking.busType || booking.serviceType || 'Travel service'}</small>
                            </span>
                          </div>
                          <div className="booking-card-facts">
                            <span><Armchair size={16} /> {seats.length ? seats.join(', ') : 'Seat —'}</span>
                            <span><UsersRound size={16} /> {booking.passengers?.length || seats.length || 1}</span>
                            <strong>{formatCurrency(booking.totalFare)}</strong>
                          </div>
                          <span className="booking-expand-label">
                            {isExpanded ? 'Hide details' : 'View details'}
                            <ChevronDown size={18} />
                          </span>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="booking-card-details" id={`booking-details-${bookingKey}`}>
                          <div className="booking-detail-grid">
                            <div className="booking-detail-item">
                              <span className="detail-icon"><MapPin size={18} /></span>
                              <div>
                                <small>Boarding point</small>
                                <strong>{formatLocation(booking.boardingPoint, 'Not provided')}</strong>
                              </div>
                            </div>
                            <div className="booking-detail-item">
                              <span className="detail-icon"><Route size={18} /></span>
                              <div>
                                <small>Dropping point</small>
                                <strong>{formatLocation(booking.droppingPoint, 'Not provided')}</strong>
                              </div>
                            </div>
                            <div className="booking-detail-item">
                              <span className="detail-icon"><Clock3 size={18} /></span>
                              <div>
                                <small>Departure time</small>
                                <strong>{booking.departureTime || 'Not provided'}</strong>
                              </div>
                            </div>
                            <div className="booking-detail-item">
                              <span className="detail-icon"><TicketCheck size={18} /></span>
                              <div>
                                <small>PNR / Ticket</small>
                                <strong>{booking.pnr || booking.ticketNo || 'Not available'}</strong>
                              </div>
                            </div>
                            <div className="booking-detail-item">
                              <span className="detail-icon"><CheckCircle2 size={18} /></span>
                              <div>
                                <small>Provider status</small>
                                <strong>{booking.providerStatus || 'Awaiting provider update'}</strong>
                                {booking.lastReconciledAt && <small>Checked {formatDate(booking.lastReconciledAt)}</small>}
                              </div>
                            </div>
                          </div>

                          <div className="booking-passengers">
                            <div className="booking-section-heading">
                              <div><UsersRound size={18} /><span>Travellers</span></div>
                              <small>{booking.passengers?.length || seats.length || 1} passenger(s)</small>
                            </div>
                            <div className="booking-passenger-list">
                              {booking.passengers?.length ? booking.passengers.map((passenger, index) => (
                                <div className="booking-passenger" key={passenger._id || `${passenger.name}-${index}`}>
                                  <span className="passenger-initial">{passenger.name?.charAt(0).toUpperCase() || 'P'}</span>
                                  <span>
                                    <strong>{passenger.name || 'Passenger'}</strong>
                                    <small>{passenger.age ? `${passenger.age} years` : 'Age not provided'}</small>
                                  </span>
                                  <span className="passenger-seat-pill">
                                    <Armchair size={15} /> Seat {passenger.seatNumber || seats[index] || '—'}
                                  </span>
                                </div>
                              )) : (
                                <div className="booking-passenger">
                                  <span className="passenger-initial">P</span>
                                  <span><strong>Passenger</strong><small>Traveller details</small></span>
                                  <span className="passenger-seat-pill"><Armchair size={15} /> Seat {seats.join(', ') || '—'}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="booking-payment-row">
                            <div>
                              <span className="detail-icon"><IndianRupee size={18} /></span>
                              <span>
                                <small>Payment</small>
                                <strong>{booking.paymentStatus === 'completed' ? 'Payment completed' : booking.paymentStatus || 'Pending'}</strong>
                              </span>
                            </div>
                            <div>
                              <small>{booking.paymentStatus === 'completed' ? 'Total paid' : 'Booking amount'}</small>
                              <strong>{formatCurrency(booking.totalFare)}</strong>
                            </div>
                          </div>

                          {booking.paymentIssue && (
                            <div className="booking-payment-warning" role="status">
                              <AlertTriangle size={19} />
                              <div>
                                <strong>{booking.paymentIssue === 'duplicate_payment' ? 'Duplicate payment detected' : 'Payment needs review'}</strong>
                                <p>{booking.paymentNote || 'This payment requires manual review.'}</p>
                                {booking.relatedPaymentIds?.length > 0 && (
                                  <small>Payment references: {booking.relatedPaymentIds.join(', ')}</small>
                                )}
                              </div>
                            </div>
                          )}

                          {statusKey === 'failed' && (
                            <div className="booking-failure-detail" role="status">
                              <XCircle size={19} />
                              <div>
                                <strong>Booking attempt failed{booking.failureStage ? ` during ${booking.failureStage.replaceAll('_', ' ')}` : ''}</strong>
                                <p>{booking.failureReason || 'The booking could not be completed. No ticket was issued.'}</p>
                                {booking.paymentStatus === 'completed' && (
                                  <small>Payment was completed. Please contact support before trying to pay again.</small>
                                )}
                              </div>
                            </div>
                          )}

                          {canManage && (
                            <div className="booking-actions">
                              {statusKey === 'confirmed' && (
                                <button type="button" className="download-ticket-btn" onClick={() => downloadTicket(booking)}>
                                  <Download size={17} /> Download ticket
                                </button>
                              )}
                              <button type="button" className="cancel-ticket-btn" onClick={() => openCancelModal(booking)}>
                                <XCircle size={17} /> Cancel ticket
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </main>

      {showCancelModal && (
        <div className="cancel-modal-overlay" onMouseDown={closeCancelModal}>
          <div
            className="cancel-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="cancel-modal-header">
              <div>
                <span className="cancel-modal-icon"><XCircle size={20} /></span>
                <div>
                  <small>Booking change</small>
                  <h3 id="cancel-modal-title">Cancel ticket?</h3>
                </div>
              </div>
              <button className="close-modal-btn" type="button" onClick={closeCancelModal} aria-label="Close cancellation dialog">
                <X size={21} />
              </button>
            </div>

            <div className="cancel-modal-body">
              {cancelSuccess ? (
                <div className="cancel-success-message">
                  <span><CheckCircle2 size={34} /></span>
                  <h4>Cancellation complete</h4>
                  <p>{cancelSuccess}</p>
                </div>
              ) : isLoadingCancellation ? (
                <div className="loading-cancellation" role="status">
                  <span className="bookings-spinner" aria-hidden="true" />
                  <h4>Checking your refund</h4>
                  <p>We’re fetching the cancellation terms for this ticket.</p>
                </div>
              ) : (
                <>
                  <p className="cancel-warning">Review the journey and refund details before you confirm.</p>
                  <div className="cancel-trip-card">
                    <div>
                      <span>{cancellingBooking?.departureTime || 'Journey'}</span>
                      <strong>{cancellingBooking?.fromCity || cancellingBooking?.source || 'Origin'}</strong>
                    </div>
                    <ArrowRight size={19} />
                    <div>
                      <span>{formatDate(cancellingBooking?.journeyDate)}</span>
                      <strong>{cancellingBooking?.toCity || cancellingBooking?.destination || 'Destination'}</strong>
                    </div>
                  </div>
                  <div className="cancel-reference-row">
                    <span>{cancellingBooking?.busName || 'Bus operator'}</span>
                    <span>{cancellingBooking?.bookingId || 'Booking ID unavailable'}</span>
                  </div>

                  {cancellationDetails && (
                    <div className="cancellation-details-card">
                      <div className="cancellation-card-title">
                        <span>Refund summary</span>
                        <small>{cancellationDetails.cancelChargesPercentage || 'Policy applied'}</small>
                      </div>
                      <div className="cancellation-breakdown">
                        <div><span>Ticket fare</span><strong>{formatCurrency(cancellationDetails.totalTicketFare)}</strong></div>
                        <div><span>Cancellation fee</span><strong className="negative">− {formatCurrency(cancellationDetails.cancellationCharges)}</strong></div>
                        <div className="refund-total"><span>You’ll receive</span><strong>{formatCurrency(cancellationDetails.totalRefundAmount)}</strong></div>
                      </div>
                      {cancellationDetails.partiallyCancellable && (
                        <p className="partial-note">Partial cancellation is available for this ticket.</p>
                      )}
                    </div>
                  )}

                  {!cancellationDetails && cancellingBooking?.cancelPolicy?.length > 0 && (
                    <div className="cancellation-policy">
                      <h4>Cancellation policy</h4>
                      <ul>
                        {cancellingBooking.cancelPolicy.map((policy, index) => (
                          <li key={`${policy.PolicyString || policy.CancellationCharge}-${index}`}>
                            {policy.PolicyString || policy.CancellationCharge || `${policy.ChargeType}: ${policy.ChargeAmount}`}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {cancelError && <div className="cancel-error-message" role="alert">{cancelError}</div>}
                </>
              )}
            </div>

            {!cancelSuccess && !isLoadingCancellation && (
              <div className="cancel-modal-actions">
                <button className="keep-ticket-btn" type="button" onClick={closeCancelModal} disabled={isCancelling}>
                  Keep my ticket
                </button>
                <button
                  className="confirm-cancel-btn"
                  type="button"
                  onClick={handleCancelTicket}
                  disabled={isCancelling || !cancellationDetails}
                >
                  {isCancelling ? <><span className="btn-spinner" />Cancelling…</> : 'Confirm cancellation'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <Footer />
    </>
  );
}
