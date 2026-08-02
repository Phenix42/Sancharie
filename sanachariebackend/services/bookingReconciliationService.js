const axios = require('axios');
const Booking = require('../models/Booking');
const paymentService = require('./paymentService');

const DEFAULT_LOOKBACK_DAYS = 365;
const REPORT_WINDOW_DAYS = 30;
const PAYMENT_MATCH_WINDOW_MS = 2 * 60 * 60 * 1000;
const UNMATCHED_PAYMENT_GRACE_MS = 15 * 60 * 1000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const syncCache = new Map();
let sourceCache = null;

const normalizePhone = (value) => String(value || '').replace(/\D/g, '').slice(-10);
const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const normalizeText = (value) => String(value || '').trim().toLowerCase();
const cleanText = (value, maxLength = 500) => String(value || '').trim().slice(0, maxLength);

const toDate = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const parseProviderJourneyDate = (value) => {
  const text = cleanText(value, 100);
  const match = text.match(/(?:\w{3},)?(\d{1,2})-([A-Za-z]{3})-(\d{4})/);
  if (!match) return toDate(text);

  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const month = months.indexOf(match[2].toLowerCase());
  if (month < 0) return null;
  return new Date(Date.UTC(Number(match[3]), month, Number(match[1])));
};

const formatReportDate = (date) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const flatten = (value) => {
  if (!Array.isArray(value)) return value && typeof value === 'object' ? [value] : [];
  return value.flatMap(flatten);
};

const mapProviderStatus = (value) => {
  const status = String(value || '').trim().toUpperCase();
  if (['TRAVELLED', 'COMPLETED'].includes(status)) return 'completed';
  if (['CONFIRMED', 'BOOKED', 'SUCCESS'].includes(status)) return 'confirmed';
  if (['CANCELLED', 'CANCELED', 'SERVICE_CANCELLED'].includes(status)) return 'cancelled';
  if (['FAILED', 'FAILURE'].includes(status)) return 'failed';
  return 'pending';
};

// Extract only customer-facing ticket data. The report response also contains
// partner account credentials and must never be logged, returned, or saved.
const sanitizeProviderTicket = (ticket) => {
  if (!ticket?.tripRefNumber || !ticket?.itineraryInfo) return null;
  const itinerary = ticket.itineraryInfo;
  const travelers = Array.isArray(itinerary.travelerDetails) ? itinerary.travelerDetails : [];

  return {
    ticketNo: cleanText(ticket.tripRefNumber, 200),
    pnr: cleanText(ticket.pnr || itinerary.pnr, 200),
    blockKey: cleanText(ticket.blockKey, 500),
    email: normalizeEmail(ticket.primaryEmail),
    phone: normalizePhone(ticket.primaryPhoneNumber),
    providerStatus: cleanText(ticket.status, 100).toUpperCase(),
    bookingDate: toDate(ticket.bookingDate),
    cancelDate: toDate(ticket.cancelDate),
    source: cleanText(itinerary.sourceCity, 250),
    destination: cleanText(itinerary.destinationCity, 250),
    journeyDate: parseProviderJourneyDate(itinerary.journeyDate),
    departureTime: cleanText(itinerary.departureTime || itinerary.startTime, 100),
    arrivalTime: cleanText(itinerary.arrivalTime, 100),
    busName: cleanText(itinerary.serviceProvider, 250),
    busType: cleanText(itinerary.service_type, 100),
    busNumber: cleanText(itinerary.serviceId, 100),
    boardingPoint: cleanText(itinerary.boardingPoint, 500),
    droppingPoint: cleanText(itinerary.droppingPoint, 500),
    seats: travelers.map((traveler) => cleanText(traveler.seatNo, 50)).filter(Boolean),
    passengers: travelers.map((traveler) => ({
      name: cleanText(traveler.name, 150) || 'Passenger',
      age: Number(traveler.age) || 25,
      gender: String(traveler.gender || '').toUpperCase() === 'F' ? 'female' : 'male',
      seatNumber: cleanText(traveler.seatNo, 50),
    })),
    totalFare: Number(itinerary.totalFareWithTaxes ?? itinerary.totalActualAPIFare) ||
      travelers.reduce((sum, traveler) => sum + (Number(traveler.fare) || 0), 0),
    serviceTax: Number(itinerary.serviceTaxAmount) || 0,
    refundAmount: Number(itinerary.refundAmount) || 0,
  };
};

