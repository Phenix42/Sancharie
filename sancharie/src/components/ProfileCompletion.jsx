/**
 * ProfileCompletion Modal - Shown after first-time login
 * Collects user details: name, email, age, gender
 */

import React, { useState } from 'react';
import { IoClose } from 'react-icons/io5';
import { useAuth } from '../context/AuthContext';
import './ProfileCompletion.css';

export default function ProfileCompletion({ isOpen, onClose, onComplete }) {
  const { updateProfile, user } = useAuth();
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    age: '',
    gender: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!formData.name.trim()) {
      setError('Please enter your name');
      return;
    }
    if (!formData.email.trim() || !formData.email.includes('@')) {
      setError('Please enter a valid email');
      return;
    }
    if (!formData.age || formData.age < 1 || formData.age > 120) {
      setError('Please enter a valid age');
      return;
    }
    if (!formData.gender) {
      setError('Please select your gender');
      return;
    }

    setIsLoading(true);

    const result = await updateProfile(formData);

    setIsLoading(false);

    if (result.success) {
      onComplete?.();
      onClose();
    } else {
      setError(result.message || 'Failed to save profile');
    }
  };

  const handleSkip = () => {
    onClose();
  };

  return (
    <div className="profile-modal-overlay" onClick={(e) => e.target === e.currentTarget && handleSkip()}>
      <div className="profile-modal">
        <div className="profile-modal-header">
          <div className="welcome-text">
            <h2>Welcome to Sancharie! 🎉</h2>
            <p>Complete your profile for a personalized experience</p>
          </div>
          <button className="close-btn" onClick={handleSkip}>
            <IoClose />
          </button>
        </div>

        <form className="profile-modal-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Full Name *</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="Enter your full name"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label>Email *</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="Enter your email address"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Age *</label>
              <input
                type="number"
                name="age"
                value={formData.age}
                onChange={handleChange}
                placeholder="Your age"
                min="1"
                max="120"
              />
            </div>

            <div className="form-group">
              <label>Gender *</label>
              <select name="gender" value={formData.gender} onChange={handleChange}>
                <option value="">Select Gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          {error && <p className="error-message">{error}</p>}

          <div className="form-actions">
            <button type="button" className="skip-btn" onClick={handleSkip}>
              Skip for now
            </button>
            <button type="submit" className="save-btn" disabled={isLoading}>
              {isLoading ? 'Saving...' : 'Save & Continue'}
            </button>
          </div>
        </form>

        <p className="privacy-note">
          Your information is secure and will only be used for booking purposes.
        </p>
      </div>
    </div>
  );
}
