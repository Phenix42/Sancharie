import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "./Details.css";
import { 
  ArrowLeft, 
  User, 
  Phone, 
  Mail, 
  MapPin, 
  Shield, 
  CreditCard, 
  Bus, 
  Check,
  CheckCircle2,
  ChevronRight,
  Armchair,
  Info,
  Lock,
  CalendarDays,
  MapPinned,
  Sparkles,
  Ticket
} from "lucide-react";
import { bus as busApi, promotions, user as userApi } from "../services/api";
import { useBooking } from "../context/BookingContext";
import { useToast } from "./Toast";
import CancellationPolicySummary from "./CancellationPolicySummary";

const ASSURANCE_AVAILABLE = false;

export default function Details() {
  const location = useLocation();
  const navigate = useNavigate();
  const { actions } = useBooking();
  const toast = useToast();
  
  // Get data from navigation state
  const stateData = location.state || {};
  const { fareData, seatLayout, selectedSeats, boardingPoint, droppingPoint, bus } = stateData;
  
  // Loading state for block seat
  const [isBlocking, setIsBlocking] = useState(false);
  const [promoExpanded, setPromoExpanded] = useState(false);
  const [promoInput, setPromoInput] = useState('');
  const [appliedPromotion, setAppliedPromotion] = useState(null);
  const [promoError, setPromoError] = useState('');
  const [isApplyingPromo, setIsApplyingPromo] = useState(false);
  const [availablePromotions, setAvailablePromotions] = useState([]);
  const [loadingPromotions, setLoadingPromotions] = useState(true);
  const [wallet, setWallet] = useState({ balance: 0, minimumBookingAmount: 0, loading: true });
  const [useWallet, setUseWallet] = useState(false);
  
  // Initialize passenger details for each selected seat
  const [passengers, setPassengers] = useState(() => {
    if (!selectedSeats) return [];
    return selectedSeats.map((seat) => ({
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
  const journeyDate = bus?.dateOfJourney || bus?.date || bus?.DepartureTime;
  const parsedJourneyDate = journeyDate ? new Date(journeyDate) : null;
  const journeyDateLabel = parsedJourneyDate && !Number.isNaN(parsedJourneyDate.getTime())
    ? parsedJourneyDate.toLocaleDateString('en-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : 'Travel date';
  const operatorName = bus?.TravelName || bus?.name || "Bus Operator";
  const busType = bus?.BusType || bus?.type || "A/C Sleeper";
  const boardingTime = boardingPoint?.time || boardingPoint?.Time || '—';
  const droppingTime = droppingPoint?.time || droppingPoint?.Time || '—';
  const boardingName = boardingPoint?.name || boardingPoint?.CityPointName || 'Boarding point';
  const droppingName = droppingPoint?.name || droppingPoint?.CityPointName || 'Dropping point';
  const assuranceTotal = assurancePrice * (selectedSeats?.length || 0);
  const assuranceSelected = ASSURANCE_AVAILABLE && assurance === 'yes';
  const originalFare = Number(fareData?.totalFare || 0);
  const totalAfterPromotion = Math.max(0, originalFare - Number(appliedPromotion?.discountAmount || 0)) + (assuranceSelected ? assuranceTotal : 0);
  const walletEligible = wallet.balance > 0 && totalAfterPromotion >= wallet.minimumBookingAmount;
  const walletAmount = walletEligible && useWallet ? Math.min(wallet.balance, totalAfterPromotion) : 0;
  const payableTotal = Math.max(0, totalAfterPromotion - walletAmount);

  useEffect(() => {
    let active = true;
    userApi.getWallet()
      .then((result) => { if (active) setWallet({ balance: Number(result.balance) || 0, minimumBookingAmount: Number(result.minimumBookingAmount) || 0, loading: false }); })
      .catch(() => { if (active) setWallet((current) => ({ ...current, loading: false })); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    promotions.available()
      .then((discounts = []) => {
        if (!active) return;
        setAvailablePromotions(discounts.map((discount) => ({ ...discount, promotionType: 'discount' })));
      })
      .catch(() => { if (active) setAvailablePromotions([]); })
      .finally(() => { if (active) setLoadingPromotions(false); });
    return () => { active = false; };
  }, []);

  const applyPromoCode = useCallback(async (promo = promoInput, discountId = '') => {
    const code = String(promo || '').trim().toUpperCase();
    if (!code && !discountId) {
      setPromoError('Enter a promo code to continue.');
      return;
    }
    setPromoError('');
    setIsApplyingPromo(true);
    try {
      const result = await promotions.validate({
        code,
        discountId,
        amount: originalFare,
      });
      setAppliedPromotion(result);
      setPromoInput(result.code || code);
      setPromoExpanded(false);
    } catch (error) {
      setPromoError(error.message || 'This promo code could not be applied.');
    } finally {
      setIsApplyingPromo(false);
    }
  }, [originalFare, promoInput]);

  useEffect(() => {
    try {
      const pending = JSON.parse(sessionStorage.getItem('pendingBusPromotion') || 'null');
      if (!pending) return;
      sessionStorage.removeItem('pendingBusPromotion');
      setPromoInput(pending.code || '');
      setPromoExpanded(true);
      applyPromoCode(pending.code || '', pending.discountId || '');
    } catch {
      sessionStorage.removeItem('pendingBusPromotion');
    }
  }, [applyPromoCode]);

  // Validation errors state
  const [passengerErrors, setPassengerErrors] = useState(() => {
    if (!selectedSeats) return [];
    return selectedSeats.map(() => ({ name: '', age: '' }));
  });
  const [contactErrors, setContactErrors] = useState({ phone: '', email: '', state: '' });
  const [touched, setTouched] = useState({
    passengers: selectedSeats ? selectedSeats.map(() => ({ name: false, age: false })) : [],
    contact: { phone: false, email: false, state: false },
  });

  // Validation helpers
  const validateName = (name) => {
    if (!name.trim()) return 'Name is required';
    if (name.trim().length < 2) return 'Name must be at least 2 characters';
    if (!/^[a-zA-Z\s.'-]+$/.test(name.trim())) return 'Name can only contain letters, spaces, dots, hyphens';
    if (name.trim().length > 50) return 'Name must be under 50 characters';
    return '';
  };

  const validateAge = (age) => {
    if (!age && age !== 0) return 'Age is required';
    const ageNum = Number(age);
    if (!Number.isInteger(ageNum) || ageNum < 1) return 'Enter a valid age';
    if (ageNum < 5) return 'Passenger must be at least 5 years old';
    if (ageNum > 120) return 'Enter a valid age';
    return '';
  };

  const validatePhone = (phone) => {
    if (!phone.trim()) return 'Phone number is required';
    const digits = phone.replace(/\D/g, '');
    if (digits.length !== 10) return 'Phone number must be 10 digits';
    if (!/^[6-9]/.test(digits)) return 'Enter a valid Indian mobile number';
    return '';
  };

  const validateEmail = (email) => {
    if (!email.trim()) return ''; // email is optional
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Enter a valid email address';
    return '';
  };

  const validateState = (state) => {
    if (!state) return 'State of residence is required';
    return '';
  };

  // Redirect to home if no booking data
  if (!fareData || !selectedSeats) {
    return (
      <div className="details-page">
        <div className="details-container">
          <div className="details-header">
            <div className="header-left">
              <button className="back-btn" onClick={() => navigate('/')}>
                <ArrowLeft size={20} />
              </button>
              <h4>No Booking Data</h4>
            </div>
          </div>
          <div className="no-data-state">
            <div className="no-data-icon">
              <Bus size={48} />
            </div>
            <h3>No Booking Data Found</h3>
            <p>Please select seats first to continue with your booking.</p>
            <button className="primary-btn" onClick={() => navigate('/')}>
              <ArrowLeft size={16} />
              Go Back to Search
            </button>
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

    // Validate on change if field was already touched
    if (touched.passengers[index]?.[name]) {
      setPassengerErrors(prev => {
        const updated = [...prev];
        if (name === 'name') updated[index] = { ...updated[index], name: validateName(value) };
        if (name === 'age') updated[index] = { ...updated[index], age: validateAge(value) };
        return updated;
      });
    }
  };

  const handlePassengerBlur = (index, fieldName) => {
    setTouched(prev => {
      const updatedPassengers = [...prev.passengers];
      updatedPassengers[index] = { ...updatedPassengers[index], [fieldName]: true };
      return { ...prev, passengers: updatedPassengers };
    });
    const value = passengers[index][fieldName];
    setPassengerErrors(prev => {
      const updated = [...prev];
      if (fieldName === 'name') updated[index] = { ...updated[index], name: validateName(value) };
      if (fieldName === 'age') updated[index] = { ...updated[index], age: validateAge(value) };
      return updated;
    });
  };

  const handleContactChange = (e) => {
    const { name, value, type, checked } = e.target;
    const newValue = type === 'checkbox' ? checked : value;
    setContactDetails(prev => ({
      ...prev,
      [name]: newValue
    }));

    // Validate on change if already touched
    if (touched.contact[name]) {
      if (name === 'phone') setContactErrors(prev => ({ ...prev, phone: validatePhone(value) }));
      if (name === 'email') setContactErrors(prev => ({ ...prev, email: validateEmail(value) }));
      if (name === 'state') setContactErrors(prev => ({ ...prev, state: validateState(value) }));
    }
  };

  const handleContactBlur = (fieldName) => {
    setTouched(prev => ({
      ...prev,
      contact: { ...prev.contact, [fieldName]: true }
    }));
    const value = contactDetails[fieldName];
    if (fieldName === 'phone') setContactErrors(prev => ({ ...prev, phone: validatePhone(value) }));
    if (fieldName === 'email') setContactErrors(prev => ({ ...prev, email: validateEmail(value) }));
    if (fieldName === 'state') setContactErrors(prev => ({ ...prev, state: validateState(value) }));
  };

  const handleProceedToPayment = async () => {
    // Run full validation on all fields
    let hasErrors = false;

    // Validate all passengers
    const newPassengerErrors = passengers.map((p) => {
      const nameErr = validateName(p.name);
      const ageErr = validateAge(p.age);
      if (nameErr || ageErr) hasErrors = true;
      return { name: nameErr, age: ageErr };
    });
    setPassengerErrors(newPassengerErrors);

    // Validate contact
    const phoneErr = validatePhone(contactDetails.phone);
    const emailErr = validateEmail(contactDetails.email);
    const stateErr = validateState(contactDetails.state);
    if (phoneErr || emailErr || stateErr) hasErrors = true;
    setContactErrors({ phone: phoneErr, email: emailErr, state: stateErr });

    // Mark all fields as touched
    setTouched({
      passengers: passengers.map(() => ({ name: true, age: true })),
      contact: { phone: true, email: true, state: true },
    });

    if (hasErrors) {
      toast.warning('Please fix the errors in the form before proceeding');
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
      
      const blockSeatResponse = await busApi.blockSeat({
        bus,
        boardingPoint,
        droppingPoint,
        selectedSeats,
        passengers: passengersWithContact,
        contactDetails,
        fareData,
        assurance: assuranceSelected ? 'yes' : 'no',
      });
      
      // Store block seat response in context
      actions.setBlockSeatData(blockSeatResponse);
      actions.setPassengers(passengersWithContact);
      actions.setContactDetails(contactDetails);
      
      // Navigate to payment page with all booking data
      navigate('/payment', {
        state: {
          fareData,
          seatLayout,
          selectedSeats,
          boardingPoint,
          droppingPoint,
          bus,
          passengers: passengersWithContact,
          contactDetails,
          assurance: assuranceSelected ? 'yes' : 'no',
          promotion: appliedPromotion,
          walletPayment: { amount: walletAmount },
          blockSeatData: blockSeatResponse,
        }
      });
    } catch (error) {
      console.error("Block seat error:", error);
      toast.error(error.message || 'Unable to reserve seats. Please try again.');
    } finally {
      setIsBlocking(false);
    }
  };

  const handleBack = () => {
    navigate(-1);
  };

  return (
    <div className="details-page">
      {/* Progress Steps */}
      <div className="booking-progress">
        <div className="progress-step completed">
          <div className="step-icon"><CheckCircle2 size={18} /></div>
          <div className="step-copy"><small>Step 1</small><span>Seat selected</span></div>
        </div>
        <div className="progress-line completed"></div>
        <div className="progress-step active">
          <div className="step-icon"><User size={18} /></div>
          <div className="step-copy"><small>Step 2</small><span>Passenger info</span></div>
        </div>
        <div className="progress-line"></div>
        <div className="progress-step">
          <div className="step-icon"><CreditCard size={18} /></div>
          <div className="step-copy"><small>Step 3</small><span>Payment</span></div>
        </div>
      </div>

      <div className="details-container">
        {/* HEADER */}
        <div className="details-header booking-hero">
          <span className="hero-orbit hero-orbit-one" aria-hidden="true"></span>
          <span className="hero-orbit hero-orbit-two" aria-hidden="true"></span>
          <div className="header-left">
            <button className="back-btn" onClick={handleBack} aria-label="Go back">
              <ArrowLeft size={20} />
            </button>
            <div className="header-info">
              <span className="details-eyebrow"><Sparkles size={12} /> You’re almost there</span>
              <h1>Complete your booking</h1>
              <p>Add passenger details and review your trip before payment.</p>
            </div>
          </div>
          <div className="hero-meta">
            <div className="header-badge">
              <Lock size={14} />
              <span>Secure booking</span>
            </div>
            <span className="hero-seat-count"><Armchair size={15} /> {selectedSeats.length} seat{selectedSeats.length > 1 ? 's' : ''}</span>
          </div>
        </div>

      <div className="details-body">
        {/* LEFT SIDE - PASSENGER DETAILS (70%) */}
        <div className="passenger-section">
          {/* Bus Summary Card */}
          <div className="bus-summary-card">
            <div className="bus-summary-header">
              <div className="operator-lockup">
                <span className="operator-icon"><Bus size={20} /></span>
                <div>
                  <span className="summary-kicker">Your journey</span>
                  <strong>{operatorName}</strong>
                </div>
              </div>
              <span className="journey-date-pill"><CalendarDays size={14} /> {journeyDateLabel}</span>
            </div>
            <div className="bus-summary-content">
              <div className="bus-operator">
                <span className="bus-type-badge">{busType}</span>
                <span className="ticket-confirmation"><CheckCircle2 size={14} /> Ready to reserve</span>
              </div>
              <div className="journey-route">
                <div className="route-point">
                  <div className="point-info">
                    <span className="point-label">Boarding</span>
                    <span className="point-time">{boardingTime}</span>
                    <span className="point-name">{boardingName}</span>
                  </div>
                </div>
                <div className="route-line" aria-hidden="true">
                  <span className="point-marker start"></span>
                  <span className="route-dashes"></span>
                  <span className="route-bus"><Bus size={16} /></span>
                  <span className="route-dashes"></span>
                  <span className="point-marker end"></span>
                </div>
                <div className="route-point route-point-end">
                  <div className="point-info">
                    <span className="point-label">Dropping</span>
                    <span className="point-time">{droppingTime}</span>
                    <span className="point-name">{droppingName}</span>
                  </div>
                </div>
              </div>
              <div className="journey-footnote">
                <span><MapPinned size={15} /> Please arrive at the boarding point 15 minutes early</span>
                <span className="journey-seat-note"><Armchair size={15} /> Seat{selectedSeats.length > 1 ? 's' : ''} {selectedSeats.map((seat) => seat.seatName || seat).join(', ')}</span>
              </div>
            </div>
          </div>

          <div className="section-card">
            <div className="section-header">
              <div className="section-icon">
                <User size={20} />
              </div>
              <div className="section-title-group">
                <span className="section-kicker">01 · Travellers</span>
                <h3>Passenger Details</h3>
                <p className="section-subtitle">Enter details for {selectedSeats.length} passenger{selectedSeats.length > 1 ? 's' : ''}</p>
              </div>
            </div>

            {passengers.map((passenger, index) => (
              <div key={passenger.seatNumber} className="passenger-form">
                <div className="passenger-header">
                  <div className="passenger-info">
                    <span className="passenger-avatar">{String(index + 1).padStart(2, '0')}</span>
                    <div className="passenger-title">
                      <span className="passenger-number">Passenger {index + 1}</span>
                      <small>{index === 0 ? 'Booking contact' : 'Co-traveller'}</small>
                    </div>
                    {index === 0 && <span className="primary-badge">Primary</span>}
                  </div>
                  <div className="seat-tag">
                    <Armchair size={14} />
                    <span>Seat {passenger.seatNumber}</span>
                  </div>
                </div>

                <div className="form-row three-cols">
                  <div className={`form-group ${passengerErrors[index]?.name ? 'has-error' : ''}`}>
                    <label>
                      <User size={14} />
                      Full Name <span className="required">*</span>
                    </label>
                    <input
                      type="text"
                      name="name"
                      placeholder="Enter full name"
                      value={passenger.name}
                      onChange={(e) => handlePassengerChange(index, e)}
                      onBlur={() => handlePassengerBlur(index, 'name')}
                      className={passengerErrors[index]?.name ? 'input-error' : ''}
                    />
                    {passengerErrors[index]?.name && (
                      <span className="field-error">{passengerErrors[index].name}</span>
                    )}
                  </div>

                  <div className={`form-group ${passengerErrors[index]?.age ? 'has-error' : ''}`}>
                    <label>Age <span className="required">*</span></label>
                    <input
                      type="number"
                      name="age"
                      placeholder="Age"
                      min="5"
                      max="120"
                      value={passenger.age}
                      onChange={(e) => handlePassengerChange(index, e)}
                      onBlur={() => handlePassengerBlur(index, 'age')}
                      className={passengerErrors[index]?.age ? 'input-error' : ''}
                    />
                    {passengerErrors[index]?.age && (
                      <span className="field-error">{passengerErrors[index].age}</span>
                    )}
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
            <div className="section-header">
              <div className="section-icon">
                <Phone size={20} />
              </div>
              <div className="section-title-group">
                <span className="section-kicker">02 · Stay informed</span>
                <h3>Contact Details</h3>
                <p className="section-subtitle">Ticket details will be sent here</p>
              </div>
            </div>

            <div className="contact-form">
              <div className="contact-field-wrapper">
                <div className={`phone-input-group ${contactErrors.phone ? 'has-error' : ''}`}>
                  <div className="country-code">
                    <span className="code-label">Country</span>
                    <select
                      name="countryCode"
                      value={contactDetails.countryCode}
                      onChange={handleContactChange}
                    >
                      <option value="+91">🇮🇳 +91</option>
                      <option value="+1">🇺🇸 +1</option>
                      <option value="+44">🇬🇧 +44</option>
                      <option value="+971">🇦🇪 +971</option>
                    </select>
                  </div>
                  <div className={`phone-field ${contactErrors.phone ? 'input-error' : ''}`}>
                    <Phone size={18} className="field-icon" />
                    <input
                      type="tel"
                      name="phone"
                      placeholder="Enter phone number *"
                      maxLength={10}
                      value={contactDetails.phone}
                      onChange={handleContactChange}
                      onBlur={() => handleContactBlur('phone')}
                    />
                  </div>
                </div>
                {contactErrors.phone && (
                  <span className="field-error">{contactErrors.phone}</span>
                )}
              </div>

              <div className="contact-field-wrapper">
                <div className={`input-with-icon ${contactErrors.email ? 'has-error' : ''}`}>
                  <Mail size={18} className="field-icon" />
                  <input
                    type="email"
                    name="email"
                    placeholder="Email ID (for ticket confirmation)"
                    value={contactDetails.email}
                    onChange={handleContactChange}
                    onBlur={() => handleContactBlur('email')}
                    className={`contact-input ${contactErrors.email ? 'input-error' : ''}`}
                  />
                </div>
                {contactErrors.email && (
                  <span className="field-error">{contactErrors.email}</span>
                )}
              </div>

              <div className="contact-field-wrapper">
                <div className={`input-with-icon state-wrapper ${contactErrors.state ? 'has-error' : ''}`}>
                  <MapPin size={18} className="field-icon" />
                  <select
                    name="state"
                    value={contactDetails.state}
                    onChange={handleContactChange}
                    onBlur={() => handleContactBlur('state')}
                    className={`contact-input ${contactErrors.state ? 'input-error' : ''}`}
                  >
                    <option value="">Select State of Residence *</option>
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
                </div>
                {contactErrors.state ? (
                  <span className="field-error">{contactErrors.state}</span>
                ) : (
                  <span className="input-hint">Required for GST invoicing</span>
                )}
              </div>

              <div className="whatsapp-toggle">
                <div className="whatsapp-icon">
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="#25D366">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                </div>
                <div className="whatsapp-content">
                  <span className="whatsapp-title">WhatsApp Updates</span>
                  <span className="whatsapp-text">Get booking details & trip updates</span>
                </div>
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
          <div
            className="section-card assurance-card assurance-coming-soon-card"
            aria-disabled={!ASSURANCE_AVAILABLE}
          >
            <div className="assurance-header">
              <div className="assurance-icon">
                <Shield size={24} />
              </div>
              <div className="assurance-title">
                <span className="section-kicker">03 · Optional protection</span>
                <h3>Sancharie Assurance</h3>
                <span className="assurance-price">₹{assurancePrice} per passenger</span>
              </div>
              <div className="assurance-badge">
                <span>Recommended</span>
              </div>
            </div>

            <div className="assurance-benefits">
              <div className="benefit-card">
                <div className="benefit-icon refund">
                  <CreditCard size={20} />
                </div>
                <div className="benefit-info">
                  <span className="benefit-label">If bus cancelled, get</span>
                  <span className="benefit-value">₹{Number(fareData.baseFare || 0) + 500}</span>
                  <span className="benefit-breakdown">₹{fareData.baseFare} + ₹500 bonus</span>
                </div>
              </div>
              <div className="benefit-card">
                <div className="benefit-icon medical">
                  <Shield size={20} />
                </div>
                <div className="benefit-info">
                  <span className="benefit-label">Medical Coverage</span>
                  <span className="benefit-value">₹75,000</span>
                  <span className="benefit-breakdown">Hospitalization</span>
                </div>
              </div>
              <div className="benefit-card">
                <div className="benefit-icon life">
                  <CheckCircle2 size={20} />
                </div>
                <div className="benefit-info">
                  <span className="benefit-label">Accidental Cover</span>
                  <span className="benefit-value">₹5,00,000</span>
                  <span className="benefit-breakdown">Death/PTD/PPD</span>
                </div>
              </div>
            </div>

            <div className="assurance-options">
              <label className={`assurance-option ${assurance === 'yes' ? 'selected' : ''}`}>
                <div className="option-content">
                  <CheckCircle2 size={18} className={assurance === 'yes' ? 'checked' : ''} />
                  <span>Yes, protect my trip at ₹{assuranceTotal}</span>
                </div>
                <input
                  type="radio"
                  name="assurance"
                  value="yes"
                  checked={assuranceSelected}
                  onChange={(e) => setAssurance(e.target.value)}
                  disabled={!ASSURANCE_AVAILABLE}
                />
                <span className="radio-circle"></span>
              </label>

              <label className={`assurance-option ${assurance === 'no' ? 'selected' : ''}`}>
                <div className="option-content">
                  <span>No, I'll skip the protection</span>
                </div>
                <input
                  type="radio"
                  name="assurance"
                  value="no"
                  checked={!assuranceSelected}
                  onChange={(e) => setAssurance(e.target.value)}
                  disabled={!ASSURANCE_AVAILABLE}
                />
                <span className="radio-circle"></span>
              </label>
            </div>

            <button type="button" className="terms-link" disabled={!ASSURANCE_AVAILABLE}>
              <Info size={14} />
              View Terms & Conditions
            </button>

            {!ASSURANCE_AVAILABLE && (
              <div className="assurance-coming-soon-overlay" role="status">
                <div className="assurance-coming-soon-message">
                  <span className="coming-soon-badge">
                    <Sparkles size={13} /> Coming soon
                  </span>
                  <h3>Sancharie Assurance</h3>
                  <p>We’re fine-tuning trip protection to make every journey more worry-free.</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT SIDE - FARE DETAILS (30%) */}
        <div className="fare-section">
          <div className="fare-card">
            <div className="fare-card-header">
              <div>
                <span className="fare-kicker">Booking total</span>
                <h3>Fare Summary</h3>
              </div>
              <span className="fare-header-icon"><CreditCard size={19} /></span>
            </div>

            <div className="selected-seats-display">
              <div className="seats-header">
                <Armchair size={16} />
                <span>Selected Seats ({selectedSeats.length})</span>
              </div>
              <div className="seats-list">
                {selectedSeats.map((seat, index) => (
                  <span key={seat.seatName || index} className="seat-badge">{seat.seatName || seat}</span>
                ))}
              </div>
            </div>

            <div className="fare-breakdown">
              <div className="fare-row">
                <span>Base Fare ({fareData.seatCount} seat{fareData.seatCount > 1 ? 's' : ''})</span>
                <span>₹{fareData.baseFare}</span>
              </div>
              <div className="fare-row">
                <span>GST/Service Tax</span>
                <span>₹{fareData.serviceTax || fareData.gst || 0}</span>
              </div>
              {appliedPromotion && <div className="fare-row promo-discount-row">
                <span><Check size={14} /> Discount · {appliedPromotion.code || appliedPromotion.name}</span>
                <span>−₹{Number(appliedPromotion.discountAmount).toLocaleString('en-IN')}</span>
              </div>}
              <label className={`fare-row wallet-use-row ${!walletEligible ? 'unavailable' : ''}`}>
                <span><input type="checkbox" checked={useWallet && walletEligible} disabled={!walletEligible || wallet.loading} onChange={(event) => setUseWallet(event.target.checked)} />
                  <span><strong>Use wallet balance</strong><small>{wallet.loading ? 'Checking available balance…' : wallet.balance <= 0 ? 'No wallet balance available' : walletEligible ? `Available: ₹${wallet.balance.toLocaleString('en-IN')}` : `Wallet can be used on bookings from ₹${wallet.minimumBookingAmount.toLocaleString('en-IN')}`}</small></span>
                </span>
                <strong>{walletAmount > 0 ? `−₹${walletAmount.toLocaleString('en-IN')}` : ''}</strong>
              </label>
              {(fareData.operatorCharge > 0 || fareData.serviceCharge > 0) && (
                <div className="fare-row">
                  <span>Service Charge</span>
                  <span>₹{fareData.operatorCharge || fareData.serviceCharge || 0}</span>
                </div>
              )}
              {assuranceSelected && (
                <div className="fare-row assurance-row">
                  <span>
                    <Shield size={14} />
                    Sancharie Assurance
                  </span>
                  <span>₹{assuranceTotal}</span>
                </div>
              )}
              <div className="fare-row total">
                <span><small>Payable now</small>Total Amount</span>
                <span>₹{payableTotal}</span>
              </div>
            </div>

            <button type="button" className="promo-trigger" aria-expanded={promoExpanded} onClick={() => { setPromoError(''); setPromoExpanded((expanded) => !expanded); }}>
              <Ticket size={17} />
              {appliedPromotion ? <><span><strong>{appliedPromotion.code || appliedPromotion.name}</strong><small>Promo applied · save ₹{Number(appliedPromotion.discountAmount).toLocaleString('en-IN')}</small></span><span className="promo-trigger-action" onClick={(event) => { event.stopPropagation(); setAppliedPromotion(null); setPromoInput(''); setPromoError(''); }}>Remove</span></> : <><span><strong>Have a promo code?</strong><small>Enter a code or choose an offer</small></span><ChevronRight size={17} /> </>}
            </button>

            {promoExpanded && <section className="promo-accordion" aria-label="Apply a promo code">
              <h4><Ticket size={16} /> Apply promo code</h4>
              <form className="promo-code-form" onSubmit={(event) => { event.preventDefault(); applyPromoCode(); }}>
                <input aria-label="Promo code" placeholder="Enter promo code" value={promoInput} onChange={(event) => { setPromoInput(event.target.value.toUpperCase()); setPromoError(''); }} />
                <button type="submit" className={appliedPromotion ? 'applied' : ''} disabled={isApplyingPromo || Boolean(appliedPromotion)}>{isApplyingPromo ? 'Checking…' : appliedPromotion ? 'Applied' : 'Apply code'}</button>
              </form>
              {promoError && <span className="promo-error" role="alert">{promoError}</span>}

              <div className="promo-available-heading"><strong>Available discounts</strong>{loadingPromotions && <small>Loading…</small>}</div>
              {!loadingPromotions && availablePromotions.length === 0 && <p className="promo-empty">No active discount offers right now. You can still enter a promo code above.</p>}
              <div className="promo-available-list">
                {availablePromotions.map((promotion, index) => {
                  const isPercentage = promotion.promotionType === 'discount' || promotion.type === 'percentage';
                  const discountLabel = isPercentage ? `${Number(promotion.percentage ?? promotion.value) || 0}% OFF` : `₹${Number(promotion.value) || 0} OFF`;
                  const code = promotion.code || '';
                  const selected = Boolean(appliedPromotion && ((code && appliedPromotion.code === code) || (promotion._id && appliedPromotion.promotionId === String(promotion._id))));
                  return <button
                    type="button"
                    className={`promo-available-card ${selected ? 'selected' : ''}`}
                    key={promotion._id || `${code}-${index}`}
                    onClick={() => {
                      setPromoInput(code);
                      applyPromoCode(code, code ? '' : promotion._id);
                    }}
                    disabled={isApplyingPromo}
                  >
                    <span className="promo-available-badge">{discountLabel}</span>
                    <span className="promo-available-copy"><strong>{promotion.name || code || 'Special offer'}</strong><small>{promotion.description || (code ? `Use code ${code}` : 'Offer applied automatically')}</small></span>
                    <span className="promo-available-action">{selected ? 'Applied' : 'Apply'}</span>
                    {Number(promotion.maximumDiscount) > 0 && <small className="promo-available-terms">Up to ₹{Number(promotion.maximumDiscount).toLocaleString('en-IN')} off</small>}
                    {Number(promotion.minimumBooking) > 0 && <small className="promo-available-terms">Min. booking ₹{Number(promotion.minimumBooking).toLocaleString('en-IN')}</small>}
                  </button>;
                })}
              </div>
            </section>}

            <CancellationPolicySummary
              bus={bus}
              selectedSeats={selectedSeats}
              fareData={fareData}
              originalFare={originalFare}
              promotion={appliedPromotion}
            />

            <button 
              className="proceed-btn" 
              onClick={handleProceedToPayment}
              disabled={isBlocking}
            >
              {isBlocking ? (
                <>
                  <span className="btn-loader"></span>
                  Blocking Seats...
                </>
              ) : (
                <>
                  Proceed to Payment
                  <ChevronRight size={18} />
                </>
              )}
            </button>

            <div className="secure-info">
              <Lock size={14} />
              <span>Your payment is 100% secure with SSL encryption</span>
            </div>
            <div className="booking-trust-list">
              <span><CheckCircle2 size={14} /> Seats held securely during payment</span>
              <span><CheckCircle2 size={14} /> Instant ticket after confirmation</span>
            </div>
          </div>
        </div>
      </div>

    </div>
    </div>
  );
}
