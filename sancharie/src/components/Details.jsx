import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "./Details.css";
import { IoArrowBack } from "react-icons/io5";
import { blockSeat } from "../services/busApi";
import { useBooking } from "../context/BookingContext";

export default function Details() {
  const location = useLocation();
  const navigate = useNavigate();
  const { actions } = useBooking();
  
  // Get data from navigation state
  const stateData = location.state || {};
  const { fareData, selectedSeats, boardingPoint, droppingPoint, bus } = stateData;
  
  console.log("Details - location:", location);
  console.log("Details - location.state:", location.state);
  console.log("Details component received state:", { fareData, selectedSeats, boardingPoint, droppingPoint, bus });
  
  // Loading state for block seat
  const [isBlocking, setIsBlocking] = useState(false);
  
  // Initialize passenger details for each selected seat
  const [passengers, setPassengers] = useState(() => {
    if (!selectedSeats) return [];
    return selectedSeats.map((seat, index) => ({
      seatNumber: seat.seatName || seat,
      seatName: seat.seatName || seat,
      name: "",
      age: "",
      gender: "male",
      email: "",
      phone: "",
      address: "",
    }));
  });

  // Contact details state
  const [contactDetails, setContactDetails] = useState({
    countryCode: "+91",
    phone: "",
    email: "",
    state: "",
    whatsappUpdates: false,
  });

  // Assurance state
  const [assurance, setAssurance] = useState("no"); // "yes" or "no"
  const assurancePrice = 24; // per passenger

  // Redirect to home if no booking data
  if (!fareData || !selectedSeats) {
    return (
      <div className="details-container">
        <div className="details-header">
          <div className="header-left">
            <IoArrowBack className="back-icon" onClick={() => navigate('/')} />
            <h4>No Booking Data</h4>
          </div>
        </div>
        <div className="details-body">
          <div className="no-data">
            <p>No booking data found. Please select seats first.</p>
            <button onClick={() => navigate('/')}>Go Back to Home</button>
          </div>
        </div>
      </div>
    );
  }

  const handlePassengerChange = (index, e) => {
    const { name, value } = e.target;
    setPassengers(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [name]: value };
      return updated;
    });
  };

  const handleContactChange = (e) => {
    const { name, value, type, checked } = e.target;
    setContactDetails(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleProceedToPayment = async () => {
    // Validate all passengers have required fields
    for (let i = 0; i < passengers.length; i++) {
      const p = passengers[i];
      if (!p.name) {
        alert(`Please enter name for Passenger ${i + 1} (Seat ${p.seatNumber})`);
        return;
      }
    }
    // Validate contact details
    if (!contactDetails.phone) {
      alert("Please enter phone number");
      return;
    }
    if (!contactDetails.state) {
      alert("Please select state of residence");
      return;
    }
    
    // Block seat API call
    try {
      setIsBlocking(true);
      
      // Prepare passengers data with contact info for lead passenger
      const passengersWithContact = passengers.map((p, index) => ({
        ...p,
        email: index === 0 ? contactDetails.email : p.email,
        phone: index === 0 ? contactDetails.phone : p.phone,
        address: contactDetails.state,
      }));
      
      const blockSeatResponse = await blockSeat(
        bus?.searchTokenId,
        bus?.resultIndex || bus?.ResultIndex,
        boardingPoint?.id,
        droppingPoint?.id,
        passengersWithContact
      );
      
      // Store block seat response in context
      actions.setBlockSeatData(blockSeatResponse);
      actions.setPassengers(passengersWithContact);
      actions.setContactDetails(contactDetails);
      
      // Navigate to payment page with all booking data
      navigate('/payment', {
        state: {
          fareData,
          selectedSeats,
          boardingPoint,
          droppingPoint,
          bus,
          passengers: passengersWithContact,
          contactDetails,
          assurance,
          blockSeatData: blockSeatResponse,
        }
      });
    } catch (error) {
      console.error("Block seat error:", error);
      alert(`Failed to block seats: ${error.message}`);
    } finally {
      setIsBlocking(false);
    }
  };

  const handleBack = () => {
    navigate(-1);
  };

  return (
    <div className="details-page">
      <div className="details-container">
        {/* HEADER */}
        <div className="details-header">
          <div className="header-left">
            <IoArrowBack className="back-icon" onClick={handleBack} />
            <h4>Booking Details</h4>
          </div>
        </div>

      <div className="details-body">
        {/* LEFT SIDE - PASSENGER DETAILS (70%) */}
        <div className="passenger-section">
          <div className="section-card">
            <h3>Passenger Details</h3>
            <p className="section-subtitle">Please enter details for {selectedSeats.length} passenger{selectedSeats.length > 1 ? 's' : ''}</p>

            {passengers.map((passenger, index) => (
              <div key={passenger.seatNumber} className="passenger-form">
                <div className="passenger-header">
                  <span className="passenger-number">Passenger {index + 1}</span>
                  <span className="seat-tag">Seat {passenger.seatNumber}</span>
                </div>

                <div className="form-row three-cols">
                  <div className="form-group">
                    <label>Full Name <span className="required">*</span></label>
                    <input
                      type="text"
                      name="name"
                      placeholder="Enter full name"
                      value={passenger.name}
                      onChange={(e) => handlePassengerChange(index, e)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Age</label>
                    <input
                      type="number"
                      name="age"
                      placeholder="Age"
                      value={passenger.age}
                      onChange={(e) => handlePassengerChange(index, e)}
                    />
                  </div>

                  <div className="form-group">
                    <label>Gender</label>
                    <select
                      name="gender"
                      value={passenger.gender}
                      onChange={(e) => handlePassengerChange(index, e)}
                    >
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* CONTACT DETAILS */}
          <div className="section-card contact-card">
            <h3>Contact Details</h3>
            <p className="section-subtitle">Ticket details will be sent to</p>

            <div className="contact-form">
              <div className="phone-input-group">
                <div className="country-code">
                  <span className="code-label">Country Code</span>
                  <select
                    name="countryCode"
                    value={contactDetails.countryCode}
                    onChange={handleContactChange}
                  >
                    <option value="+91">+91 (IND) ▼</option>
                    <option value="+1">+1 (USA)</option>
                    <option value="+44">+44 (UK)</option>
                    <option value="+971">+971 (UAE)</option>
                  </select>
                </div>
                <div className="phone-field">
                  <input
                    type="tel"
                    name="phone"
                    placeholder="Phone *"
                    value={contactDetails.phone}
                    onChange={handleContactChange}
                    required
                  />
                </div>
              </div>

              <input
                type="email"
                name="email"
                placeholder="Email ID"
                value={contactDetails.email}
                onChange={handleContactChange}
                className="contact-input"
              />

              <div className="state-wrapper">
                <select
                  name="state"
                  value={contactDetails.state}
                  onChange={handleContactChange}
                  className="contact-input"
                  required
                >
                  <option value="">State of Residence *</option>
                  <option value="AP">Andhra Pradesh</option>
                  <option value="TS">Telangana</option>
                  <option value="KA">Karnataka</option>
                  <option value="TN">Tamil Nadu</option>
                  <option value="MH">Maharashtra</option>
                  <option value="KL">Kerala</option>
                  <option value="DL">Delhi</option>
                  <option value="UP">Uttar Pradesh</option>
                  <option value="GJ">Gujarat</option>
                  <option value="RJ">Rajasthan</option>
                  <option value="WB">West Bengal</option>
                  <option value="OR">Odisha</option>
                  <option value="MP">Madhya Pradesh</option>
                  <option value="BR">Bihar</option>
                  <option value="PB">Punjab</option>
                </select>
                <span className="gst-note">Required for GST Tax Invoicing</span>
              </div>

              <div className="whatsapp-toggle">
                <div className="whatsapp-icon">
                  <svg viewBox="0 0 24 24" width="28" height="28" fill="#25D366">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                </div>
                <span className="whatsapp-text">Send booking details and trip updates on WhatsApp</span>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    name="whatsappUpdates"
                    checked={contactDetails.whatsappUpdates}
                    onChange={handleContactChange}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
            </div>
          </div>

          {/* SANCHARIE ASSURANCE */}
          <div className="section-card assurance-card">
            <div className="assurance-header">
              <div className="assurance-title">
                <h3>Sancharie Assurance</h3>
                <span className="assurance-price">₹{assurancePrice} per passenger</span>
              </div>
              <div className="assurance-badge">
                <span>🛡️</span>
              </div>
            </div>

            <div className="assurance-info">
              <p className="assurance-highlight">If your bus gets cancelled, you get</p>
              <div className="refund-amount">₹{fareData.baseFare + 500}</div>
              <p className="refund-breakdown">₹{fareData.baseFare} + ₹500 (extra cashback)</p>
              <p className="coverage-text">
                Includes coverage of ₹75,000 for hospitalisation and ₹5,00,000 in case of death, PTD or PPD.
              </p>
              <a href="#" className="terms-link">Terms and conditions</a>
            </div>

            <div className="assurance-options">
              <label className={`assurance-option ${assurance === 'yes' ? 'selected' : ''}`}>
                <span>Yes, protect my trip at ₹{assurancePrice * selectedSeats.length} ({selectedSeats.length} passenger{selectedSeats.length > 1 ? 's' : ''})</span>
                <input
                  type="radio"
                  name="assurance"
                  value="yes"
                  checked={assurance === 'yes'}
                  onChange={(e) => setAssurance(e.target.value)}
                />
                <span className="radio-circle"></span>
              </label>

              <label className={`assurance-option ${assurance === 'no' ? 'selected' : ''}`}>
                <span>Don't add Sancharie Assurance</span>
                <input
                  type="radio"
                  name="assurance"
                  value="no"
                  checked={assurance === 'no'}
                  onChange={(e) => setAssurance(e.target.value)}
                />
                <span className="radio-circle"></span>
              </label>
            </div>
          </div>

          {/* JOURNEY DETAILS */}
          <div className="section-card journey-card">
            <h3>Journey Details</h3>
            <div className="journey-info">
              <div className="journey-point">
                <span className="label">Boarding Point</span>
                <strong>{boardingPoint?.name}</strong>
                <span className="time">{boardingPoint?.time}</span>
                <p className="desc">{boardingPoint?.desc}</p>
              </div>
              <div className="journey-divider">
                <div className="divider-line"></div>
                <span className="divider-icon">→</span>
                <div className="divider-line"></div>
              </div>
              <div className="journey-point">
                <span className="label">Dropping Point</span>
                <strong>{droppingPoint?.name}</strong>
                <span className="time">{droppingPoint?.time}</span>
                <p className="desc">{droppingPoint?.desc}</p>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT SIDE - FARE DETAILS (30%) */}
        <div className="fare-section">
          <div className="fare-card">
            <h3>Fare Details</h3>
            
            <div className="bus-info">
              <strong>{bus?.name || "Bus"}</strong>
              <span className="bus-type">{bus?.type || "Sleeper"}</span>
            </div>

            <div className="selected-seats">
              <span className="label">Selected Seats</span>
              <div className="seats-list">
                {selectedSeats.map((seat, index) => (
                  <span key={seat.seatName || index} className="seat-badge">{seat.seatName || seat}</span>
                ))}
              </div>
            </div>

            <div className="fare-breakdown">
              <div className="fare-row">
                <span>Base Fare ({fareData.seatCount} seats)</span>
                <span>₹{fareData.baseFare}</span>
              </div>
              <div className="fare-row">
                <span>GST (5%)</span>
                <span>₹{fareData.gst}</span>
              </div>
              <div className="fare-row">
                <span>Service Charge</span>
                <span>₹{fareData.serviceCharge}</span>
              </div>
              <div className="fare-row total">
                <span>Total Amount</span>
                <span>₹{fareData.totalFare}</span>
              </div>
            </div>

            <button 
              className="proceed-btn" 
              onClick={handleProceedToPayment}
              disabled={isBlocking}
            >
              {isBlocking ? "Blocking Seats..." : "Proceed to Payment"}
            </button>

            <p className="secure-text">
              🔒 Your payment is secured with SSL encryption
            </p>
          </div>

          {/* OFFERS CARD */}
          <div className="offers-card">
            <h4>Available Offers</h4>
            <div className="offer-item">
              <span className="offer-code">FIRST50</span>
              <span className="offer-desc">Get 50% off on first booking</span>
            </div>
            <div className="offer-item">
              <span className="offer-code">WEEKEND</span>
              <span className="offer-desc">₹100 off on weekend travel</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}
