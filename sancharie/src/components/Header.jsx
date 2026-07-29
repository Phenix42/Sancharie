import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import './Header.css'
import AuthModal from './Authantication/Login'
import MyAccount from './Myaccount'
import ProfileCompletion from './ProfileCompletion'
import { useAuth } from '../context/AuthContext'
import { useBooking } from '../context/BookingContext'
import {
  BadgePercent,
  BookOpen,
  Building2,
  BusFront,
  ChevronDown,
  Headphones,
  HelpCircle,
  Home,
  LogIn,
  Menu,
  Plane,
  TicketCheck,
  Timer,
  TrainFront,
  UserRound,
  X
} from 'lucide-react'

function Header({ onBackToHome, travelMode = 'bus', onTravelModeChange }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [showAccountDropdown, setShowAccountDropdown] = useState(false)
  const [showProfileCompletion, setShowProfileCompletion] = useState(false)
  const [remainingTime, setRemainingTime] = useState({ minutes: 10, seconds: 0 })
  
  const { isAuthenticated, user, completeLogin, isLoading } = useAuth()
  const { state: bookingState, actions: bookingActions } = useBooking()
  const { sessionExpired, sessionStartTime } = bookingState
  const navigate = useNavigate()
  const location = useLocation()
  const isHomePage = location.pathname === '/'
  const travelTabs = [
    { key: 'bus', label: 'Buses', icon: BusFront, enabled: true },
    { key: 'flight', label: 'Flights', icon: Plane, enabled: true },
    { key: 'hotel', label: 'Hotels', icon: Building2, enabled: true },
    { key: 'train', label: 'Trains', icon: TrainFront, enabled: false }
  ]
  // Update remaining time every second
  useEffect(() => {
    if (!sessionStartTime || sessionExpired) return;
    
    const updateTimer = () => {
      const timeLeft = bookingActions.getRemainingTime();
      if (timeLeft) {
        setRemainingTime({
          minutes: timeLeft.minutes,
          seconds: timeLeft.seconds
        });
      }
    };
    
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [sessionStartTime, sessionExpired, bookingActions]);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setMobileMenuOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [mobileMenuOpen]);

  // Get display name - use name if available, otherwise show phone last 4 digits
  const getDisplayName = () => {
    if (user?.name) {
      // Show first name only
      return user.name.split(' ')[0];
    }
    if (user?.phone) {
      return `User ${user.phone.slice(-4)}`;
    }
    return 'My Account';
  };

  const handleLogoClick = () => {
    // Reset session when going back to home
    bookingActions.resetSession();
    bookingActions.resetAll();
    
    if (onBackToHome) {
      onBackToHome();
      setMobileMenuOpen(false);
    } else {
      navigate('/');
    }
  };

  const handleAuthClick = (e) => {
    e.preventDefault();
    setMobileMenuOpen(false);
    
    if (isAuthenticated) {
      setShowAccountDropdown(!showAccountDropdown);
    } else {
      setShowAuthModal(true);
    }
  };

  const handleMyBookingsClick = (e) => {
    e.preventDefault();
    setMobileMenuOpen(false);
    
    if (isAuthenticated) {
      navigate('/my-bookings');
    } else {
      setShowAuthModal(true);
    }
  };

  const handleLoginSuccess = async (phone) => {
    // Complete login via AuthContext
    const result = await completeLogin(phone);
    setShowAuthModal(false);
    
    // Show profile completion modal for new users or users with incomplete profile
    if (result.success && (result.isNewUser || !result.isProfileComplete)) {
      setShowProfileCompletion(true);
    }
  };

  const handleTravelModeClick = (mode, enabled) => {
    if (!enabled || mode === travelMode) return;

    if (onTravelModeChange) {
      onTravelModeChange(mode);
      return;
    }

    window.location.assign(mode === 'flight' ? '/?mode=flight' : mode === 'hotel' ? '/?mode=hotel' : '/');
  };

  return (
    <>
      <header className="header">
        <div className="header-container header-main-inner">
          <div className="brand-cluster">
            <button className="logo" onClick={handleLogoClick} type="button">
              <span className="logo-text">Sancharie</span>
            </button>
          </div>

          <button 
            className="mobile-menu-btn" 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-controls="mobile-header-menu"
            aria-expanded={mobileMenuOpen}
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            type="button"
          >
            {mobileMenuOpen ? <X size={22} /> : <Menu size={24} />}
          </button>

          <div className="mode-tabs-header" aria-label="Travel services">
            {travelTabs.map(({ key, label, icon: Icon, enabled }) => (
              <button
                key={key}
                type="button"
                className={`mode-tab ${travelMode === key ? 'active' : ''}`}
                onClick={() => handleTravelModeClick(key, enabled)}
                disabled={!enabled}
                title={enabled ? label : `${label} coming soon`}
              >
                <span className="mode-tab-icon">
                  {React.createElement(Icon, { size: 22, strokeWidth: 2.2 })}
                </span>
                <span>{label}</span>
              </button>
            ))}
          </div>

          <div className="header-actions">
            {/* Session Timer - Only show during booking flow, not on home page */}
            {sessionStartTime && !sessionExpired && !isHomePage && travelMode !== 'flight' && (
              <div className={`header-timer ${remainingTime.minutes < 2 ? 'warning' : ''} ${remainingTime.minutes < 1 ? 'critical' : ''}`}>
                <Timer size={14} />
                <span className="timer-time">
                  {String(remainingTime.minutes).padStart(2, '0')}:{String(remainingTime.seconds).padStart(2, '0')}
                </span>
              </div>
            )}

            <a className="header-action-link" href="#offers" aria-label="Offers" title="Offers">
              <BadgePercent size={17} />
              <span>Offers</span>
            </a>
            <a className="header-action-link" href="#bookings" onClick={handleMyBookingsClick} aria-label="Track Ticket" title="Track Ticket">
              <TicketCheck size={18} />
              <span>Track Ticket</span>
            </a>
            <a className="header-action-link" href="#help" aria-label="Need Help?" title="Need Help?">
              <Headphones size={18} />
              <span>Need Help?</span>
            </a>

            <div className="auth-wrapper desktop-auth">
              {isLoading ? (
                <button className="login-btn" disabled>
                  Loading...
                </button>
              ) : isAuthenticated ? (
                <button 
                  className="login-btn logged-in" 
                  onClick={handleAuthClick}
                >
                  <span className="user-avatar-small">
                    {user?.name ? user.name.charAt(0).toUpperCase() : <UserRound size={14} />}
                  </span>
                  <span>{getDisplayName()}</span>
                  <ChevronDown size={14} className="dropdown-arrow" />
                </button>
              ) : (
                <button 
                  className="login-btn" 
                  onClick={handleAuthClick}
                >
                  <UserRound size={16} />
                  Login
                </button>
              )}
            </div>

            {showAccountDropdown && isAuthenticated && (
              <div className="account-popover-anchor">
                <MyAccount onClose={() => setShowAccountDropdown(false)} />
              </div>
            )}
          </div>
        </div>
          
        <nav
          id="mobile-header-menu"
          className={`nav ${mobileMenuOpen ? 'mobile-open' : ''}`}
          aria-hidden={!mobileMenuOpen}
        >
            {/* Mobile drawer backdrop */}
            <div className="nav-backdrop" onClick={() => setMobileMenuOpen(false)} />
            
            <div className="nav-drawer">
              {/* Drawer header */}
              <div className="nav-drawer-header">
                <span className="nav-drawer-logo">Sancharie</span>
                <button className="nav-close-btn" onClick={() => setMobileMenuOpen(false)} aria-label="Close menu" type="button">
                  <X size={20} />
                </button>
              </div>
              <div className="mobile-mode-tabs">
                {travelTabs.map(({ key, label, icon: Icon, enabled }) => (
                  <button
                    key={key}
                    type="button"
                    className={`mode-tab ${travelMode === key ? 'active' : ''}`}
                    onClick={() => {
                      handleTravelModeClick(key, enabled);
                      if (enabled) setMobileMenuOpen(false);
                    }}
                    disabled={!enabled}
                  >
                    <span className="mode-tab-icon">
                      {React.createElement(Icon, { size: 21, strokeWidth: 2.2 })}
                    </span>
                    <span>{label}</span>
                  </button>
                ))}
              </div>

              {/* User profile section in drawer */}
              {isAuthenticated && (
                <div className="nav-user-section" onClick={handleAuthClick}>
                  <div className="nav-user-avatar">
                    {user?.name ? user.name.charAt(0).toUpperCase() : <UserRound size={18} />}
                  </div>
                  <div className="nav-user-info">
                    <span className="nav-user-name">{getDisplayName()}</span>
                    <span className="nav-user-phone">{user?.phone || ''}</span>
                  </div>
                  <ChevronDown size={16} className="nav-user-chevron" />
                </div>
              )}

              {/* Nav links */}
              <div className="nav-links">
                <a href="#home" className={isHomePage ? 'active' : ''} onClick={handleLogoClick}>
                  <Home size={18} />
                  <span>Home</span>
                </a>
                <a href="#bookings" className={location.pathname === '/my-bookings' ? 'active' : ''} onClick={handleMyBookingsClick}>
                  <BookOpen size={18} />
                  <span>My Bookings</span>
                </a>
                <a href="#help">
                  <HelpCircle size={18} />
                  <span>Help</span>
                </a>
              </div>
              
              {/* Auth button at bottom for non-authenticated */}
              {!isAuthenticated && (
                <div className="nav-auth-section">
                  <button className="nav-login-btn" onClick={handleAuthClick} type="button">
                    <LogIn size={18} />
                    Login / Sign Up
                  </button>
                </div>
              )}
            </div>
        </nav>

      </header>

      <AuthModal 
        isOpen={showAuthModal} 
        onClose={() => setShowAuthModal(false)}
        onLoginSuccess={handleLoginSuccess}
      />

      <ProfileCompletion 
        isOpen={showProfileCompletion}
        onClose={() => setShowProfileCompletion(false)}
      />
    </>
  )
}

export default Header
