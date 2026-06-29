import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BadgePercent,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Luggage,
  MapPin,
  Minus,
  Plane,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Tag,
  Users,
} from 'lucide-react';
import airports from '../data/airports';
import './FlightHome.css';

const cabinOptions = [
  { value: 1, label: 'Economy' },
  { value: 2, label: 'Premium Economy' },
  { value: 3, label: 'Business' },
  { value: 4, label: 'First Class' },
];

const specialFares = ['Regular', 'Student', 'Senior Citizen', 'Armed Forces'];

const getInitialDate = (offset = 7) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().split('T')[0];
};

const emptySegment = (date = '') => ({
  from: '',
  to: '',
  fromId: '',
  toId: '',
  date,
});

const extractIataCode = (value) => {
  const text = String(value || '').trim().toUpperCase();
  return text.match(/\(([A-Z]{3})\)$/)?.[1] || text.match(/^[A-Z]{3}$/)?.[0] || '';
};

function AirportField({ label, value, code, onChange, placeholder }) {
  const [open, setOpen] = useState(false);
  const filteredAirports = useMemo(() => {
    const query = String(value || '').trim().toLowerCase();
    if (!query) return airports.slice(0, 8);
    return airports.filter((airport) =>
      `${airport.code} ${airport.city} ${airport.name} ${airport.country}`.toLowerCase().includes(query)
    ).slice(0, 8);
  }, [value]);

  return (
    <label className="fh-field fh-airport-field">
      <span className="fh-field-label"><MapPin size={14} /> {label}</span>
      <div className="fh-airport-input-row">
        <input
          value={value}
          onChange={(event) => {
            onChange({ display: event.target.value, code: '' });
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          placeholder={placeholder}
          autoComplete="off"
        />
        {code && <strong>{code}</strong>}
      </div>
      {open && filteredAirports.length > 0 && (
        <div className="fh-airport-dropdown">
          {filteredAirports.map((airport) => (
            <button
              type="button"
              key={airport.code}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange({ display: airport.display, code: airport.code });
                setOpen(false);
              }}
            >
              <span className="fh-airport-code">{airport.code}</span>
              <span><b>{airport.city}</b><small>{airport.name}</small></span>
            </button>
          ))}
        </div>
      )}
    </label>
  );
}

function PassengerCounter({ label, hint, value, minimum, maximum, onChange }) {
  return (
    <div className="fh-passenger-counter">
      <span><b>{label}</b><small>{hint}</small></span>
      <div>
        <button type="button" onClick={() => onChange(Math.max(minimum, value - 1))} disabled={value <= minimum}><Minus size={14} /></button>
        <strong>{value}</strong>
        <button type="button" onClick={() => onChange(Math.min(maximum, value + 1))} disabled={value >= maximum}><Plus size={14} /></button>
      </div>
    </div>
  );
}