const fetchProviderTickets = async (from, to) => {
  const username = process.env.ETS_API_USERNAME;
  const password = process.env.ETS_API_PASSWORD;
  if (!username || !password) throw new Error('ETS provider credentials are not configured');

  const baseUrl = String(process.env.ETS_PARTNER_URL || 'https://partners.etravelsmart.com/bus')
    .replace(/\/$/, '');
  const timeout = Number(process.env.ETS_API_TIMEOUT) || 30000;
  const loginBody = new URLSearchParams({ email: username, password, etsUserType: 'PARTNER' });
  const login = await axios.post(`${baseUrl}/restful/login`, loginBody.toString(), {
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    timeout,
  });
  const cookie = (login.headers['set-cookie'] || []).map((value) => value.split(';')[0]).join('; ');
  if (!cookie) throw new Error('ETS provider login did not return a session');

  const reports = [];
  let cursor = new Date(from);
  const lastDate = new Date(to);

  while (cursor <= lastDate) {
    const windowEnd = new Date(Math.min(
      lastDate.getTime(),
      cursor.getTime() + (REPORT_WINDOW_DAYS - 1) * 24 * 60 * 60 * 1000
    ));
    const response = await axios.get(`${baseUrl}/restful/getBookingReport`, {
      params: {
        startDate: formatReportDate(cursor),
        endDate: formatReportDate(windowEnd),
        loginID: 'SELF',
      },
      headers: { cookie },
      timeout,
    });
    reports.push(...flatten(response.data));
    cursor = new Date(windowEnd.getTime() + 24 * 60 * 60 * 1000);
  }

  const uniqueTickets = new Map();
  reports.forEach((rawTicket) => {
    const ticket = sanitizeProviderTicket(rawTicket);
    if (ticket) uniqueTickets.set(ticket.ticketNo, ticket);
  });
  return [...uniqueTickets.values()];
};

const listAllPayments = async (from, to) => {
  const payments = [];
  for (let skip = 0; skip < 5000; skip += 100) {
    const page = await paymentService.listPayments({ from, to, skip, count: 100 });
    payments.push(...page);
    if (page.length < 100) break;
  }
  return payments;
};

const paymentBelongsToUser = (payment, user) => {
  const phone = normalizePhone(user.phone);
  const email = normalizeEmail(user.email);
  return (phone && normalizePhone(payment.contact) === phone) ||
    (email && normalizeEmail(payment.email) === email);
};

const capturedPayment = (payment) => payment.captured === true || payment.status === 'captured';

const amountMatches = (ticket, payment) =>
  Math.abs(Math.round((Number(ticket.totalFare) || 0) * 100) - Number(payment.amount || 0)) <= 1;

const sameSeats = (ticket, order) => {
  const orderSeats = normalizeText(order?.notes?.seats).split(',').map((seat) => seat.trim()).filter(Boolean);
  if (!orderSeats.length || !ticket.seats.length) return false;
  return [...orderSeats].sort().join(',') === ticket.seats.map(normalizeText).sort().join(',');
};

const bookingNameMatches = (ticket, order) => {
  const orderName = normalizeText(order?.notes?.bus_name);
  const providerName = normalizeText(ticket.busName);
  return Boolean(orderName && providerName && (providerName.includes(orderName) || orderName.includes(providerName)));
};

const scorePaymentForTicket = (ticket, payment) => {
  if (!ticket.bookingDate || !amountMatches(ticket, payment)) return Number.NEGATIVE_INFINITY;
  const paymentDate = toDate(Number(payment.created_at) * 1000);
  if (!paymentDate) return Number.NEGATIVE_INFINITY;
  const distance = Math.abs(ticket.bookingDate.getTime() - paymentDate.getTime());
  if (distance > PAYMENT_MATCH_WINDOW_MS) return Number.NEGATIVE_INFINITY;

  let score = 100 - (distance / 60000);
  if (sameSeats(ticket, payment.order)) score += 100;
  if (bookingNameMatches(ticket, payment.order)) score += 50;
  if (normalizeText(payment.order?.notes?.service_type) === 'bus') score += 10;
  return score;
};

const choosePrimaryPayment = (ticket, candidates) => {
  if (!candidates.length) return null;
  const beforeTicket = candidates.filter((payment) =>
    Number(payment.created_at) * 1000 <= ticket.bookingDate.getTime() + 5000
  );
  const pool = beforeTicket.length ? beforeTicket : candidates;
  return [...pool].sort((a, b) =>
    Math.abs(ticket.bookingDate.getTime() - Number(a.created_at) * 1000) -
    Math.abs(ticket.bookingDate.getTime() - Number(b.created_at) * 1000)
  )[0];
};

