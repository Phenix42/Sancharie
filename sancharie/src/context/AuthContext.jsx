/**
 * Auth Context - Global authentication state management
 * Handles user login, logout, profile, and token management
 */

import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

// API Base URL
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Load auth state from localStorage on mount
  useEffect(() => {
    const loadAuthState = async () => {
      try {
        const savedToken = localStorage.getItem('authToken');
        const savedUser = localStorage.getItem('authUser');

        console.log('🔐 Loading auth state...', { hasToken: !!savedToken, hasUser: !!savedUser });

        if (savedToken && savedUser) {
          // First, set the state from localStorage immediately
          const parsedUser = JSON.parse(savedUser);
          setToken(savedToken);
          setUser(parsedUser);
          setIsAuthenticated(true);
          
          // Then verify token with backend (non-blocking)
          try {
            const response = await fetch(`${API_BASE_URL}/user/verify-token`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${savedToken}`
              }
            });

            if (response.ok) {
              const data = await response.json();
              // Update with fresh user data from server
              setUser(data.user);
              localStorage.setItem('authUser', JSON.stringify(data.user));
              console.log('✅ Token verified, user:', data.user);
            } else {
              // Token invalid, clear storage
              console.log('❌ Token invalid, clearing auth');
              localStorage.removeItem('authToken');
              localStorage.removeItem('authUser');
              setToken(null);
              setUser(null);
              setIsAuthenticated(false);
            }
          } catch (verifyError) {
            // Network error during verification - keep the cached state
            console.log('⚠️ Could not verify token (network error), using cached state');
          }
        }
      } catch (error) {
        console.error('Error loading auth state:', error);
        localStorage.removeItem('authToken');
        localStorage.removeItem('authUser');
      } finally {
        setIsLoading(false);
      }
    };

    loadAuthState();
  }, []);

  /**
   * Complete login after OTP verification
   * Creates user in DB and gets JWT token
   */
  const completeLogin = async (phone) => {
    try {
      console.log('🔐 Completing login for phone:', phone);
      
      const response = await fetch(`${API_BASE_URL}/user/login-complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ phone })
      });

      const data = await response.json();
      console.log('🔐 Login response:', data);

      if (data.success) {
        setToken(data.token);
        setUser(data.user);
        setIsAuthenticated(true);

        // Save to localStorage
        localStorage.setItem('authToken', data.token);
        localStorage.setItem('authUser', JSON.stringify(data.user));
        
        console.log('✅ Login complete, user saved:', data.user);

        return {
          success: true,
          isNewUser: data.isNewUser,
          isProfileComplete: data.isProfileComplete,
          user: data.user
        };
      }

      console.log('❌ Login failed:', data.message);
      return { success: false, message: data.message };
    } catch (error) {
      console.error('Complete login error:', error);
      return { success: false, message: 'Network error' };
    }
  };

  /**
   * Update user profile
   */
  const updateProfile = async (profileData) => {
    try {
      const response = await fetch(`${API_BASE_URL}/user/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(profileData)
      });

      const data = await response.json();

      if (data.success) {
        setUser(data.user);
        localStorage.setItem('authUser', JSON.stringify(data.user));
        return { success: true, user: data.user };
      }

      return { success: false, message: data.message };
    } catch (error) {
      console.error('Update profile error:', error);
      return { success: false, message: 'Network error' };
    }
  };

  /**
   * Get user profile
   */
  const getProfile = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/user/profile`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (data.success) {
        setUser(data.user);
        localStorage.setItem('authUser', JSON.stringify(data.user));
        return { success: true, user: data.user };
      }

      return { success: false, message: data.message };
    } catch (error) {
      console.error('Get profile error:', error);
      return { success: false, message: 'Network error' };
    }
  };

  /**
   * Get user bookings
   */
  const getBookings = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/user/bookings`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (data.success) {
        return { success: true, bookings: data.bookings };
      }

      return { success: false, message: data.message, bookings: [] };
    } catch (error) {
      console.error('Get bookings error:', error);
      return { success: false, message: 'Network error', bookings: [] };
    }
  };

  /**
   * Create a new booking
   */
  const createBooking = async (bookingData) => {
    try {
      const response = await fetch(`${API_BASE_URL}/user/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(bookingData)
      });

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Create booking error:', error);
      return { success: false, message: 'Network error' };
    }
  };

  /**
   * Logout user
   */
  const logout = () => {
    setUser(null);
    setToken(null);
    setIsAuthenticated(false);
    localStorage.removeItem('authToken');
    localStorage.removeItem('authUser');
  };

  const value = {
    user,
    token,
    isLoading,
    isAuthenticated,
    completeLogin,
    updateProfile,
    getProfile,
    getBookings,
    createBooking,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
