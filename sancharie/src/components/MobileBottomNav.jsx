import React, { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Home, Search, Ticket, User } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import AuthModal from './Authantication/Login'
import ProfileCompletion from './ProfileCompletion'
import './MobileBottomNav.css'

function MobileBottomNav({ onHomeClick, onSearchClick }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { isAuthenticated, completeLogin } = useAuth()
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [showProfileCompletion, setShowProfileCompletion] = useState(false)

  const path = location.pathname

  const isHome = path === '/' && !onSearchClick
  const isSearch = !!onSearchClick
  const isBookings = path === '/my-bookings' || path.startsWith('/ticket/')
  const isProfile = path === '/profile' || path === '/travellers'

  const handleBookings = () => {
    if (isAuthenticated) {
      navigate('/my-bookings')
    } else {
      setShowAuthModal(true)
    }
  }

  const handleProfile = () => {
    if (isAuthenticated) {
      navigate('/profile')
    } else {
      setShowAuthModal(true)
    }
  }

  const handleLoginSuccess = async (phone) => {
    const result = await completeLogin(phone)
    setShowAuthModal(false)
    if (result.success && (result.isNewUser || !result.isProfileComplete)) {
      setShowProfileCompletion(true)
    }
  }

  return (
    <>
    <nav className="mobile-bottom-nav">
      <button
        className={`bottom-nav-item ${isHome ? 'active' : ''}`}
        onClick={onHomeClick || (() => navigate('/'))}
      >
        <Home />
        <span className="bottom-nav-label">Home</span>
      </button>
      <button
        className={`bottom-nav-item ${isSearch ? 'active' : ''}`}
        onClick={onSearchClick || (() => window.scrollTo({ top: 300, behavior: 'smooth' }))}
      >
        <Search />
        <span className="bottom-nav-label">Search</span>
      </button>
      <button
        className={`bottom-nav-item ${isBookings ? 'active' : ''}`}
        onClick={handleBookings}
      >
        <Ticket />
        <span className="bottom-nav-label">Bookings</span>
      </button>
      <button
        className={`bottom-nav-item ${isProfile ? 'active' : ''}`}
        onClick={handleProfile}
      >
        <User />
        <span className="bottom-nav-label">Account</span>
      </button>
    </nav>

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

export default MobileBottomNav