const matchTicketToPayments = (ticket, payments) => {
  const ranked = payments
    .map((payment) => ({ payment, score: scorePaymentForTicket(ticket, payment) }))
    .filter(({ score }) => Number.isFinite(score))
    .sort((a, b) => b.score - a.score);
  if (!ranked.length) return null;

  const best = ranked[0].payment;
  const referenceHash = cleanText(best.order?.notes?.pricing_ref_hash, 100);
  const related = referenceHash
    ? ranked.map(({ payment }) => payment).filter((payment) =>
      cleanText(payment.order?.notes?.pricing_ref_hash, 100) === referenceHash
    )
    : [best];
  const primary = choosePrimaryPayment(ticket, related);
  return { primary, related, referenceHash };
};

const fetchOrdersForPayments = async (payments) => {
  return Promise.all(payments.map(async (payment) => {
    try {
      return {
        ...payment,
        order: payment.order_id ? await paymentService.fetchOrderDetails(payment.order_id) : null,
      };
    } catch {
      // Amount and timestamp can still provide a bounded match when an older
      // order is temporarily unavailable.
      return { ...payment, order: null };
    }
  }));
};

const getReconciliationSources = async (from, to, force) => {
  if (!force && sourceCache && sourceCache.expiresAt > Date.now() && sourceCache.from <= from) {
    return sourceCache.promise;
  }

  const promise = Promise.all([
    fetchProviderTickets(from, to),
    listAllPayments(from, to),
  ]);
  sourceCache = { from, expiresAt: Date.now() + CACHE_TTL_MS, promise };
  try {
    return await promise;
  } catch (error) {
    if (sourceCache?.promise === promise) sourceCache = null;
    throw error;
  }
};

const findExistingBooking = async (userId, ticket, match) => {
  const candidates = [
    { ticketNo: ticket.ticketNo },
    { externalBookingId: ticket.ticketNo },
    { clientReference: `ets-${ticket.ticketNo}` },
  ];
  if (match?.primary?.id) candidates.push({ paymentId: match.primary.id });
  if (match?.referenceHash) candidates.push({ providerReferenceHash: match.referenceHash });
  return Booking.findOne({ userId, $or: candidates });
};

const applyTicketToBooking = (booking, user, ticket, match, now) => {
  const isNew = booking.isNew;
  const previous = {
    status: booking.status,
    paymentStatus: booking.paymentStatus,
    providerStatus: booking.providerStatus,
    paymentIssue: booking.paymentIssue,
  };
  const providerStatus = mapProviderStatus(ticket.providerStatus);
  const relatedPaymentIds = match.related.map((payment) => payment.id);
  const duplicatePaymentIds = relatedPaymentIds.filter((id) => id !== match.primary.id);
  const totalFare = Number(ticket.totalFare) || Number(match.primary.amount) / 100;

  booking.userId = user._id;
  booking.userPhone = user.phone;
  booking.clientReference = booking.clientReference || `ets-${ticket.ticketNo}`;
  booking.serviceType = 'bus';
  booking.providerReferenceHash = match.referenceHash || booking.providerReferenceHash || '';
  booking.pnr = ticket.pnr;
  booking.ticketNo = ticket.ticketNo;
  booking.externalBookingId = ticket.ticketNo;
  booking.busName = ticket.busName || cleanText(match.primary.order?.notes?.bus_name, 250) || 'Bus booking';
  booking.busType = ticket.busType || 'Bus';
  booking.busNumber = ticket.busNumber;
  booking.source = ticket.source || 'Details unavailable';
  booking.destination = ticket.destination || 'Details unavailable';
  booking.fromCity = booking.source;
  booking.toCity = booking.destination;
  booking.journeyDate = ticket.journeyDate || ticket.bookingDate || now;
  booking.departureTime = ticket.departureTime;
  booking.arrivalTime = ticket.arrivalTime;
  booking.boardingPoint = ticket.boardingPoint;
  booking.droppingPoint = ticket.droppingPoint;
  booking.seats = ticket.seats;
  booking.selectedSeats = ticket.seats;
  booking.passengers = ticket.passengers;
  booking.baseFare = Math.max(0, totalFare - Number(ticket.serviceTax || 0));
  booking.serviceTax = ticket.serviceTax;
  booking.totalFare = totalFare;
  booking.paymentId = match.primary.id;
  booking.paymentOrderId = match.primary.order_id;
  booking.relatedPaymentIds = relatedPaymentIds;
  booking.paymentStatus = 'completed';
  booking.paymentMethod = cleanText(match.primary.method, 100);
  booking.paymentIssue = duplicatePaymentIds.length ? 'duplicate_payment' : '';
  booking.paymentNote = duplicatePaymentIds.length
    ? cleanText(`${relatedPaymentIds.length} captured payments matched one provider ticket. Manual refund review is required for extra payment ${duplicatePaymentIds.join(', ')}.`, 500)
    : '';
  booking.status = providerStatus;
  booking.providerStatus = ticket.providerStatus;
  booking.failureStage = providerStatus === 'failed' ? 'provider_reconciliation' : '';
  booking.failureReason = providerStatus === 'failed' ? 'The provider reported this ticket as failed.' : '';
  booking.refundAmount = ticket.refundAmount;
  booking.refundStatus = ticket.refundAmount > 0 ? 'provider_reported' : booking.refundStatus;
  booking.reconciliationSource = 'ets_partner_report';
  booking.lastReconciledAt = now;
  if (['confirmed', 'completed'].includes(providerStatus)) booking.confirmedAt = booking.confirmedAt || ticket.bookingDate || now;
  if (providerStatus === 'failed') booking.failedAt = booking.failedAt || now;
  if (isNew && ticket.bookingDate) booking.createdAt = ticket.bookingDate;

  const changed = isNew || Object.entries(previous).some(([key, value]) => String(value || '') !== String(booking[key] || ''));
  if (changed) {
    booking.statusHistory.push({
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      stage: 'provider_reconciliation',
      message: booking.paymentNote || `Provider status: ${ticket.providerStatus}`,
      createdAt: now,
    });
  }
  return { isNew, duplicatePaymentIds };
};

