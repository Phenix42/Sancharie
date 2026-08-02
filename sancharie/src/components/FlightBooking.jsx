import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle2, ChevronLeft, Plane, ShieldCheck, XCircle } from 'lucide-react';
import { flights as flightApi, payment as paymentApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { createBookingReference, persistBookingUpdate } from '../utils/bookingSync';
import './FlightBooking.css';

const formatMoney = (value) => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
}).format(Number(value || 0));

const formatDateTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const plainText = (html) => String(html || '')
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

const findDeepValue = (value, names, visited = new Set()) => {
  if (!value || typeof value !== 'object' || visited.has(value)) return '';
  visited.add(value);

  for (const name of names) {
    if (value[name] !== undefined && value[name] !== null && value[name] !== '') {
      return value[name];
    }
  }

  for (const child of Object.values(value)) {
    const found = findDeepValue(child, names, visited);
    if (found !== '') return found;
  }

  return '';
};

const getFlightFareAmount = (value) => {
  const result = value?.fareConfirmation || value?.Result || value || {};
  const fare = result?.Fare || {};
  return Number(
    fare.PublishedPriceRoundedOff ||
    fare.PublishedPrice ||
    fare.OfferedPriceRoundedOff ||
    fare.OfferedPrice ||
    result.PublishedPriceRoundedOff ||
    result.PublishedPrice ||
    result.OfferedPriceRoundedOff ||
    result.OfferedPrice ||
    0
  );
};

const countSeatOptions = (value, visited = new Set()) => {
  if (!value || typeof value !== 'object' || visited.has(value)) return 0;
  visited.add(value);
  if (value.SeatNo && value.Code) return 1;
  return Object.values(value).reduce((sum, child) => sum + countSeatOptions(child, visited), 0);
};

const toProviderDate = (value) => value ? `${value}T00:00:00` : '';

