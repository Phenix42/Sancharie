/**
 * MyAccount Component - Simple dropdown menu like AbhiBus
 */

import React, { useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import './MyAccount.css';

export default function MyAccount({ onClose }) {
  const { user, logout, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        onClose?.();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const handleLogout = () => {
    logout();
    onClose?.();
    navigate('/');
  };

  const handleNavigate = (path) => {
    onClose?.();
    navigate(path);
  };

  if (!isAuthenticated || !user) {
    return null;
  }

  return (
    <div className="my-account-dropdown" ref={dropdownRef}>
      {/* User Name & My Profile */}
      <div className="menu-item user-profile" onClick={() => handleNavigate('/profile')}>
        <div className="menu-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
        </div>
        <div className="menu-content">
          <span className="menu-title">{user.name || 'User'}</span>
          <span className="menu-subtitle">My Profile</span>
        </div>
      </div>

      {/* My Bookings */}
      <div className="menu-item" onClick={() => handleNavigate('/my-bookings')}>
        <div className="menu-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
        </div>
        <div className="menu-content">
          <span className="menu-title">My Bookings</span>
          <span className="menu-subtitle">View & Manage bookings</span>
        </div>
      </div>

      {/* My Travellers */}
      <div className="menu-item" onClick={() => handleNavigate('/travellers')}>
        <div className="menu-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
        </div>
        <div className="menu-content">
          <span className="menu-title">My Travellers</span>
          <span className="menu-subtitle">View all saved travellers</span>
        </div>
      </div>

      {/* Divider */}
      <div className="menu-divider"></div>

      {/* Log out */}
      <div className="menu-item logout" onClick={handleLogout}>
        <div className="menu-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </div>
        <div className="menu-content">
          <span className="menu-title">Log out</span>
        </div>
      </div>
    </div>
  );
}