const isBusPayment = (payment) => {
  const notes = payment.order?.notes || {};
  return normalizeText(notes.service_type) === 'bus' || Boolean(notes.bus_name || notes.seats);
};

const recoverUnmatchedPayment = async (user, payment, now, dryRun) => {
  let booking = await Booking.findOne({
    userId: user._id,
    $or: [{ paymentId: payment.id }, { paymentOrderId: payment.order_id }],
  });
  if (booking && !['pending', 'failed'].includes(booking.status)) return { created: false, updated: false };

  const paymentDate = toDate(Number(payment.created_at) * 1000) || now;
  const notes = payment.order?.notes || {};
  const journeyDate = toDate(notes.travel_date) || paymentDate;
  const isNew = !booking;
  if (!booking) booking = new Booking();
  const previousStatus = booking.status;
  const previousPaymentStatus = booking.paymentStatus;
  const previousProviderStatus = booking.providerStatus;

  booking.userId = user._id;
  booking.userPhone = user.phone;
  booking.clientReference = booking.clientReference || `recovered-payment-${payment.id}`;
  booking.serviceType = 'bus';
  booking.providerReferenceHash = cleanText(notes.pricing_ref_hash, 100);
  booking.busName = cleanText(notes.bus_name, 250) || 'Bus booking';
  booking.busType = booking.busType || 'Details unavailable';
  booking.source = booking.source || 'Details unavailable';
  booking.destination = booking.destination || 'Details unavailable';
  booking.fromCity = booking.fromCity || booking.source;
  booking.toCity = booking.toCity || booking.destination;
  booking.journeyDate = booking.journeyDate || journeyDate;
  booking.seats = booking.seats?.length ? booking.seats : cleanText(notes.seats, 500).split(',').map((seat) => seat.trim()).filter(Boolean);
  booking.selectedSeats = booking.seats;
  booking.baseFare = booking.baseFare || Number(payment.amount) / 100;
  booking.totalFare = booking.totalFare || Number(payment.amount) / 100;
  booking.paymentId = payment.id;
  booking.paymentOrderId = payment.order_id;
  booking.relatedPaymentIds = [payment.id];
  booking.paymentStatus = 'completed';
  booking.paymentMethod = cleanText(payment.method, 100);
  booking.status = 'failed';
  booking.providerStatus = 'NOT_FOUND';
  booking.failureStage = 'provider_reconciliation';
  booking.failureReason = 'Payment was captured, but no provider ticket was found. Manual review is required.';
  booking.paymentNote = 'Captured payment needs provider booking or refund review.';
  booking.reconciliationSource = 'razorpay_ets_reconciliation';
  booking.lastReconciledAt = now;
  booking.failedAt = booking.failedAt || now;
  if (isNew) booking.createdAt = paymentDate;
  if (isNew || previousStatus !== 'failed' || previousPaymentStatus !== 'completed' || previousProviderStatus !== 'NOT_FOUND') {
    booking.statusHistory.push({
      status: 'failed',
      paymentStatus: 'completed',
      stage: 'provider_reconciliation',
      message: booking.failureReason,
      createdAt: now,
    });
  }

  if (!dryRun) await booking.save();
  return { created: isNew, updated: !isNew };
};

