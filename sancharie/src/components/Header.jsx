import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import './Header.css'
import AuthModal from './Authantication/Login'
import MyAccount from './Myaccount'
import ProfileCompletion from './ProfileCompletion'
import { useAuth } from '../context/AuthContext'
import { useBooking } from '../context/BookingContext'
import { Timer, Home, BookOpen, HelpCircle, X, LogIn, ChevronDown } from 'lucide-react'

function Header({ onBackToHome, travelMode = 'bus', onTravelModeChange = () => {} }) {
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

  return (
    <>
      <header className="header">
        <div className="header-container">
          <div className="logo" onClick={handleLogoClick} style={{ cursor: 'pointer' }}>
            <span className="logo-text">Sancharie</span>
          </div>
          <div className="mode-tabs-header">
            <button
              type="button"
              className={`mode-tab ${travelMode === 'bus' ? 'active' : ''}`}
              onClick={() => onTravelModeChange('bus')}
            >
              Bus
            </button>
            <button
              type="button"
              className={`mode-tab ${travelMode === 'flight' ? 'active' : ''}`}
              onClick={() => onTravelModeChange('flight')}
            >
              Flight
            </button>
          </div>
          
          <button 
            className="mobile-menu-btn" 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            ☰
          </button>

          {/* Session Timer - Only show during booking flow, not on home page */}
          {sessionStartTime && !sessionExpired && !isHomePage && (
            <div className={`header-timer ${remainingTime.minutes < 2 ? 'warning' : ''} ${remainingTime.minutes < 1 ? 'critical' : ''}`}>
              <Timer size={14} />
              <span className="timer-time">
                {String(remainingTime.minutes).padStart(2, '0')}:{String(remainingTime.seconds).padStart(2, '0')}
              </span>
            </div>
          )}

          <nav className={`nav ${mobileMenuOpen ? 'mobile-open' : ''}`}>
            {/* Mobile drawer backdrop */}
            <div className="nav-backdrop" onClick={() => setMobileMenuOpen(false)} />
            
            <div className="nav-drawer">
              {/* Drawer header */}
              <div className="nav-drawer-header">
                <span className="nav-drawer-logo">Sancharie</span>
                <button className="nav-close-btn" onClick={() => setMobileMenuOpen(false)}>
                  <X size={20} />
                </button>
              </div>
              <div className="mobile-mode-tabs">
                <button
                  type="button"
                  className={`mode-tab ${travelMode === 'bus' ? 'active' : ''}`}
                  onClick={() => {
                    onTravelModeChange('bus');
                    setMobileMenuOpen(false);
                  }}
                >
                  Bus
                </button>
                <button
                  type="button"
                  className={`mode-tab ${travelMode === 'flight' ? 'active' : ''}`}
                  onClick={() => {
                    onTravelModeChange('flight');
                    setMobileMenuOpen(false);
                  }}
                >
                  Flight
                </button>
              </div>

              {/* User profile section in drawer */}
              {isAuthenticated && (
                <div className="nav-user-section" onClick={handleAuthClick}>
                  <div className="nav-user-avatar">
                    {user?.name ? user.name.charAt(0).toUpperCase() : '👤'}
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
                  <button className="nav-login-btn" onClick={handleAuthClick}>
                    <LogIn size={18} />
                    Login / Sign Up
                  </button>
                </div>
              )}
            </div>
            
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
                    {user?.name ? user.name.charAt(0).toUpperCase() : '👤'}
                  </span>
                  {getDisplayName()}
                  <svg className="dropdown-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
              ) : (
                <button 
                  className="login-btn" 
                  onClick={handleAuthClick}
                >
                  Login
                </button>
              )}
            </div>
          </nav>

          {showAccountDropdown && isAuthenticated && (
            <div className="auth-wrapper">
              <MyAccount onClose={() => setShowAccountDropdown(false)} />
            </div>
          )}
        </div>
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
