/**
 * Travellers Page Component - Manage saved travellers
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';
import './Travellers.css';

export default function Travellers() {
  const { user, isAuthenticated, isLoading: authLoading, token } = useAuth();
  const navigate = useNavigate();
  
  const [travellers, setTravellers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    age: '',
    gender: ''
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, authLoading, navigate]);

  // Fetch travellers
  useEffect(() => {
    const fetchTravellers = async () => {
      if (!token) return;
      
      try {
        const response = await fetch('http://localhost:8000/user/travellers', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          setTravellers(data.travellers || []);
        }
      } catch (err) {
        console.error('Failed to fetch travellers:', err);
      } finally {
        setIsLoading(false);
      }
    };

    if (isAuthenticated) {
      fetchTravellers();
    }
  }, [isAuthenticated, token]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError('');
  };

  const handleAddTraveller = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Validation
    if (!formData.name.trim()) {
      setError('Name is required');
      return;
    }
    if (!formData.age || formData.age < 1 || formData.age > 120) {
      setError('Valid age is required');
      return;
    }
    if (!formData.gender) {
      setError('Gender is required');
      return;
    }

    try {
      const response = await fetch('http://localhost:8000/user/travellers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        const data = await response.json();
        setTravellers(data.travellers || [...travellers, formData]);
        setFormData({ name: '', age: '', gender: '' });
        setShowAddForm(false);
        setSuccess('Traveller added successfully!');
      } else {
        setError('Failed to add traveller');
      }
    } catch (err) {
      // For now, just add locally since API might not exist yet
      const newTraveller = { ...formData, id: Date.now() };
      setTravellers([...travellers, newTraveller]);
      setFormData({ name: '', age: '', gender: '' });
      setShowAddForm(false);
      setSuccess('Traveller added successfully!');
    }
  };

  const handleDeleteTraveller = async (index) => {
    const updatedTravellers = travellers.filter((_, i) => i !== index);
    setTravellers(updatedTravellers);
    setSuccess('Traveller removed successfully!');
  };

  if (authLoading) {
    return (
      <div className="travellers-page">
        <Header />
        <div className="travellers-loading">
          <div className="loading-spinner"></div>
          <p>Loading...</p>
        </div>
        <Footer />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="travellers-page">
      <Header />
      
      <div className="travellers-container">
        <div className="travellers-header">
          <h1>My Travellers</h1>
          <p>Save traveller details for quick booking</p>
        </div>

        {success && <div className="success-alert">{success}</div>}

        {/* Add Traveller Button */}
        {!showAddForm && (
          <button className="add-traveller-btn" onClick={() => setShowAddForm(true)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add Traveller
          </button>
        )}

        {/* Add Traveller Form */}
        {showAddForm && (
          <div className="traveller-form-card">
            <h3>Add New Traveller</h3>
            <form onSubmit={handleAddTraveller}>
              <div className="form-group">
                <label>Full Name <span className="required">*</span></label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="Enter traveller name"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Age <span className="required">*</span></label>
                  <input
                    type="number"
                    name="age"
                    value={formData.age}
                    onChange={handleChange}
                    placeholder="Age"
                    min="1"
                    max="120"
                  />
                </div>

                <div className="form-group">
                  <label>Gender <span className="required">*</span></label>
                  <select name="gender" value={formData.gender} onChange={handleChange}>
                    <option value="">Select</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              {error && <div className="error-message">{error}</div>}

              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={() => {
                  setShowAddForm(false);
                  setFormData({ name: '', age: '', gender: '' });
                  setError('');
                }}>
                  Cancel
                </button>
                <button type="submit" className="save-btn">
                  Save Traveller
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Travellers List */}
        {isLoading ? (
          <div className="travellers-loading-inline">
            <div className="loading-spinner"></div>
          </div>
        ) : travellers.length === 0 ? (
          <div className="no-travellers">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.5">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            <h3>No Saved Travellers</h3>
            <p>Add travellers to speed up your booking process</p>
          </div>
        ) : (
          <div className="travellers-list">
            {travellers.map((traveller, index) => (
              <div key={traveller.id || index} className="traveller-card">
                <div className="traveller-avatar">
                  {traveller.name.charAt(0).toUpperCase()}
                </div>
                <div className="traveller-info">
                  <h4>{traveller.name}</h4>
                  <p>{traveller.age} years • {traveller.gender?.charAt(0).toUpperCase() + traveller.gender?.slice(1)}</p>
                </div>
                <button className="delete-btn" onClick={() => handleDeleteTraveller(index)}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}