export default function FlightHome({ onSearch }) {
  const navigate = useNavigate();
  const [tripType, setTripType] = useState('oneWay');
  const [segments, setSegments] = useState(() => [emptySegment(getInitialDate())]);
  const [returnDate, setReturnDate] = useState(() => getInitialDate(14));
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [infants, setInfants] = useState(0);
  const [cabinClass, setCabinClass] = useState(1);
  const [specialFare, setSpecialFare] = useState('Regular');
  const [passengerOpen, setPassengerOpen] = useState(false);
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [error, setError] = useState('');
  const [utilityNotice, setUtilityNotice] = useState('');
  const today = useMemo(() => new Date().toISOString().split('T')[0], []);

  const updateSegment = (index, updates) => {
    setSegments((current) => current.map((segment, segmentIndex) =>
      segmentIndex === index ? { ...segment, ...updates } : segment
    ));
  };

  const changeTripType = (nextType) => {
    setTripType(nextType);
    setError('');
    setSegments((current) => {
      if (nextType === 'multiCity' && current.length < 2) {
        return [current[0], emptySegment(current[0].date)];
      }
      return nextType === 'multiCity' ? current : [current[0]];
    });
  };

  const swapSegment = (index) => {
    setSegments((current) => current.map((segment, segmentIndex) => segmentIndex === index ? {
      ...segment,
      from: segment.to,
      to: segment.from,
      fromId: segment.toId,
      toId: segment.fromId,
    } : segment));
  };

  const handleSearch = () => {
    setError('');
    const normalizedSegments = segments.map((segment) => ({
      ...segment,
      fromId: segment.fromId || extractIataCode(segment.from),
      toId: segment.toId || extractIataCode(segment.to),
    }));

    if (normalizedSegments.some((segment) => !segment.fromId || !segment.toId || !segment.date)) {
      setError('Choose valid origin, destination, and travel date for every flight.');
      return;
    }
    if (normalizedSegments.some((segment) => segment.fromId === segment.toId)) {
      setError('Origin and destination airports must be different.');
      return;
    }
    if (tripType === 'roundTrip' && !returnDate) {
      setError('Choose a return date for your round trip.');
      return;
    }
    if (tripType === 'roundTrip' && returnDate < normalizedSegments[0].date) {
      setError('Return date must be after the departure date.');
      return;
    }
    if (infants > adults) {
      setError('Each infant must travel with an adult.');
      return;
    }

    const airSegments = normalizedSegments.map((segment) => ({
      Origin: segment.fromId,
      Destination: segment.toId,
      PreferredTime: segment.date,
    }));

    if (tripType === 'roundTrip') {
      airSegments.push({
        Origin: normalizedSegments[0].toId,
        Destination: normalizedSegments[0].fromId,
        PreferredTime: returnDate,
      });
    }

    const firstSegment = normalizedSegments[0];
    onSearch({
      from: firstSegment.from,
      to: firstSegment.to,
      fromId: firstSegment.fromId,
      toId: firstSegment.toId,
      date: firstSegment.date,
      returnDate: tripType === 'roundTrip' ? returnDate : '',
      adult: adults,
      child: children,
      infant: infants,
      cabinClass,
      journeyType: tripType === 'oneWay' ? 1 : tripType === 'roundTrip' ? 2 : 3,
      airSegments,
      specialFare,
      promoCode,
    });
  };

  const showUtilityNotice = (message) => {
    setUtilityNotice(message);
    window.setTimeout(() => setUtilityNotice(''), 3200);
  };

  return (
    <div className="flight-home">
      <section className="fh-hero">
        <div className="fh-hero-orbit orbit-one" />
        <div className="fh-hero-orbit orbit-two" />
        <div className="fh-hero-plane"><Plane size={180} strokeWidth={0.7} /></div>

        <div className="fh-hero-copy">
          <span className="fh-kicker"><Sparkles size={14} /> Flights, made effortless</span>
          <h1>Where will your next<br /><em>story take you?</em></h1>
          <p>Compare trusted airlines, transparent fares, and flexible options in one calm booking experience.</p>
        </div>

        <div className="fh-booking-shell">
          <nav className="fh-service-tabs" aria-label="Flight services">
            <button type="button" className="active"><Plane size={17} /> Book a flight</button>
            <button type="button" onClick={() => showUtilityNotice('Web check-in will be available shortly.')}><CheckCircle2 size={17} /> Check-in</button>
            <button type="button" onClick={() => showUtilityNotice('Live flight status is coming soon.')}><Clock3 size={17} /> Flight status</button>
            <button type="button" onClick={() => navigate('/my-bookings')}><Luggage size={17} /> Manage booking</button>
          </nav>

          <div className="fh-search-card">
            <div className="fh-search-topline">
              <div className="fh-trip-types" role="group" aria-label="Trip type">
                {[
                  ['oneWay', 'One way'],
                  ['roundTrip', 'Round trip'],
                  ['multiCity', 'Multi-city'],
                ].map(([value, label]) => (
                  <button type="button" key={value} className={tripType === value ? 'active' : ''} onClick={() => changeTripType(value)}>
                    <span /> {label}
                  </button>
                ))}
              </div>
              <span className="fh-best-fare"><ShieldCheck size={15} /> Live provider fares</span>
            </div>

            <div className={`fh-segments ${tripType === 'multiCity' ? 'multi' : ''}`}>
              {segments.map((segment, index) => (
                <div className="fh-segment-row" key={`segment-${index}`}>
                  {tripType === 'multiCity' && <span className="fh-flight-number">Flight {index + 1}</span>}
                  <div className="fh-route-fields">
                    <AirportField
                      label="From"
                      value={segment.from}
                      code={segment.fromId}
                      placeholder="City or airport"
                      onChange={(airport) => updateSegment(index, { from: airport.display, fromId: airport.code })}
                    />
                    <button className="fh-swap" type="button" onClick={() => swapSegment(index)} aria-label="Swap airports"><ArrowRight size={18} /></button>
                    <AirportField
                      label="To"
                      value={segment.to}
                      code={segment.toId}
                      placeholder="Where to?"
                      onChange={(airport) => updateSegment(index, { to: airport.display, toId: airport.code })}
                    />
                  </div>

                  <label className="fh-field fh-date-field">
                    <span className="fh-field-label"><CalendarDays size={14} /> Depart</span>
                    <input type="date" min={today} value={segment.date} onChange={(event) => updateSegment(index, { date: event.target.value })} />
                  </label>

                  {index === 0 && tripType !== 'multiCity' && (
                    <label className={`fh-field fh-date-field ${tripType === 'oneWay' ? 'muted' : ''}`}>
                      <span className="fh-field-label"><CalendarDays size={14} /> Return</span>
                      {tripType === 'roundTrip'
                        ? <input type="date" min={segment.date || today} value={returnDate} onChange={(event) => setReturnDate(event.target.value)} />
                        : <button type="button" onClick={() => changeTripType('roundTrip')}>Add return</button>}
                    </label>
                  )}

                  {tripType === 'multiCity' && index > 1 && (
                    <button className="fh-remove-flight" type="button" onClick={() => setSegments((current) => current.filter((_, segmentIndex) => segmentIndex !== index))}>Remove</button>
                  )}
                </div>
              ))}
            </div>

            {tripType === 'multiCity' && segments.length < 4 && (
              <button className="fh-add-flight" type="button" onClick={() => setSegments((current) => [...current, emptySegment(current.at(-1)?.date || getInitialDate())])}>
                <Plus size={16} /> Add another flight
              </button>
            )}

            <div className="fh-search-options">
              <div className="fh-passenger-wrap">
                <button className="fh-option-button" type="button" onClick={() => setPassengerOpen((open) => !open)}>
                  <Users size={17} />
                  <span><small>Travellers & class</small><b>{adults + children + infants} traveller{adults + children + infants === 1 ? '' : 's'}, {cabinOptions.find((option) => option.value === cabinClass)?.label}</b></span>
                  <ChevronDown size={16} />
                </button>
                {passengerOpen && (
                  <div className="fh-passenger-popover">
                    <PassengerCounter label="Adults" hint="12+ years" value={adults} minimum={1} maximum={9} onChange={setAdults} />
                    <PassengerCounter label="Children" hint="2–11 years" value={children} minimum={0} maximum={8} onChange={setChildren} />
                    <PassengerCounter label="Infants" hint="Under 2 years" value={infants} minimum={0} maximum={adults} onChange={setInfants} />
                    <label>Cabin class
                      <select value={cabinClass} onChange={(event) => setCabinClass(Number(event.target.value))}>
                        {cabinOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
                      </select>
                    </label>
                    <button type="button" className="fh-popover-done" onClick={() => setPassengerOpen(false)}>Done</button>
                  </div>
                )}
              </div>

              <button className="fh-option-button" type="button" onClick={() => setPromoOpen((open) => !open)}>
                <Tag size={17} />
                <span><small>Promo code</small><b>{promoCode || 'Add code'}</b></span>
                <ChevronDown size={16} />
              </button>

              <button className="fh-search-button" type="button" onClick={handleSearch}>
                <Search size={19} /> Search flights
              </button>
            </div>

            {promoOpen && (
              <div className="fh-promo-row">
                <Tag size={16} />
                <input value={promoCode} onChange={(event) => setPromoCode(event.target.value.toUpperCase())} placeholder="Enter promo code" />
                <button type="button" onClick={() => setPromoOpen(false)}>Apply</button>
              </div>
            )}

            <div className="fh-special-fares">
              <span>Special fares</span>
              {specialFares.map((fare) => (
                <button type="button" key={fare} className={specialFare === fare ? 'active' : ''} onClick={() => setSpecialFare(fare)}>{fare}</button>
              ))}
            </div>

            {error && <div className="fh-search-error" role="alert">{error}</div>}
          </div>
        </div>

        {utilityNotice && <div className="fh-utility-notice">{utilityNotice}</div>}
      </section>

      <section className="fh-trust-strip">
        <div><CircleDollarSign size={20} /><span><b>Transparent prices</b><small>No surprise fees at checkout</small></span></div>
        <div><ShieldCheck size={20} /><span><b>Secure booking</b><small>Protected payments and verified fares</small></span></div>
        <div><Clock3 size={20} /><span><b>Real-time options</b><small>Fresh schedules from airline partners</small></span></div>
      </section>

      <section className="fh-offers-section">
        <div className="fh-section-heading">
          <span>Fresh ways to fly</span>
          <h2>More value in every journey</h2>
          <p>Smart tools and flexible choices inspired by how modern travellers actually plan.</p>
        </div>
        <div className="fh-offer-grid">
          <article className="calendar-offer">
            <div className="fh-offer-icon"><CalendarDays size={24} /></div>
            <span>Flexible dates</span>
            <h3>Find the better fare around your travel date</h3>
            <p>Use live calendar fares to spot lower-priced days before you commit.</p>
          </article>
          <article className="deal-offer">
            <div className="fh-offer-icon"><BadgePercent size={24} /></div>
            <span>Sancharie specials</span>
            <h3>Purpose-based fares, clearly explained</h3>
            <p>Compare student, senior, and service fares without digging through fine print.</p>
          </article>
          <article className="baggage-offer">
            <div className="fh-offer-icon"><Luggage size={24} /></div>
            <span>Travel your way</span>
            <h3>Meals, baggage, and seats in one flow</h3>
            <p>Review airline add-ons before payment and keep the full trip in one place.</p>
          </article>
        </div>
      </section>

      <section className="fh-destination-band">
        <div>
          <span className="fh-kicker dark"><Sparkles size={14} /> Explore beyond the obvious</span>
          <h2>From quick city breaks<br />to stories across borders.</h2>
          <p>Search domestic and international routes with the same simple, transparent booking flow.</p>
        </div>
        <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>Plan a journey <ArrowRight size={17} /></button>
      </section>
    </div>
  );
}