const performSync = async (user, { lookbackDays = DEFAULT_LOOKBACK_DAYS, dryRun = false, force = false } = {}) => {
  const now = new Date();
  // Do not clamp this to user.createdAt. A customer record can be recreated
  // after a deployment or DB recovery while older payment/provider records
  // still need to be restored.
  const from = new Date(now.getTime() - Math.max(1, Number(lookbackDays) || DEFAULT_LOOKBACK_DAYS) * 24 * 60 * 60 * 1000);

  const [providerTickets, allPayments] = await getReconciliationSources(from, now, force);
  const userPayments = allPayments.filter((payment) => capturedPayment(payment) && paymentBelongsToUser(payment, user));
  const payments = await fetchOrdersForPayments(userPayments);
  const usedPaymentIds = new Set();
  const result = {
    providerTicketsScanned: providerTickets.length,
    customerPaymentsScanned: payments.length,
    bookingsCreated: 0,
    bookingsUpdated: 0,
    failedAttemptsCreated: 0,
    duplicatePayments: [],
    dryRun,
  };

  for (const ticket of providerTickets) {
    const availablePayments = payments.filter((payment) => !usedPaymentIds.has(payment.id));
    const match = matchTicketToPayments(ticket, availablePayments);
    if (!match) continue;
    match.related.forEach((payment) => usedPaymentIds.add(payment.id));
    let booking = await findExistingBooking(user._id, ticket, match);
    if (!booking) booking = new Booking();
    const applied = applyTicketToBooking(booking, user, ticket, match, now);
    if (applied.isNew) result.bookingsCreated += 1;
    else result.bookingsUpdated += 1;
    result.duplicatePayments.push(...applied.duplicatePaymentIds);
    if (!dryRun) await booking.save();
  }

  for (const payment of payments) {
    const paymentAge = now.getTime() - Number(payment.created_at) * 1000;
    if (usedPaymentIds.has(payment.id) || !isBusPayment(payment) || paymentAge < UNMATCHED_PAYMENT_GRACE_MS) continue;
    const recovered = await recoverUnmatchedPayment(user, payment, now, dryRun);
    if (recovered.created) {
      result.bookingsCreated += 1;
      result.failedAttemptsCreated += 1;
    } else if (recovered.updated) {
      result.bookingsUpdated += 1;
    }
  }

  result.duplicatePayments = [...new Set(result.duplicatePayments)];
  result.reconciledAt = now;
  return result;
};

const reconcileUserBookings = async (user, options = {}) => {
  const key = String(user._id);
  const cached = syncCache.get(key);
  if (!options.force && !options.dryRun && cached && cached.expiresAt > Date.now()) {
    const result = await cached.promise;
    return { ...result, cached: true };
  }

  const promise = performSync(user, options);
  if (!options.dryRun) syncCache.set(key, { promise, expiresAt: Date.now() + CACHE_TTL_MS });
  try {
    const result = await promise;
    return { ...result, cached: false };
  } catch (error) {
    if (syncCache.get(key)?.promise === promise) syncCache.delete(key);
    throw error;
  }
};

const reconcileAllUsers = async () => {
  // Required lazily so route-only/tests can use the reconciliation helpers
  // without adding another model dependency during module initialization.
  const User = require('../models/User');
  const users = await User.find({ phone: { $exists: true, $ne: '' } })
    .select('_id phone email createdAt')
    .lean();
  const summary = { usersScanned: users.length, usersReconciled: 0, errors: 0, bookingsChanged: 0 };

  for (const user of users) {
    try {
      const result = await reconcileUserBookings(user);
      summary.usersReconciled += 1;
      summary.bookingsChanged += result.bookingsCreated + result.bookingsUpdated;
    } catch {
      summary.errors += 1;
    }
  }
  return summary;
};

module.exports = {
  reconcileUserBookings,
  reconcileAllUsers,
  _test: {
    mapProviderStatus,
    normalizePhone,
    parseProviderJourneyDate,
    sanitizeProviderTicket,
    matchTicketToPayments,
    choosePrimaryPayment,
  },
};