export default function FlightBooking() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, user, createBooking, updateBooking } = useAuth();
  const draft = location.state || null;
  const flight = draft?.flight;
  const [confirmation, setConfirmation] = useState(draft?.confirmation || null);
  const [selectedMealKey, setSelectedMealKey] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [bookingResult, setBookingResult] = useState(null);
  const [bookingDetail, setBookingDetail] = useState(null);
  const [cancellation, setCancellation] = useState(null);
  const [passenger, setPassenger] = useState({
    title: 'Mr',
    firstName: user?.name?.split(' ')[0] || '',
    lastName: user?.name?.split(' ').slice(1).join(' ') || '',
    dateOfBirth: '',
    gender: '1',
    nationality: 'IN',
    passportNo: '',
    passportIssue: '',
    passportExpiry: '',
    pan: '',
    addressLine1: '',
    city: '',
    countryCode: 'IN',
    countryName: 'India',
    contactNo: user?.phone || '',
    email: user?.email || '',
  });

  const confirmedFare = confirmation?.fareConfirmation || confirmation?.Result || null;
  const fareRules = useMemo(
    () => (draft?.fareRules?.fareRules || draft?.fareRules?.Result || [])
      .map((rule) => plainText(rule.FareRuleDetail))
      .filter(Boolean),
    [draft]
  );
  const mealOptions = useMemo(() => {
    const meals = draft?.ssr?.ssr?.Meal || draft?.ssr?.Result?.Meal || [];
    const unique = new Map();
    meals.flat(Infinity).filter((meal) => meal?.Code).forEach((meal) => {
      unique.set(meal.Key || meal.Code, meal);
    });
    return [...unique.values()];
  }, [draft]);
  const seatCount = useMemo(
    () => countSeatOptions(draft?.ssr?.ssr?.Seats || draft?.ssr?.Result?.Seats),
    [draft]
  );
  const selectedMeal = mealOptions.find((meal) => (meal.Key || meal.Code) === selectedMealKey);
  const basePrice = getFlightFareAmount(confirmedFare) || Number(flight?.price || 0);
  const totalPrice = basePrice + Number(selectedMeal?.Price || 0);
  const originCountry = flight?.segments?.[0]?.Origin?.CountryCode;
  const destinationCountry = flight?.segments?.at(-1)?.Destination?.CountryCode;
  const internationalFlight = Boolean(originCountry && destinationCountry && originCountry !== destinationCountry);
  const passportRequired = Boolean(confirmedFare?.IsPassportRequiredAtBook);
  const panRequired = Boolean(confirmedFare?.IsPanRequiredAtBook);
  const travelDocumentRequired = passportRequired || internationalFlight;
  const busy = status === 'checking' || status === 'payment' || status === 'booking';

  if (!flight) {
    return (
      <main className="flight-booking-page">
        <section className="flight-booking-empty">
          <Plane size={42} />
          <h1>No flight selected</h1>
          <p>Please return to flight search and choose a fare again.</p>
          <button type="button" onClick={() => navigate('/')}>Back to search</button>
        </section>
      </main>
    );
  }

  const updatePassenger = (event) => {
    const { name, value } = event.target;
    setPassenger((current) => ({ ...current, [name]: value }));
  };

  const buildPassengerPayload = () => ({
    Title: passenger.title,
    FirstName: passenger.firstName.trim(),
    LastName: passenger.lastName.trim(),
    PaxType: 1,
    DateOfBirth: toProviderDate(passenger.dateOfBirth),
    Gender: Number(passenger.gender),
    PassportNo: passenger.passportNo.trim(),
    PassportIssue: toProviderDate(passenger.passportIssue),
    PassportExpiry: toProviderDate(passenger.passportExpiry),
    Nationality: passenger.nationality.trim().toUpperCase(),
    PAN: passenger.pan.trim().toUpperCase(),
    AddressLine1: passenger.addressLine1.trim(),
    AddressLine2: '',
    City: passenger.city.trim(),
    CountryCode: passenger.countryCode.trim().toUpperCase(),
    CountryName: passenger.countryName.trim(),
    ContactNo: passenger.contactNo.replace(/\D/g, ''),
    Email: passenger.email.trim(),
    IsLeadPax: true,
    FFAirline: '',
    FFNumber: '',
    Baggage: [],
    Meal: selectedMeal ? [selectedMeal] : [],
    GSTCompanyAddress: '',
    GSTCompanyContactNumber: '',
    GSTCompanyName: '',
    GSTNumber: '',
    GSTCompanyEmail: '',
  });

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (!isAuthenticated) {
      setError('Please sign in from the header before completing your booking.');
      return;
    }
    if (!agreed) {
      setError('Please accept the fare and cancellation rules before continuing.');
      return;
    }

    let paymentVerified = false;
    let paymentVerification = null;
    let bookingRecordId = '';
    let lifecycleStage = 'fare_check';

    try {
      setStatus('checking');
      const latestConfirmation = await flightApi.confirmFare(flight.searchTokenId, flight.resultIndex);
      const latestFare = latestConfirmation.fareConfirmation || latestConfirmation.Result;
      const latestPrice = getFlightFareAmount(latestFare);

      if (latestConfirmation.IsPriceChanged && latestPrice && latestPrice !== basePrice) {
        setConfirmation(latestConfirmation);
        setStatus('idle');
        setError(`The airline changed this fare to ${formatMoney(latestPrice)}. Please review and submit again.`);
        return;
      }

      setConfirmation(latestConfirmation);
      setStatus('payment');
      const payablePrice = (latestPrice || basePrice) + Number(selectedMeal?.Price || 0);

      const passengerAge = new Date(passenger.dateOfBirth).getFullYear()
        ? Math.max(1, new Date().getFullYear() - new Date(passenger.dateOfBirth).getFullYear())
        : 25;
      const bookingAttempt = await createBooking({
        clientReference: createBookingReference('flight'),
        serviceType: 'flight',
        status: 'pending',
        providerStatus: 'payment_pending',
        busName: flight.carrier || 'Airline',
        busType: 'Flight',
        busNumber: flight.flightNumber || '',
        source: flight.from,
        destination: flight.to,
        fromCity: flight.from,
        toCity: flight.to,
        journeyDate: flight.departureTime,
        departureTime: flight.departureTime,
        arrivalTime: flight.arrivalTime,
        seats: [],
        passengers: [{
          name: `${passenger.firstName} ${passenger.lastName}`.trim(),
          age: passengerAge,
          gender: passenger.gender === '1' ? 'male' : 'female',
        }],
        baseFare: Number(latestFare?.Fare?.BaseFare || latestPrice || totalPrice),
        serviceTax: Number(latestFare?.Fare?.Tax || 0),
        totalFare: payablePrice,
        paymentStatus: 'pending',
        paymentMethod: 'razorpay',
      });

      if (!bookingAttempt?.success || !bookingAttempt.booking?.id) {
        throw new Error(bookingAttempt?.message || 'Unable to safely create your booking record. No payment was taken.');
      }
      bookingRecordId = bookingAttempt.booking.id;

      lifecycleStage = 'payment';
      paymentVerification = await paymentApi.initiatePayment({
        amount: payablePrice,
        customerInfo: {
          name: `${passenger.firstName} ${passenger.lastName}`.trim(),
          email: passenger.email,
          phone: passenger.contactNo,
        },
        bookingDetails: {
          serviceType: 'flight',
          pricingRef: `${flight.searchTokenId}:${flight.resultIndex}`,
          description: `Flight ${flight.flightNumber} booking`,
          busName: `${flight.carrier} ${flight.flightNumber}`,
          travelDate: flight.departureTime,
          passengerCount: 1,
        },
      });
      paymentVerified = Boolean(paymentVerification?.verified);

      await persistBookingUpdate(updateBooking, bookingRecordId, {
        status: 'pending',
        paymentStatus: 'completed',
        paymentId: paymentVerification?.data?.payment_id || '',
        paymentOrderId: paymentVerification?.data?.order_id || '',
        paymentMethod: paymentVerification?.data?.method || 'razorpay',
        providerStatus: 'payment_verified',
        failureStage: '',
        failureReason: '',
      });

      lifecycleStage = 'provider_booking';
      setStatus('booking');
      const booked = await flightApi.book({
        searchTokenId: flight.searchTokenId,
        resultIndex: flight.resultIndex,
        passengers: [buildPassengerPayload()],
        paymentId: paymentVerification?.data?.payment_id,
      });
      setBookingResult(booked);

      const bookingId = findDeepValue(booked, ['BookingId', 'bookingId']);
      const pnr = findDeepValue(booked, ['PNR', 'Pnr', 'pnr']);
      let detail = null;

      if (bookingId || pnr) {
        try {
          detail = await flightApi.getBookingDetail({
            searchTokenId: flight.searchTokenId,
            bookingId,
            pnr,
          });
          setBookingDetail(detail);
        } catch {
          // A successful booking remains valid even if the detail refresh is delayed.
        }
      }

      await persistBookingUpdate(updateBooking, bookingRecordId, {
        status: 'confirmed',
        paymentStatus: 'completed',
        paymentId: paymentVerification?.data?.payment_id || '',
        paymentOrderId: paymentVerification?.data?.order_id || '',
        paymentMethod: paymentVerification?.data?.method || 'razorpay',
        externalBookingId: String(bookingId || ''),
        ticketNo: String(pnr || bookingId || ''),
        pnr: String(pnr || ''),
        providerStatus: 'confirmed',
        failureStage: '',
        failureReason: '',
      });

      setStatus('success');
    } catch (bookingError) {
      if (bookingRecordId) {
        await persistBookingUpdate(updateBooking, bookingRecordId, {
          status: 'failed',
          paymentStatus: paymentVerified ? 'completed' : 'failed',
          providerStatus: paymentVerified ? 'booking_failed' : 'payment_failed',
          failureStage: lifecycleStage,
          failureReason: bookingError.message || 'Flight booking failed',
        });
      }
      setStatus('idle');
      setError(paymentVerified
        ? `Payment was verified, but airline booking needs attention: ${bookingError.message}. Please contact support before paying again.`
        : bookingError.message || 'Booking could not be completed. Please try again.');
    }
  };

  const handleCancellation = async () => {
    const source = bookingDetail || bookingResult;
    const bookingId = findDeepValue(source, ['BookingId', 'bookingId']);
    if (!bookingId || !window.confirm('Send a full cancellation request for this flight?')) return;

    setError('');
    setStatus('booking');
    try {
      const result = await flightApi.cancelBooking({
        searchTokenId: flight.searchTokenId,
        bookingId,
        remark: 'Cancelled by customer',
      });
      setCancellation(result);
      setStatus('success');
    } catch (cancelError) {
      setStatus('success');
      setError(cancelError.message || 'Cancellation request could not be submitted.');
    }
  };

  if (status === 'success') {
    const source = bookingDetail || bookingResult;
    const bookingId = findDeepValue(source, ['BookingId', 'bookingId']);
    const pnr = findDeepValue(source, ['PNR', 'Pnr', 'pnr']);
    return (
      <main className="flight-booking-page">
        <section className="flight-booking-success">
          {cancellation ? <XCircle size={54} /> : <CheckCircle2 size={54} />}
          <h1>{cancellation ? 'Cancellation requested' : 'Flight booked successfully'}</h1>
          {bookingId && <p><strong>Booking ID:</strong> {String(bookingId)}</p>}
          {pnr && <p><strong>PNR:</strong> {String(pnr)}</p>}
          <div className="flight-success-actions">
            <button type="button" onClick={() => navigate('/')}>Back to home</button>
            {!cancellation && bookingId && (
              <button type="button" className="danger" onClick={handleCancellation}>Request cancellation</button>
            )}
          </div>
          {error && <div className="flight-form-error" role="alert">{error}</div>}
        </section>
      </main>
    );
  }

  return (
    <main className="flight-booking-page">
      <button className="flight-back-button" type="button" onClick={() => navigate(-1)}>
        <ChevronLeft size={18} /> Back to flights
      </button>

      <div className="flight-booking-layout">
        <section className="flight-review-panel">
          <div className="flight-review-heading">
            <Plane size={24} />
            <div>
              <h1>Review your flight</h1>
              <p>Fare checked directly with the airline provider</p>
            </div>
          </div>

          <div className="flight-review-route">
            <div><strong>{flight.from}</strong><span>{formatDateTime(flight.departureTime)}</span></div>
            <div className="flight-review-line"><span>{flight.duration}</span><i /></div>
            <div><strong>{flight.to}</strong><span>{formatDateTime(flight.arrivalTime)}</span></div>
          </div>
          <div className="flight-review-carrier">
            <span>{flight.carrier} · {flight.flightNumber}</span>
            <span>{flight.stops}</span>
          </div>

          {(draft?.preparationWarnings || []).map((warning) => (
            <div className="flight-preparation-warning" key={warning}>{warning}</div>
          ))}

          <div className="flight-fare-summary">
            <div><span>Fare</span><strong>{formatMoney(basePrice)}</strong></div>
            {selectedMeal && <div><span>Meal</span><strong>{formatMoney(selectedMeal.Price)}</strong></div>}
            <div className="total"><span>Total</span><strong>{formatMoney(totalPrice)}</strong></div>
          </div>

          <div className="flight-rule-box">
            <h2>Fare rules</h2>
            <p>{fareRules[0] || flight.fareType || 'Airline fare and cancellation rules apply.'}</p>
          </div>
        </section>

        <form className="flight-passenger-form" onSubmit={handleSubmit}>
          <div className="flight-form-heading">
            <h2>Lead traveller</h2>
            <span>1 adult</span>
          </div>

          {!isAuthenticated && (
            <div className="flight-signin-notice">Please sign in from the header before payment and booking.</div>
          )}
          {error && <div className="flight-form-error" role="alert">{error}</div>}

          <div className="flight-form-grid three">
            <label>Title<select name="title" value={passenger.title} onChange={updatePassenger}><option>Mr</option><option>Ms</option><option>Mrs</option></select></label>
            <label>First name<input name="firstName" value={passenger.firstName} onChange={updatePassenger} required /></label>
            <label>Last name<input name="lastName" value={passenger.lastName} onChange={updatePassenger} required /></label>
          </div>

          <div className="flight-form-grid">
            <label>Date of birth<input type="date" name="dateOfBirth" value={passenger.dateOfBirth} onChange={updatePassenger} required /></label>
            <label>Gender<select name="gender" value={passenger.gender} onChange={updatePassenger}><option value="1">Male</option><option value="2">Female</option></select></label>
          </div>

          <div className="flight-form-grid">
            <label>Mobile<input name="contactNo" value={passenger.contactNo} onChange={updatePassenger} inputMode="numeric" pattern="[0-9 +()-]{8,16}" required /></label>
            <label>Email<input type="email" name="email" value={passenger.email} onChange={updatePassenger} required /></label>
          </div>

          <div className="flight-form-grid">
            <label>Address<input name="addressLine1" value={passenger.addressLine1} onChange={updatePassenger} required /></label>
            <label>City<input name="city" value={passenger.city} onChange={updatePassenger} required /></label>
          </div>

          {travelDocumentRequired && (
            <div className="flight-document-section">
              <h3>Travel document (required)</h3>
              <div className="flight-form-grid three">
                <label>Passport number<input name="passportNo" value={passenger.passportNo} onChange={updatePassenger} required /></label>
                <label>Issue date<input type="date" name="passportIssue" value={passenger.passportIssue} onChange={updatePassenger} required /></label>
                <label>Expiry date<input type="date" name="passportExpiry" value={passenger.passportExpiry} onChange={updatePassenger} required /></label>
              </div>
            </div>
          )}

          {panRequired && <label className="flight-full-field">PAN<input name="pan" value={passenger.pan} onChange={updatePassenger} required /></label>}

          {mealOptions.length > 0 && (
            <label className="flight-full-field">Meal preference
              <select value={selectedMealKey} onChange={(event) => setSelectedMealKey(event.target.value)}>
                <option value="">No meal selected</option>
                {mealOptions.slice(0, 60).map((meal) => (
                  <option key={meal.Key || meal.Code} value={meal.Key || meal.Code}>
                    {meal.AirlineDescription || meal.Code} {meal.Price ? `(+${formatMoney(meal.Price)})` : ''}
                  </option>
                ))}
              </select>
            </label>
          )}

          {seatCount > 0 && <p className="flight-ssr-note">{seatCount} airline seat options are available; allocation is finalized by the provider.</p>}

          <label className="flight-terms">
            <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
            <span>I accept the airline fare, baggage, cancellation, and passenger-name rules.</span>
          </label>

          <button className="flight-pay-button" type="submit" disabled={busy || !isAuthenticated}>
            <ShieldCheck size={18} />
            {status === 'checking' ? 'Rechecking fare…' : status === 'payment' ? 'Opening payment…' : status === 'booking' ? 'Confirming booking…' : `Pay ${formatMoney(totalPrice)} & Book`}
          </button>
        </form>
      </div>
    </main>
  );
}
