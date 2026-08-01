import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BadgePercent,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
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
  X,
} from 'lucide-react';
import { flights as flightApi } from '../services';
import { filterAllowedFlightAirports } from '../data/flightRestrictions';
import './FlightHome.css';

const cabinOptions = [
  { value: 1, label: 'Economy' },
  { value: 2, label: 'Premium Economy' },
  { value: 3, label: 'Business' },
  { value: 4, label: 'First Class' },
];

const specialFares = ['Regular', 'Student', 'Senior Citizen', 'Armed Forces'];

const toIsoDateString = (year, monthIndex, day) => (
  `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
);

const getInitialDate = (offset = 7) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return toIsoDateString(date.getFullYear(), date.getMonth(), date.getDate());
};

const addDaysToIsoDate = (isoDate, offset) => {
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return getInitialDate(offset);
  date.setDate(date.getDate() + offset);
  return toIsoDateString(date.getFullYear(), date.getMonth(), date.getDate());
};

const formatFareAmount = (value) => new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 0,
}).format(Number(value || 0));

const getMonthStart = (isoDate) => {
  const match = String(isoDate || '').match(/^(\d{4})-(\d{2})-\d{2}$/);
  if (match) return `${match[1]}-${match[2]}-01`;

  const fallback = new Date();
  return toIsoDateString(fallback.getFullYear(), fallback.getMonth(), 1);
};

const shiftMonth = (isoMonth, offset) => {
  const match = String(isoMonth || '').match(/^(\d{4})-(\d{2})-\d{2}$/);
  const date = match
    ? new Date(Number(match[1]), Number(match[2]) - 1 + offset, 1)
    : new Date();
  if (Number.isNaN(date.getTime())) return getMonthStart(getInitialDate());
  return toIsoDateString(date.getFullYear(), date.getMonth(), 1);
};

const formatDisplayDate = (value) => {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value || '');
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatMonthTitle = (value) => {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};

const getMonthCells = (monthIso) => {
  const start = new Date(`${monthIso}T00:00:00`);
  if (Number.isNaN(start.getTime())) return [];
  const year = start.getFullYear();
  const month = start.getMonth();
  const firstDay = new Date(year, month, 1);
  const totalDays = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: firstDay.getDay() }, (_, index) => ({
    key: `blank-${index}`,
    blank: true,
  }));

  for (let day = 1; day <= totalDays; day += 1) {
    const date = toIsoDateString(year, month, day);
    cells.push({
      key: date,
      date,
      day,
    });
  }

  return cells;
};

const isBeforeIsoDate = (date, minDate) => Boolean(date && minDate && date < minDate);

const getFareMap = (fares) => fares.reduce((map, fare) => {
  if (fare.date && Number(fare.price) > 0) map.set(fare.date, fare);
  return map;
}, new Map());

const getSelectionKey = (selection) => selection ? `${selection.kind}-${selection.index}` : '';

const useFloatingRect = (open, { offset = 8, preferredWidth = 360, minWidth = 280 } = {}) => {
  const anchorRef = useRef(null);
  const [rect, setRect] = useState(null);

  const updateRect = useCallback(() => {
    if (!anchorRef.current || typeof window === 'undefined') return;
    const bounds = anchorRef.current.getBoundingClientRect();
    const width = Math.min(
      Math.max(bounds.width, minWidth),
      preferredWidth,
      window.innerWidth - 32
    );
    const left = Math.min(Math.max(bounds.left, 16), window.innerWidth - width - 16);

    setRect({
      top: Math.round(bounds.bottom + offset),
      left: Math.round(left),
      width: Math.round(width),
    });
  }, [offset, preferredWidth, minWidth]);

  useLayoutEffect(() => {
    if (!open) return undefined;

    updateRect();
    const handleUpdate = () => updateRect();
    window.addEventListener('resize', handleUpdate);
    window.addEventListener('scroll', handleUpdate, true);

    return () => {
      window.removeEventListener('resize', handleUpdate);
      window.removeEventListener('scroll', handleUpdate, true);
    };
  }, [open, updateRect]);

  return { anchorRef, rect, updateRect };
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

function AirportField({ label, value, code, airports, onChange, placeholder }) {
  const [open, setOpen] = useState(false);
  const { anchorRef, rect, updateRect } = useFloatingRect(open, {
    offset: 8,
    preferredWidth: 380,
    minWidth: 320,
  });
  const filteredAirports = useMemo(() => {
    const query = String(value || '').trim().toLowerCase();
    if (!query) return airports.slice(0, 8);
    return airports.filter((airport) =>
      `${airport.code} ${airport.city} ${airport.name} ${airport.country}`.toLowerCase().includes(query)
    ).slice(0, 8);
  }, [airports, value]);

  return (
    <label className="fh-field fh-airport-field" ref={anchorRef}>
      <span className="fh-field-label"><MapPin size={14} /> {label}</span>
      <div className="fh-airport-input-row">
        <input
          value={value}
          onChange={(event) => {
            onChange({ display: event.target.value, code: '' });
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            requestAnimationFrame(updateRect);
          }}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          placeholder={placeholder}
          autoComplete="off"
        />
        {code && <strong>{code}</strong>}
      </div>
      {open && filteredAirports.length > 0 && rect && createPortal((
        <div className="fh-airport-dropdown fh-floating-popover" style={rect}>
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
      ), document.body)}
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

function DateFareField({
  label,
  value,
  min,
  open,
  month,
  fares,
  loading,
  error,
  onOpen,
  onClose,
  onMonthChange,
  onSelect,
}) {
  const { anchorRef, rect, updateRect } = useFloatingRect(open, {
    offset: 10,
    preferredWidth: 360,
    minWidth: 320,
  });
  const fareMap = useMemo(() => getFareMap(fares), [fares]);
  const cells = useMemo(() => getMonthCells(month), [month]);
  const selectedLabel = formatDisplayDate(value);

  return (
    <div className={`fh-field fh-date-field fh-fare-date-field ${open ? 'active' : ''}`} ref={anchorRef}>
      <span className="fh-field-label"><CalendarDays size={14} /> {label}</span>
      <button
        className="fh-date-trigger"
        type="button"
        onClick={() => {
          onOpen();
          requestAnimationFrame(updateRect);
        }}
      >
        <b>{selectedLabel}</b>
        <ChevronDown size={15} />
      </button>

      {open && rect && createPortal((
        <div className="fh-date-popover fh-floating-popover" style={rect}>
          <div className="fh-date-popover-head">
            <button type="button" className="fh-date-nav" onClick={() => onMonthChange(-1)} aria-label="Previous month">
              <ChevronLeft size={17} />
            </button>
            <strong>{formatMonthTitle(month)}</strong>
            <div className="fh-date-head-actions">
              <button type="button" className="fh-date-nav" onClick={() => onMonthChange(1)} aria-label="Next month">
                <ChevronRight size={17} />
              </button>
              <button type="button" className="fh-date-close" onClick={onClose} aria-label="Close calendar">
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="fh-date-weekdays" aria-hidden="true">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => <span key={day}>{day}</span>)}
          </div>

          <div className="fh-date-grid">
            {cells.map((cell) => {
              if (cell.blank) return <span className="fh-date-cell blank" key={cell.key} />;
              const fare = fareMap.get(cell.date);
              const disabled = isBeforeIsoDate(cell.date, min);
              return (
                <button
                  type="button"
                  key={cell.key}
                  className={`fh-date-cell ${cell.date === value ? 'selected' : ''} ${fare ? 'has-fare' : ''}`}
                  onClick={() => {
                    if (!disabled) {
                      onSelect(cell.date);
                      onClose();
                    }
                  }}
                  disabled={disabled}
                >
                  <span>{cell.day}</span>
                  {fare && <small>{formatFareAmount(fare.price)}</small>}
                </button>
              );
            })}
          </div>

          {(loading || error) && (
            <div className={`fh-date-popover-note ${error ? 'error' : ''}`}>
              {loading ? 'Loading fares...' : error}
            </div>
          )}
        </div>
      ), document.body)}
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
  const [calendarFares, setCalendarFares] = useState([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState('');
  const [calendarMonth, setCalendarMonth] = useState(() => getMonthStart(getInitialDate()));
  const [activeDatePicker, setActiveDatePicker] = useState(null);
  const [airportOptions, setAirportOptions] = useState([]);
  const today = useMemo(() => new Date().toISOString().split('T')[0], []);
  const activeDatePickerKey = getSelectionKey(activeDatePicker);

  const updateSegment = (index, updates) => {
    setSegments((current) => current.map((segment, segmentIndex) =>
      segmentIndex === index ? { ...segment, ...updates } : segment
    ));
  };

  useEffect(() => {
    let mounted = true;
    import('../data/airports')
      .then((module) => {
        if (mounted) setAirportOptions(filterAllowedFlightAirports(module.default || []));
      })
      .catch(() => {
        if (mounted) setAirportOptions([]);
      });
    return () => {
      mounted = false;
    };
  }, []);

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
    const allowedAirportCodes = new Set(airportOptions.map((airport) => airport.code));
    const normalizedSegments = segments.map((segment) => ({
      ...segment,
      fromId: segment.fromId || extractIataCode(segment.from),
      toId: segment.toId || extractIataCode(segment.to),
    }));

    if (normalizedSegments.some((segment) => !segment.fromId || !segment.toId || !segment.date)) {
      setError('Choose valid origin, destination, and travel date for every flight.');
      return;
    }
    if (normalizedSegments.some((segment) => (
      !allowedAirportCodes.has(segment.fromId) || !allowedAirportCodes.has(segment.toId)
    ))) {
      setError('Flights to or from restricted destinations are unavailable. Choose another airport.');
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

  const getDatePickerContext = (selection, dateOverride = '') => {
    const firstSegment = segments[0] || {};
    const selectedSegment = segments[selection?.index || 0] || {};
    const isReturn = selection?.kind === 'return';
    const source = isReturn ? firstSegment : selectedSegment;
    const fromId = isReturn
      ? firstSegment.toId || extractIataCode(firstSegment.to)
      : source.fromId || extractIataCode(source.from);
    const toId = isReturn
      ? firstSegment.fromId || extractIataCode(firstSegment.from)
      : source.toId || extractIataCode(source.to);
    const date = dateOverride || (isReturn ? returnDate : source.date);

    return { fromId, toId, date };
  };

  const loadFareCalendar = async (selection = activeDatePicker, dateOverride = '') => {
    setCalendarError('');
    setError('');
    setCalendarFares([]);

    const { fromId, toId, date } = getDatePickerContext(selection, dateOverride);

    if (!fromId || !toId || !date) {
      setCalendarError('Select airports first to show live fares.');
      return;
    }
    const allowedAirportCodes = new Set(airportOptions.map((airport) => airport.code));
    if (!allowedAirportCodes.has(fromId) || !allowedAirportCodes.has(toId)) {
      setCalendarError('Flights to or from restricted destinations are unavailable.');
      return;
    }
    if (fromId === toId) {
      setCalendarError('Origin and destination airports must be different.');
      return;
    }

    setCalendarLoading(true);
    try {
      const data = await flightApi.getCalendarFares({
        origin: fromId,
        destination: toId,
        date,
        adult: adults,
        child: children,
        infant: infants,
        cabinClass,
        journeyType: 1,
      });
      const fares = (data.calendarFares || [])
        .filter((fare) => fare.date && Number(fare.price) > 0)
        .slice(0, 45);

      setCalendarFares(fares);
      if (!fares.length) {
        setCalendarError('No calendar fares returned for this route.');
      }
    } catch (err) {
      setCalendarError(err.message || 'Fares could not be loaded.');
    } finally {
      setCalendarLoading(false);
    }
  };

  const openDatePicker = (selection) => {
    const { date } = getDatePickerContext(selection);
    const month = getMonthStart(date || getInitialDate());
    setActiveDatePicker(selection);
    setCalendarMonth(month);
    loadFareCalendar(selection, month);
  };

  const changeCalendarMonth = (offset) => {
    const month = shiftMonth(calendarMonth, offset);
    setCalendarMonth(month);
    loadFareCalendar(activeDatePicker, month);
  };

  const selectCalendarDate = (date) => {
    if (!activeDatePicker) return;
    if (activeDatePicker.kind === 'return') {
      setReturnDate(date);
      return;
    }

    updateSegment(activeDatePicker.index, { date });
    if (activeDatePicker.index === 0 && tripType === 'roundTrip' && returnDate <= date) {
      setReturnDate(addDaysToIsoDate(date, 1));
    }
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
                      airports={airportOptions}
                      placeholder="City or airport"
                      onChange={(airport) => updateSegment(index, { from: airport.display, fromId: airport.code })}
                    />
                    <button className="fh-swap" type="button" onClick={() => swapSegment(index)} aria-label="Swap airports"><ArrowRight size={18} /></button>
                    <AirportField
                      label="To"
                      value={segment.to}
                      code={segment.toId}
                      airports={airportOptions}
                      placeholder="Where to?"
                      onChange={(airport) => updateSegment(index, { to: airport.display, toId: airport.code })}
                    />
                  </div>

                  <DateFareField
                    label="Depart"
                    value={segment.date}
                    min={today}
                    open={activeDatePickerKey === `depart-${index}`}
                    month={calendarMonth}
                    fares={calendarFares}
                    loading={calendarLoading}
                    error={calendarError}
                    onOpen={() => openDatePicker({ kind: 'depart', index })}
                    onClose={() => setActiveDatePicker(null)}
                    onMonthChange={changeCalendarMonth}
                    onSelect={selectCalendarDate}
                  />

                  {index === 0 && tripType !== 'multiCity' && (
                    tripType === 'roundTrip' ? (
                      <DateFareField
                        label="Return"
                        value={returnDate}
                        min={segment.date || today}
                        open={activeDatePickerKey === 'return-0'}
                        month={calendarMonth}
                        fares={calendarFares}
                        loading={calendarLoading}
                        error={calendarError}
                        onOpen={() => openDatePicker({ kind: 'return', index: 0 })}
                        onClose={() => setActiveDatePicker(null)}
                        onMonthChange={changeCalendarMonth}
                        onSelect={selectCalendarDate}
                      />
                    ) : (
                      <label className="fh-field fh-date-field muted">
                        <span className="fh-field-label"><CalendarDays size={14} /> Return</span>
                        <button type="button" onClick={() => changeTripType('roundTrip')}>Add return</button>
                      </label>
                    )
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
