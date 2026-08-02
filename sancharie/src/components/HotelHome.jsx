import { useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  BedDouble,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  Hotel,
  Loader2,
  MapPin,
  Minus,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  UserRound,
  Users,
} from 'lucide-react';
import { hotels, payment } from '../services';
import { useAuth } from '../context/AuthContext';
import { createBookingReference, persistBookingUpdate } from '../utils/bookingSync';
import './HotelHome.css';

const addDays = (offset) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().split('T')[0];
};

const formatMoney = (value, currency = 'INR') => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency,
  maximumFractionDigits: 0,
}).format(Number(value || 0));

const getNights = (checkIn, checkOut) => {
  const start = new Date(`${checkIn}T00:00:00`);
  const end = new Date(`${checkOut}T00:00:00`);
  return Math.max(1, Math.round((end - start) / 86400000) || 1);
};

function Counter({ label, hint, value, min = 0, max = 8, onChange }) {
  return (
    <div className="hh-counter">
      <span><b>{label}</b><small>{hint}</small></span>
      <div>
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min}><Minus size={14} /></button>
        <strong>{value}</strong>
        <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}><Plus size={14} /></button>
      </div>
    </div>
  );
}

export default function HotelHome() {
  const { isAuthenticated, createBooking, updateBooking } = useAuth();
  const [cities, setCities] = useState([]);
  const [cityQuery, setCityQuery] = useState('Hyderabad');
  const [selectedCity, setSelectedCity] = useState(null);
  const [cityOpen, setCityOpen] = useState(false);
  const [checkIn, setCheckIn] = useState(addDays(1));
  const [checkOut, setCheckOut] = useState(addDays(2));
  const [roomsCount, setRoomsCount] = useState(1);
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [guestOpen, setGuestOpen] = useState(false);
  const [minRating, setMinRating] = useState(0);
  const [results, setResults] = useState([]);
  const [source, setSource] = useState('');
  const [searchToken, setSearchToken] = useState('');
  const [selectedHotel, setSelectedHotel] = useState(null);
  const [hotelInfo, setHotelInfo] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [, setBlockData] = useState(null);
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [contact, setContact] = useState({
    title: 'Mr',
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
  });

  const filteredCities = useMemo(() => {
    const query = cityQuery.trim().toLowerCase();
    if (!query) return cities.slice(0, 8);
    return cities.filter((city) =>
      `${city.name} ${city.state} ${city.countryName} ${city.id}`.toLowerCase().includes(query)
    ).slice(0, 8);
  }, [cities, cityQuery]);

  const selectedRoomPrice = Number(selectedRoom?.price || 0);
  const nights = getNights(checkIn, checkOut);
  const totalAmount = selectedRoomPrice * roomsCount;
  const guestSummary = `${roomsCount} room${roomsCount > 1 ? 's' : ''}, ${adults} adult${adults > 1 ? 's' : ''}${children ? `, ${children} child${children > 1 ? 'ren' : ''}` : ''}`;

  useEffect(() => {
    let mounted = true;
    hotels.getCities()
      .then((data) => {
        if (!mounted) return;
        setCities(data.cities);
        const defaultCity = data.cities.find((city) => city.name.toLowerCase() === 'hyderabad') || data.cities[0] || null;
        setSelectedCity(defaultCity);
        if (defaultCity) setCityQuery(defaultCity.name);
      })
      .catch(() => setError('Hotel city list could not be loaded.'));
    return () => {
      mounted = false;
    };
  }, []);

  const resetSelection = () => {
    setSelectedHotel(null);
    setHotelInfo(null);
    setRooms([]);
    setSelectedRoom(null);
    setBlockData(null);
    setBooking(null);
  };

  const handleSearch = async () => {
    setError('');
    setNotice('');
    resetSelection();

    const city = selectedCity || cities.find((item) => item.name.toLowerCase() === cityQuery.trim().toLowerCase());
    if (!city?.id) {
      setError('Select a destination city from the list.');
      return;
    }
    if (new Date(checkOut) <= new Date(checkIn)) {
      setError('Check-out must be after check-in.');
      return;
    }

    setLoading('search');
    try {
      const data = await hotels.search({
        checkInDate: checkIn,
        checkOutDate: checkOut,
        destinationCityId: city.id,
        countryCode: city.countryCode || 'IN',
        guestNationality: 'IN',
        currency: 'INR',
        noOfRooms: roomsCount,
        roomGuests: [{ adult: adults, child: children, childAges: Array.from({ length: children }, () => 8) }],
        minRating,
        maxRating: 5,
        resultCount: 60,
      });
      setResults(data.hotels);
      setSearchToken(data.searchToken);
      setSource(data.source || '');
      if (data.source === 'mock') {
        setNotice('Development hotel data is active until HOTEL_API credentials and provider city IDs are configured.');
      }
    } catch (err) {
      setError(err.message || 'Hotel search failed.');
    } finally {
      setLoading('');
    }
  };

  const selectHotel = async (hotel) => {
    setError('');
    setNotice('');
    setSelectedHotel(hotel);
    setSelectedRoom(null);
    setBlockData(null);
    setBooking(null);
    setLoading(`hotel-${hotel.id}`);

    try {
      const request = {
        searchToken: hotel.searchToken || searchToken,
        resultIndex: hotel.resultIndex,
        hotelCode: hotel.hotelCode,
      };
      const [infoData, roomData] = await Promise.all([
        hotels.getInfo(request),
        hotels.getRooms(request),
      ]);
      setHotelInfo(infoData.hotelInfo);
      setRooms(roomData.roomOptions);
      setSelectedRoom(roomData.roomOptions[0] || null);
    } catch (err) {
      setError(err.message || 'Could not load hotel rooms.');
    } finally {
      setLoading('');
    }
  };

  const blockSelectedRoom = async () => {
    if (!selectedHotel || !selectedRoom) {
      setError('Choose a room before continuing.');
      return null;
    }

    setError('');
    setLoading('block');
    try {
      const data = await hotels.blockRoom({
        searchToken: selectedHotel.searchToken || searchToken,
        resultIndex: selectedHotel.resultIndex,
        hotelCode: selectedHotel.hotelCode,
        hotelName: selectedHotel.name,
        guestNationality: 'IN',
        noOfRooms: roomsCount,
        hotelRoomDetails: selectedRoom.hotelRoomDetails || [selectedRoom.raw],
      });
      setBlockData(data.block || data.Result);
      if (data.roomOptions?.length) {
        const updatedRoom = data.roomOptions.find((room) => room.roomTypeCode === selectedRoom.roomTypeCode) || data.roomOptions[0];
        setSelectedRoom(updatedRoom);
      }
      setNotice(data.IsPriceChanged || data.block?.IsPriceChanged ? 'Room price changed. Review the updated price before booking.' : 'Room availability verified.');
      return data;
    } catch (err) {
      setError(err.message || 'Room verification failed.');
      return null;
    } finally {
      setLoading('');
    }
  };

  const validateGuest = () => {
    if (!contact.firstName.trim() || !contact.lastName.trim()) return 'Enter lead guest first and last name.';
    if (!/^[6-9]\d{9}$/.test(contact.phone.trim())) return 'Enter a valid 10-digit Indian mobile number.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email.trim())) return 'Enter a valid email address.';
    return '';
  };

  const completeBooking = async ({ skipPayment = false } = {}) => {
    const guestError = validateGuest();
    if (guestError) {
      setError(guestError);
      return;
    }
    if (!isAuthenticated) {
      setError('Please sign in before booking so this stay is saved to My Bookings.');
      return;
    }

    setError('');
    setLoading(skipPayment ? 'book-test' : 'payment');

    let bookingRecordId = '';
    let lifecycleStage = 'price_check';
    let paymentVerified = false;

    try {
      const blocked = await blockSelectedRoom();
      if (!blocked) return;
      const paymentAmount = Number(blocked.requiredAmount || totalAmount);

      const destinationName = selectedCity?.name || cityQuery || 'Hotel destination';
      const bookingAttempt = await createBooking({
        clientReference: createBookingReference('hotel'),
        serviceType: 'hotel',
        status: 'pending',
        providerStatus: skipPayment ? 'test_booking_pending' : 'payment_pending',
        busName: selectedHotel.name || 'Hotel',
        busType: selectedRoom.name || selectedRoom.roomType || 'Hotel room',
        busNumber: selectedHotel.hotelCode || selectedHotel.id || '',
        source: destinationName,
        destination: selectedHotel.name || destinationName,
        fromCity: destinationName,
        toCity: destinationName,
        journeyDate: checkIn,
        departureTime: checkIn,
        arrivalTime: checkOut,
        boardingPoint: selectedHotel.address || hotelInfo?.address || destinationName,
        droppingPoint: selectedHotel.address || hotelInfo?.address || destinationName,
        seats: [],
        passengers: [{
          name: `${contact.firstName} ${contact.lastName}`.trim(),
          age: 30,
          gender: contact.title === 'Ms' || contact.title === 'Mrs' ? 'female' : 'male',
          seatNumber: `${roomsCount} room${roomsCount === 1 ? '' : 's'}`,
        }],
        baseFare: paymentAmount,
        serviceTax: 0,
        totalFare: paymentAmount,
        paymentStatus: 'pending',
        paymentMethod: skipPayment ? 'test' : 'razorpay',
      });

      if (!bookingAttempt?.success || !bookingAttempt.booking?.id) {
        throw new Error(bookingAttempt?.message || 'Unable to safely create your booking record. No payment was taken.');
      }
      bookingRecordId = bookingAttempt.booking.id;

      let paymentId = '';
      if (!skipPayment) {
        lifecycleStage = 'payment';
        const verification = await payment.initiatePayment({
          amount: paymentAmount,
          customerInfo: {
            name: `${contact.firstName} ${contact.lastName}`,
            email: contact.email,
            phone: contact.phone,
          },
          bookingDetails: {
            serviceType: 'hotel',
            pricingRef: `${selectedHotel.searchToken || searchToken}:${selectedHotel.resultIndex}:${selectedHotel.hotelCode}`,
            description: `Hotel Booking - ${selectedHotel.name}`,
            hotelName: selectedHotel.name,
            travelDate: checkIn,
            rooms: roomsCount,
            passengerCount: adults + children,
          },
        });
        paymentId = verification.data?.payment_id || verification.data?.paymentId || '';
        paymentVerified = Boolean(verification?.verified);
        await persistBookingUpdate(updateBooking, bookingRecordId, {
          status: 'pending',
          paymentStatus: 'completed',
          paymentId,
          paymentOrderId: verification.data?.order_id || verification.data?.orderId || '',
          paymentMethod: verification.data?.method || 'razorpay',
          providerStatus: 'payment_verified',
          failureStage: '',
          failureReason: '',
        });
      }

      lifecycleStage = 'provider_booking';
      const data = await hotels.book({
        searchToken: selectedHotel.searchToken || searchToken,
        resultIndex: selectedHotel.resultIndex,
        hotelCode: selectedHotel.hotelCode,
        hotelName: selectedHotel.name,
        guestNationality: 'IN',
        noOfRooms: roomsCount,
        hotelRoomDetails: selectedRoom.hotelRoomDetails || [selectedRoom.raw],
        guests: [{
          title: contact.title,
          firstName: contact.firstName,
          lastName: contact.lastName,
          phone: contact.phone,
          email: contact.email,
          paxType: 1,
          leadPassenger: true,
          age: 30,
        }],
        contactDetails: contact,
        paymentId,
      });

      const bookingData = {
        ...data,
        hotel: selectedHotel,
        room: selectedRoom,
        checkIn,
        checkOut,
        guests: adults + children,
        rooms: roomsCount,
      };
      setBooking(bookingData);
      setNotice('Hotel booking confirmed.');

      const providerBookingId = data.bookingId || data.BookingId || data.bookingRefNo || data.BookingRefNo || '';
      await persistBookingUpdate(updateBooking, bookingRecordId, {
        status: 'confirmed',
        paymentStatus: skipPayment ? 'pending' : 'completed',
        paymentId,
        externalBookingId: String(providerBookingId),
        ticketNo: String(data.bookingRefNo || data.BookingRefNo || providerBookingId),
        pnr: String(data.confirmationNo || data.ConfirmationNo || ''),
        providerStatus: String(data.HotelBookingStatus || 'confirmed').toLowerCase(),
        failureStage: '',
        failureReason: '',
      });
    } catch (err) {
      if (bookingRecordId) {
        await persistBookingUpdate(updateBooking, bookingRecordId, {
          status: 'failed',
          paymentStatus: paymentVerified ? 'completed' : 'failed',
          providerStatus: paymentVerified ? 'booking_failed' : 'payment_failed',
          failureStage: lifecycleStage,
          failureReason: err.message || 'Hotel booking failed',
        });
      }
      setError(err.message || 'Hotel booking failed.');
    } finally {
      setLoading('');
    }
  };

  return (
    <div className="hotel-home">
      <section className="hh-hero">
        <div className="hh-hero-copy">
          <span className="hh-kicker"><Sparkles size={14} /> Hotels</span>
          <h1>Stay planning with verified rooms and clear policies</h1>
          <p>Search provider-backed hotels, compare rooms, verify the latest price, and complete the booking in one flow.</p>
        </div>

        <div className="hh-search-shell">
          <div className="hh-search-card">
            <label className="hh-field hh-city-field">
              <span><MapPin size={15} /> Destination</span>
              <input
                value={cityQuery}
                onChange={(event) => {
                  setCityQuery(event.target.value);
                  setSelectedCity(null);
                  setCityOpen(true);
                }}
                onFocus={() => setCityOpen(true)}
                onBlur={() => window.setTimeout(() => setCityOpen(false), 140)}
                placeholder="City or provider city ID"
              />
              {cityOpen && filteredCities.length > 0 && (
                <div className="hh-city-menu">
                  {filteredCities.map((city) => (
                    <button
                      type="button"
                      key={`${city.id}-${city.name}`}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setSelectedCity(city);
                        setCityQuery(city.name);
                        setCityOpen(false);
                      }}
                    >
                      <b>{city.name}</b>
                      <small>{city.state || city.countryName} · ID {city.id}</small>
                    </button>
                  ))}
                </div>
              )}
            </label>

            <label className="hh-field">
              <span><CalendarDays size={15} /> Check-in</span>
              <input type="date" min={addDays(0)} value={checkIn} onChange={(event) => setCheckIn(event.target.value)} />
            </label>

            <label className="hh-field">
              <span><CalendarDays size={15} /> Check-out</span>
              <input type="date" min={checkIn} value={checkOut} onChange={(event) => setCheckOut(event.target.value)} />
            </label>

            <div className="hh-guest-wrap">
              <button type="button" className="hh-guest-btn" onClick={() => setGuestOpen((open) => !open)}>
                <Users size={17} />
                <span><small>Guests</small><b>{guestSummary}</b></span>
                <ChevronDown size={16} />
              </button>
              {guestOpen && (
                <div className="hh-guest-popover">
                  <Counter label="Rooms" hint={`${nights} night${nights > 1 ? 's' : ''}`} value={roomsCount} min={1} max={4} onChange={setRoomsCount} />
                  <Counter label="Adults" hint="18+ years" value={adults} min={1} max={8} onChange={setAdults} />
                  <Counter label="Children" hint="Age details sent to provider" value={children} min={0} max={4} onChange={setChildren} />
                  <label className="hh-rating-select">Minimum rating
                    <select value={minRating} onChange={(event) => setMinRating(Number(event.target.value))}>
                      <option value={0}>Any rating</option>
                      <option value={3}>3 star and above</option>
                      <option value={4}>4 star and above</option>
                      <option value={5}>5 star only</option>
                    </select>
                  </label>
                  <button type="button" className="hh-popover-done" onClick={() => setGuestOpen(false)}>Done</button>
                </div>
              )}
            </div>

            <button type="button" className="hh-search-btn" onClick={handleSearch} disabled={loading === 'search'}>
              {loading === 'search' ? <Loader2 className="hh-spin" size={18} /> : <Search size={18} />}
              Search hotels
            </button>
          </div>
        </div>
      </section>

      <main className="hh-workspace">
        {(error || notice) && (
          <div className={`hh-alert ${error ? 'error' : ''}`}>
            {error || notice}
          </div>
        )}

        <section className="hh-results-grid">
          <div className="hh-results-panel">
            <div className="hh-panel-title">
              <span><Hotel size={17} /> Available hotels</span>
              <small>{results.length ? `${results.length} options` : 'Start a search'}</small>
            </div>

            {results.length === 0 ? (
              <div className="hh-empty-state">
                <BedDouble size={42} />
                <p>Search by destination and dates to see hotel availability.</p>
              </div>
            ) : results.map((hotel) => (
              <article className={`hh-hotel-card ${selectedHotel?.id === hotel.id ? 'active' : ''}`} key={hotel.id}>
                <div className="hh-hotel-image">
                  {hotel.picture ? <img src={hotel.picture} alt="" /> : <Hotel size={34} />}
                </div>
                <div className="hh-hotel-main">
                  <div className="hh-hotel-head">
                    <div>
                      <h3>{hotel.name}</h3>
                      <span><MapPin size={13} /> {hotel.location || hotel.address || 'Hotel location'}</span>
                    </div>
                    <div className="hh-rating">{Array.from({ length: Math.max(1, Math.round(hotel.rating || 0)) }).slice(0, 5).map((_, index) => <Star key={index} size={13} fill="currentColor" />)}</div>
                  </div>
                  <p>{hotel.description}</p>
                  <div className="hh-hotel-footer">
                    <strong>{formatMoney(hotel.price, hotel.currency)} <small>/ night</small></strong>
                    <button type="button" onClick={() => selectHotel(hotel)} disabled={loading === `hotel-${hotel.id}`}>
                      {loading === `hotel-${hotel.id}` ? <Loader2 className="hh-spin" size={16} /> : <BadgeCheck size={16} />}
                      View rooms
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <aside className="hh-detail-panel">
            {!selectedHotel ? (
              <div className="hh-empty-state tall">
                <ShieldCheck size={44} />
                <p>Select a hotel to review rooms, cancellation policy, and final booking details.</p>
              </div>
            ) : (
              <>
                <div className="hh-selected-head">
                  <span>Selected hotel</span>
                  <h2>{selectedHotel.name}</h2>
                  <p>{hotelInfo?.address || selectedHotel.address}</p>
                </div>

                <div className="hh-info-strip">
                  <span><CalendarDays size={15} /> {nights} night{nights > 1 ? 's' : ''}</span>
                  <span><Users size={15} /> {guestSummary}</span>
                  <span><ShieldCheck size={15} /> Verified rooms</span>
                </div>

                {hotelInfo?.facilities?.length > 0 && (
                  <div className="hh-facilities">
                    {hotelInfo.facilities.slice(0, 5).map((facility) => <span key={facility}>{facility}</span>)}
                  </div>
                )}

                <div className="hh-room-list">
                  <h3>Room options</h3>
                  {rooms.map((room) => (
                    <button
                      type="button"
                      key={room.id}
                      className={`hh-room-option ${selectedRoom?.id === room.id ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedRoom(room);
                        setBlockData(null);
                      }}
                    >
                      <span>
                        <b>{room.roomTypeName}</b>
                        <small>{room.ratePlan || room.bedType || 'Provider room rate'}</small>
                      </span>
                      <strong>{formatMoney(room.price, room.currency)}</strong>
                    </button>
                  ))}
                </div>

                {selectedRoom && (
                  <div className="hh-checkout-box">
                    <div className="hh-price-row">
                      <span>{selectedRoom.roomTypeName}</span>
                      <strong>{formatMoney(totalAmount, selectedRoom.currency)}</strong>
                    </div>
                    {selectedRoom.cancellationPolicy && <p>{selectedRoom.cancellationPolicy}</p>}

                    <div className="hh-guest-form">
                      <label>Title
                        <select value={contact.title} onChange={(event) => setContact((current) => ({ ...current, title: event.target.value }))}>
                          <option>Mr</option>
                          <option>Mrs</option>
                          <option>Miss</option>
                          <option>Ms</option>
                        </select>
                      </label>
                      <label>First name
                        <input value={contact.firstName} onChange={(event) => setContact((current) => ({ ...current, firstName: event.target.value }))} />
                      </label>
                      <label>Last name
                        <input value={contact.lastName} onChange={(event) => setContact((current) => ({ ...current, lastName: event.target.value }))} />
                      </label>
                      <label>Mobile
                        <input value={contact.phone} onChange={(event) => setContact((current) => ({ ...current, phone: event.target.value.replace(/\D/g, '').slice(0, 10) }))} />
                      </label>
                      <label>Email
                        <input value={contact.email} onChange={(event) => setContact((current) => ({ ...current, email: event.target.value }))} />
                      </label>
                    </div>

                    <div className="hh-actions">
                      <button type="button" className="hh-secondary-btn" onClick={blockSelectedRoom} disabled={loading === 'block'}>
                        {loading === 'block' ? <Loader2 className="hh-spin" size={16} /> : <CheckCircle2 size={16} />}
                        Verify room
                      </button>
                      <button type="button" className="hh-primary-btn" onClick={() => completeBooking()} disabled={loading === 'payment'}>
                        {loading === 'payment' ? <Loader2 className="hh-spin" size={17} /> : <CreditCard size={17} />}
                        Pay & book
                      </button>
                      {source === 'mock' && (
                        <button type="button" className="hh-text-btn" onClick={() => completeBooking({ skipPayment: true })} disabled={loading === 'book-test'}>
                          {loading === 'book-test' ? 'Confirming...' : 'Confirm test booking'}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {booking && (
                  <div className="hh-confirmation">
                    <CheckCircle2 size={28} />
                    <div>
                      <span>Booking confirmed</span>
                      <b>{booking.BookingRefNo || booking.bookingRefNo || booking.ConfirmationNo || booking.bookingId}</b>
                    </div>
                  </div>
                )}
              </>
            )}
          </aside>
        </section>

        <section className="hh-trust-row">
          <div><ShieldCheck size={20} /><span><b>Provider price check</b><small>Block-room verification before booking</small></span></div>
          <div><UserRound size={20} /><span><b>Guest-ready data</b><small>Lead guest details sent in provider format</small></span></div>
          <div><BadgeCheck size={20} /><span><b>Booking reference</b><small>Confirmation details returned after book</small></span></div>
        </section>
      </main>
    </div>
  );
}
