/**
 * MyBookings Component - Display user's booking history
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Header from './Header';
import Footer from './Footer';
import { generateTicketPDF } from '../services/ticketPdf';
import './MyBookings.css';

export default function MyBookings() {
  const { isAuthenticated, getBookings, isLoading: authLoading, user } = useAuth();
  const navigate = useNavigate();
  const [activeSidebarItem, setActiveSidebarItem] = useState('bookings');
  
  const [bookings, setBookings] = useState([]);
  const [filteredBookings, setFilteredBookings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('All');
  const [expandedCard, setExpandedCard] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const tabs = ['All', 'Upcoming', 'Completed', 'Failed', 'Cancelled'];

  useEffect(() => {
    if (authLoading) return;

    if (!isAuthenticated) {
      navigate('/');
      return;
    }

    fetchBookings();
  }, [isAuthenticated, authLoading, navigate]);

  useEffect(() => {
    filterBookings();
  }, [bookings, activeTab, searchQuery]);

  const fetchBookings = async () => {
    setIsLoading(true);
    setError('');

    const result = await getBookings();

    if (result.success) {
      setBookings(result.bookings || []);
    } else {
      setError(result.message || 'Failed to load bookings');
    }

    setIsLoading(false);
  };

  const filterBookings = () => {
    let filtered = [...bookings];

    // Filter by tab
    if (activeTab !== 'All') {
      const statusMap = {
        'Upcoming': ['confirmed', 'pending'],
        'Completed': ['completed'],
        'Failed': ['failed'],
        'Cancelled': ['cancelled']
      };
      const statuses = statusMap[activeTab] || [];
      filtered = filtered.filter(b => statuses.includes(b.status?.toLowerCase()));
    }

    // Filter by search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(b => 
        b.bookingId?.toLowerCase().includes(query) ||
        b.busName?.toLowerCase().includes(query) ||
        b.fromCity?.toLowerCase().includes(query) ||
        b.toCity?.toLowerCase().includes(query)
      );
    }

    setFilteredBookings(filtered);
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'confirmed':
      case 'completed':
        return '#38a169';
      case 'pending':
        return '#d69e2e';
      case 'cancelled':
        return '#d69e2e';
      case 'failed':
        return '#c53030';
      default:
        return '#666';
    }
  };

  const getStatusText = (status) => {
    switch (status?.toLowerCase()) {
      case 'confirmed':
        return 'Completed';
      case 'completed':
        return 'Completed';
      case 'pending':
        return 'Pending';
      case 'cancelled':
        return 'cancelled';
      case 'failed':
        return 'Failed';
      default:
        return status || 'Unknown';
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const getDayName = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', { weekday: 'long' });
  };

  const formatTime = (timeString) => {
    if (!timeString) return '';
    return timeString;
  };

  const toggleCard = (bookingId) => {
    setExpandedCard(expandedCard === bookingId ? null : bookingId);
  };

  if (authLoading) {
    return (
      <>
        <Header />
        <div className="my-bookings-page">
          <div className="loading-container">
            <div className="spinner"></div>
            <p>Loading...</p>
          </div>
        </div>
        <Footer />
      </>
    );
  }

  const truncateEmail = (email) => {
    if (!email) return '';
    if (email.length > 18) {
      return email.substring(0, 16) + '....';
    }
    return email;
  };

  const handleSidebarClick = (item) => {
    setActiveSidebarItem(item);
    if (item === 'profile') {
      navigate('/profile');
    } else if (item === 'wallet') {
      // Future: navigate to wallet page
    }
  };

  return (
    <>
      <Header />
      <div className="my-bookings-page">
        <div className="page-layout">
          {/* Left Sidebar */}
          <div className="sidebar">
            <div className="sidebar-profile">
              <div className="profile-avatar">
                {user?.profileImage ? (
                  <img src={user.profileImage} alt="Profile" />
                ) : (
                  user?.name ? user.name.charAt(0).toUpperCase() : 'U'
                )}
              </div>
              <span className="profile-email">{truncateEmail(user?.email || user?.phone || 'User')}</span>
            </div>
            <nav className="sidebar-nav">
              <button 
                className={`sidebar-item ${activeSidebarItem === 'bookings' ? 'active' : ''}`}
                onClick={() => handleSidebarClick('bookings')}
              >
                My Bookings
              </button>
              <button 
                className={`sidebar-item ${activeSidebarItem === 'profile' ? 'active' : ''}`}
                onClick={() => handleSidebarClick('profile')}
              >
                My Profile
              </button>
              <button 
                className={`sidebar-item ${activeSidebarItem === 'wallet' ? 'active' : ''}`}
                onClick={() => handleSidebarClick('wallet')}
              >
                Wallet/cards
              </button>
            </nav>
          </div>

          {/* Main Content */}
          <div className="bookings-container">
            {/* Header Section */}
            <div className="trips-header">
            <h1>My Trips</h1>
            <div className="search-box">
              <input 
                type="text" 
                placeholder="Search here" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/>
                <path d="M21 21l-4.35-4.35"/>
              </svg>
            </div>
          </div>

          {/* Filters Row */}
          <div className="filters-row">
            <div className="filter-dropdown">
              <span>Buses</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 9l6 6 6-6"/>
              </svg>
            </div>
            <div className="filter-dropdown">
              <span>Date</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 9l6 6 6-6"/>
              </svg>
            </div>
          </div>

          {/* Tabs */}
          <div className="booking-tabs">
            {tabs.map(tab => (
              <button 
                key={tab}
                className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Content */}
          {isLoading ? (
            <div className="loading-container">
              <div className="spinner"></div>
              <p>Loading your bookings...</p>
            </div>
          ) : error ? (
            <div className="error-container">
              <p>❌ {error}</p>
              <button onClick={fetchBookings}>Try Again</button>
            </div>
          ) : filteredBookings.length === 0 ? (
            <div className="no-bookings">
              <div className="no-bookings-icon">🎫</div>
              <h2>No Bookings Found</h2>
              <p>{activeTab === 'All' ? "You haven't made any bookings yet." : `No ${activeTab.toLowerCase()} bookings found.`}</p>
              <button onClick={() => navigate('/')}>Search Buses</button>
            </div>
          ) : (
            <div className="bookings-list">
              {filteredBookings.map((booking) => (
                <div 
                  key={booking._id} 
                  className={`trip-card ${expandedCard === booking._id ? 'expanded' : ''}`}
                  onClick={() => toggleCard(booking._id)}
                >
                  {/* Card Header - Always Visible */}
                  <div className="trip-card-main">
                    <div className="trip-date-section">
                      <div className="trip-date">{formatDate(booking.journeyDate)}</div>
                      <div className="trip-day">{getDayName(booking.journeyDate)}</div>
                      <div className="bus-icon-wrapper">
                        <svg className="bus-icon" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10zm3.5 1c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1.5-6H6V6h12v5z"/>
                        </svg>
                      </div>
                    </div>

                    <div className="trip-route-section">
                      <div className="route-name">
                        {booking.fromCity || booking.source || 'Origin'} - {booking.toCity || booking.destination || 'Destination'}
                      </div>
                      <div className="operator-name">{booking.busName || 'Bus Operator'}</div>
                    </div>

                    <div className="trip-boarding-section">
                      <div className="trip-id">Trip ID: {booking.bookingId}</div>
                      <div className="boarding-label">Boarding</div>
                      <div className="boarding-point">{booking.boardingPoint || 'Boarding Point'}</div>
                    </div>

                    <div className="trip-status-section">
                      <div className="status-label">Status</div>
                      <div 
                        className="status-value"
                        style={{ color: getStatusColor(booking.status) }}
                      >
                        {getStatusText(booking.status)}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {expandedCard === booking._id && (
                    <div className="trip-card-details" onClick={(e) => e.stopPropagation()}>
                      {/* Travels Section */}
                      <div className="details-section travels-section">
                        <div className="section-label">Travels</div>
                        <div className="travels-info">
                          <div className="travels-left">
                            <div className="travels-name">{booking.busName || 'Bus Operator'}</div>
                            <div className="travels-type">{booking.busType || 'Bus Type'}</div>
                          </div>
                          <div className="travels-right">
                            <div className="departure-time">{formatTime(booking.departureTime) || 'N/A'}</div>
                            <div className="departure-label">Departure Time</div>
                          </div>
                        </div>
                      </div>

                      {/* Passengers Section */}
                      <div className="details-section passengers-detail-section">
                        <div className="passengers-header">
                          <span className="section-label">Passengers</span>
                          <span className="section-label">Seats</span>
                          <span className="section-label addons-label">add ons</span>
                        </div>
                        {booking.passengers && booking.passengers.length > 0 ? (
                          booking.passengers.map((passenger, idx) => (
                            <div key={idx} className="passenger-row">
                              <span className="passenger-name">
                                {passenger.name || 'Passenger'}, {passenger.age || '-'}
                              </span>
                              <span className="passenger-seat">
                                {passenger.seatNumber || booking.selectedSeats?.[idx] || booking.seats?.[idx] || '-'}
                              </span>
                              <span className="passenger-addons">-</span>
                            </div>
                          ))
                        ) : (
                          <div className="passenger-row">
                            <span className="passenger-name">Passenger</span>
                            <span className="passenger-seat">{booking.selectedSeats?.join(', ') || '-'}</span>
                            <span className="passenger-addons">-</span>
                          </div>
                        )}
                      </div>

                      {/* Payment Details Section */}
                      <div className="details-section payment-detail-section">
                        <div className="payment-title">PAYMENT DETAILS</div>
                        <div className="payment-info">
                          <div className="payment-left">
                            <div className="payment-label">Payment Mode</div>
                            <div className="payment-mode">{booking.paymentMethod || 'PAYUUPI UPI PAYMENTS'}</div>
                          </div>
                          <div className="payment-right">
                            <div className="payment-label">Total Amount</div>
                            <div className="payment-amount">INR {booking.totalFare || 0}</div>
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      {booking.status === 'confirmed' && (
                        <div className="action-buttons">
                          <button 
                            className="download-ticket-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              generateTicketPDF({
                                bookingId: booking.bookingId,
                                pnr: booking.pnr,
                                busName: booking.busName,
                                busType: booking.busType,
                                fromCity: booking.fromCity || booking.source,
                                toCity: booking.toCity || booking.destination,
                                journeyDate: booking.journeyDate,
                                boardingPoint: booking.boardingPoint,
                                droppingPoint: booking.droppingPoint,
                                departureTime: booking.departureTime,
                                arrivalTime: booking.arrivalTime,
                                seats: booking.selectedSeats || booking.seats,
                                passengers: booking.passengers,
                                totalFare: booking.totalFare,
                                paymentId: booking.paymentId
                              });
                            }}
                          >
                            Download Ticket
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        </div>
      </div>
      <Footer />
    </>
  );
}
