/**
 * Client-side boarding-pass PDF generation for bus tickets.
 * The document is rendered with jsPDF and includes a real QR code.
 */

import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import SancharieTicketLogoUrl from '../assets/logosan-ticket.jpg';

const BRAND = {
  name: 'SANCHARIE',
  tagline: 'Travel smart. Travel Sancharie.',
  website: 'www.sancharie.com',
  email: 'support@sancharie.com',
};

const COLORS = {
  page: [244, 239, 225],
  paper: [255, 252, 244],
  paperWarm: [251, 244, 224],
  gold: [191, 139, 25],
  goldLight: [224, 188, 92],
  goldSoft: [246, 229, 179],
  navy: [0, 38, 53],
  navySoft: [14, 57, 70],
  ink: [24, 27, 31],
  muted: [103, 95, 77],
  white: [255, 255, 255],
  green: [28, 122, 78],
  red: [184, 55, 55],
};

const safeString = (value, fallback = 'N/A') => {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value).replace(/\s+/g, ' ').trim() || fallback;
};

const shortReference = (value, maxLength = 8) => {
  const text = safeString(value, '');
  return text.slice(0, maxLength);
};

const capitalize = (value) => {
  const text = safeString(value, '-').toLowerCase();
  return text === '-' ? text : `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
};

const getPointText = (point) => {
  if (!point) return '';
  if (typeof point === 'string') return point;
  return point.name
    || point.CityPointName
    || point.location
    || point.address
    || '';
};

const parseDate = (value) => {
  if (!value) return null;

  const text = String(value);
  const dateParts = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const date = dateParts
    ? new Date(Number(dateParts[1]), Number(dateParts[2]) - 1, Number(dateParts[3]))
    : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDate = (value) => {
  const date = parseDate(value);
  if (!date) return safeString(value);
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const formatTime = (value) => {
  if (!value) return 'Time to be confirmed';
  const text = String(value).trim();
  const time = text.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)/i);
  if (time) return `${time[1].padStart(2, '0')}:${time[2]} ${time[3].toUpperCase()}`;

  const date = new Date(value);
  if (!Number.isNaN(date.getTime()) && text.includes('T')) {
    return date.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  }

  return text;
};

const formatFare = (value) => Number(value || 0).toLocaleString('en-IN', {
  maximumFractionDigits: 2,
});

const truncateText = (doc, value, maxWidth) => {
  const text = safeString(value);
  if (doc.getTextWidth(text) <= maxWidth) return text;

  let shortened = text;
  while (shortened.length > 1 && doc.getTextWidth(`${shortened}...`) > maxWidth) {
    shortened = shortened.slice(0, -1);
  }
  return `${shortened}...`;
};

const normalizeSeats = (seats) => {
  const values = Array.isArray(seats) ? seats : [seats];
  return values
    .map((seat) => (
      typeof seat === 'object'
        ? seat?.seatName || seat?.seatNumber || seat?.id
        : seat
    ))
    .filter(Boolean)
    .map(String);
};

const normalizePassengers = (passengers, seats) => {
  if (Array.isArray(passengers) && passengers.length > 0) {
    return passengers.map((passenger, index) => ({
      name: safeString(passenger?.name, `Passenger ${index + 1}`),
      age: safeString(passenger?.age, '-'),
      gender: capitalize(passenger?.gender),
      seat: safeString(
        passenger?.seatNumber || passenger?.seatName || passenger?.seatNbr || seats[index],
        '-'
      ),
    }));
  }

  return seats.map((seat, index) => ({
    name: `Passenger ${index + 1}`,
    age: '-',
    gender: '-',
    seat,
  }));
};

let brandLogoPromise;

const loadBrandLogo = async () => {
  if (!brandLogoPromise) {
    brandLogoPromise = fetch(SancharieTicketLogoUrl)
      .then((response) => {
        if (!response.ok) throw new Error(`Logo request failed with status ${response.status}`);
        return response.arrayBuffer();
      })
      .then((buffer) => new Uint8Array(buffer))
      .catch((error) => {
        console.warn('Sancharie ticket logo could not be loaded:', error);
        return null;
      });
  }

  return brandLogoPromise;
};

const drawBrandLogo = (doc, logoData, x, y, width = 14) => {
  if (!logoData) return;

  const height = width * (316 / 210);
  doc.addImage(
    logoData,
    'JPEG',
    x,
    y,
    width,
    height,
    'sancharie-ticket-logo',
    'FAST',
  );
};

const drawBusIcon = (doc, x, y, scale = 1) => {
  const width = 12 * scale;
  const height = 7 * scale;
  doc.setDrawColor(...COLORS.goldLight);
  doc.setFillColor(...COLORS.gold);
  doc.setLineWidth(0.45);
  doc.roundedRect(x - width / 2, y - height / 2, width, height, 1.2, 1.2, 'FD');
  doc.setFillColor(...COLORS.navy);
  doc.roundedRect(x - width / 2 + 1.4, y - height / 2 + 1.2, width - 2.8, 2.4 * scale, 0.5, 0.5, 'F');
  doc.setFillColor(...COLORS.goldLight);
  doc.circle(x - width / 3, y + height / 2 + 0.6, 1 * scale, 'F');
  doc.circle(x + width / 3, y + height / 2 + 0.6, 1 * scale, 'F');
};

const drawPin = (doc, x, y) => {
  doc.setFillColor(...COLORS.goldLight);
  doc.circle(x, y - 1.5, 2.2, 'F');
  doc.triangle(x - 1.6, y - 0.3, x + 1.6, y - 0.3, x, y + 3, 'F');
  doc.setFillColor(...COLORS.navy);
  doc.circle(x, y - 1.5, 0.7, 'F');
};

const drawCalendarIcon = (doc, x, y) => {
  doc.setDrawColor(...COLORS.gold);
  doc.setLineWidth(0.6);
  doc.roundedRect(x, y, 8, 8, 1, 1, 'S');
  doc.line(x, y + 2.6, x + 8, y + 2.6);
  doc.line(x + 2, y - 1, x + 2, y + 1.3);
  doc.line(x + 6, y - 1, x + 6, y + 1.3);
};

const drawSeatIcon = (doc, x, y) => {
  doc.setDrawColor(...COLORS.gold);
  doc.setLineWidth(0.6);
  doc.roundedRect(x, y, 5, 7, 1, 1, 'S');
  doc.roundedRect(x + 4.5, y + 5.5, 4, 3, 0.8, 0.8, 'S');
  doc.line(x + 1, y + 7, x + 1, y + 10);
  doc.line(x + 8, y + 8, x + 8, y + 10);
};

const toSeatCoordinate = (value) => {
  const coordinate = Number(value);
  return Number.isFinite(coordinate) && coordinate >= 0 ? Math.floor(coordinate) : null;
};

const normalizeSeatPosition = (seat, index = 0) => {
  const nested = seat?.fullData && typeof seat.fullData === 'object' ? seat.fullData : {};
  const source = { ...nested, ...(seat && typeof seat === 'object' ? seat : {}) };
  const name = safeString(
    source.seatName || source.seatNumber || source.seatNbr || source.id || seat,
    `Seat ${index + 1}`,
  );
  const explicitDeck = toSeatCoordinate(source.zIndex ?? source.deck);
  const inferredDeck = /^UPPER[-\s]/i.test(name) ? 1 : 0;

  return {
    name,
    row: toSeatCoordinate(source.row ?? source.rowNo),
    column: toSeatCoordinate(source.column ?? source.columnNo),
    length: Math.max(1, toSeatCoordinate(source.length) || 1),
    width: Math.max(1, toSeatCoordinate(source.width) || 1),
    deck: explicitDeck !== null
      ? (explicitDeck === 1 ? 1 : 0)
      : (source.isUpper === true ? 1 : inferredDeck),
  };
};

const getFallbackSeatIndex = (seatName, fallbackIndex) => {
  const numericPart = String(seatName || '').match(/\d+/)?.[0];
  if (!numericPart) return fallbackIndex;
  return Math.max(0, Number(numericPart) - 1);
};

const createFallbackDeck = (deck, selectedDetails) => {
  const rows = 2;
  const columns = 8;
  const seats = Array.from({ length: rows * columns }, (_, index) => ({
    name: '',
    row: index % rows,
    column: Math.floor(index / rows),
    selected: false,
  }));

  selectedDetails.filter((seat) => seat.deck === deck).forEach((seat, index) => {
    let row = seat.row === null ? null : Math.min(rows - 1, seat.row === 0 ? 0 : 1);
    let column = seat.column === null ? null : Math.min(columns - 1, seat.column);

    if (row === null || column === null) {
      const fallbackSeatIndex = getFallbackSeatIndex(seat.name, index);
      row = fallbackSeatIndex % rows;
      column = Math.floor(fallbackSeatIndex / rows) % columns;
    }

    let slot = column * rows + row;
    while (seats[slot]?.selected && slot < seats.length - 1) slot += 1;
    seats[slot] = { ...seats[slot], name: seat.name, selected: true };
  });

  return { deck, rows, columns, seats };
};

const createActualDeck = (deck, details, selectedNames) => {
  const deckSeats = details.filter((seat) => seat.deck === deck);
  const normalizedSeats = deckSeats.map((seat, index) => ({
    ...seat,
    row: seat.row === null ? index % 2 : seat.row,
    column: seat.column === null ? Math.floor(index / 2) : seat.column,
    selected: selectedNames.has(seat.name.toLowerCase()),
  }));
  const rows = Math.max(1, ...normalizedSeats.map((seat) => seat.row + seat.width));
  const columns = Math.max(1, ...normalizedSeats.map((seat) => seat.column + seat.length));

  return {
    deck,
    rows,
    columns,
    seats: normalizedSeats,
  };
};

const buildMiniSeatLayout = (seatNames, seatLayout, hasUpperDeck) => {
  const rawSeatLayout = Array.isArray(seatLayout) ? seatLayout : [];
  const selectedNames = new Set(seatNames.map((seat) => seat.toLowerCase()));
  const layoutDetails = rawSeatLayout
    .map(normalizeSeatPosition)
    .filter((seat) => seat.name);
  const hasStructuralMetadata = rawSeatLayout.some((seat) => seat && typeof seat === 'object' && (
    'length' in seat || 'width' in seat || 'available' in seat || 'sleeper' in seat
  ));
  const isFullLayout = layoutDetails.some((seat) => seat.row !== null && seat.column !== null)
    && (layoutDetails.length > seatNames.length || hasStructuralMetadata);

  if (isFullLayout) {
    const availableDecks = [...new Set(layoutDetails.map((seat) => seat.deck))].sort((a, b) => b - a);
    return availableDecks.map((deck) => createActualDeck(deck, layoutDetails, selectedNames));
  }

  const detailsByName = new Map(layoutDetails.map((seat) => [seat.name.toLowerCase(), seat]));
  const selectedDetails = seatNames.map((seatName, index) => (
    detailsByName.get(seatName.toLowerCase()) || normalizeSeatPosition(seatName, index)
  ));
  const showUpperDeck = hasUpperDeck === true || selectedDetails.some((seat) => seat.deck === 1);
  const decks = showUpperDeck ? [1, 0] : [0];
  return decks.map((deck) => createFallbackDeck(deck, selectedDetails));
};

const drawMiniSeatLayout = (doc, seatNames, seatLayout, hasUpperDeck) => {
  if (seatNames.length === 0) {
    doc.setTextColor(...COLORS.muted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text('Seat details will be confirmed by the operator.', 20, 204);
    return;
  }

  const decks = buildMiniSeatLayout(seatNames, seatLayout, hasUpperDeck);
  const top = 197;
  const bottom = 213.5;
  const deckGap = decks.length > 1 ? 1.1 : 0;
  const deckHeight = (bottom - top - deckGap * (decks.length - 1)) / decks.length;
  const gridX = 43;
  const gridWidth = 149;

  decks.forEach((deck, deckIndex) => {
    const deckTop = top + deckIndex * (deckHeight + deckGap);
    const rowGap = 0.55;
    const columnGap = 0.9;
    const cellWidth = Math.min(14, (gridWidth - columnGap * (deck.columns - 1)) / deck.columns);
    const cellHeight = Math.min(3.8, (deckHeight - rowGap * (deck.rows - 1)) / deck.rows);
    const renderedWidth = cellWidth * deck.columns + columnGap * (deck.columns - 1);
    const renderedHeight = cellHeight * deck.rows + rowGap * (deck.rows - 1);
    const startX = gridX + Math.max(0, (gridWidth - renderedWidth) / 2);
    const startY = deckTop + Math.max(0, (deckHeight - renderedHeight) / 2);

    doc.setTextColor(...COLORS.muted);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.7);
    doc.text(deck.deck === 1 ? 'UPPER DECK' : 'LOWER DECK', 20, deckTop + deckHeight / 2 + 1);

    deck.seats.forEach((seat) => {
      const x = startX + seat.column * (cellWidth + columnGap);
      const y = startY + seat.row * (cellHeight + rowGap);
      const seatWidth = cellWidth * (seat.length || 1) + columnGap * ((seat.length || 1) - 1);
      const seatHeight = cellHeight * (seat.width || 1) + rowGap * ((seat.width || 1) - 1);
      doc.setLineWidth(seat.selected ? 0.45 : 0.25);
      doc.setDrawColor(...(seat.selected ? COLORS.gold : COLORS.goldLight));
      doc.setFillColor(...(seat.selected ? COLORS.gold : COLORS.paper));
      doc.roundedRect(x, y, seatWidth, seatHeight, 0.7, 0.7, 'FD');

      if (seatHeight >= 2.4) {
        doc.setDrawColor(...(seat.selected ? COLORS.white : COLORS.goldSoft));
        doc.setLineWidth(0.22);
        doc.line(x + 1.1, y + 0.7, x + 1.1, y + seatHeight - 0.7);
      }

      if (seat.selected && seatHeight >= 2.6) {
        doc.setTextColor(...COLORS.white);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(Math.min(6.5, seatHeight * 1.55));
        doc.text(truncateText(doc, seat.name, Math.max(4, seatWidth - 2)), x + seatWidth / 2, y + seatHeight * 0.68, {
          align: 'center',
        });
      }
    });

    if (deckIndex < decks.length - 1) {
      doc.setDrawColor(...COLORS.goldSoft);
      doc.setLineDashPattern([1, 1], 0);
      doc.line(20, deckTop + deckHeight + deckGap / 2, 192, deckTop + deckHeight + deckGap / 2);
      doc.setLineDashPattern([], 0);
    }
  });
};

const drawDashedLine = (doc, x1, y, x2) => {
  doc.setDrawColor(...COLORS.goldLight);
  doc.setLineWidth(0.35);
  doc.setLineDashPattern([2, 2], 0);
  doc.line(x1, y, x2, y);
  doc.setLineDashPattern([], 0);
};

const drawSkyline = (doc, bottomY) => {
  const buildings = [
    [18, 8, 10], [29, 6, 17], [39, 9, 12], [52, 7, 23], [63, 11, 14],
    [78, 8, 20], [121, 8, 15], [132, 12, 22], [148, 8, 13], [160, 10, 18],
    [175, 7, 12], [184, 9, 24],
  ];

  doc.setDrawColor(...COLORS.navySoft);
  doc.setFillColor(...COLORS.navySoft);
  buildings.forEach(([x, width, height]) => {
    doc.rect(x, bottomY - height, width, height, 'F');
    doc.setFillColor(...COLORS.gold);
    for (let row = 0; row < 3; row += 1) {
      doc.rect(x + 2, bottomY - height + 3 + row * 4, 0.7, 0.7, 'F');
    }
    doc.setFillColor(...COLORS.navySoft);
  });
};

const getQrPayload = (reference) => {
  const path = `/ticket/${encodeURIComponent(reference)}`;
  if (typeof window !== 'undefined' && window.location?.origin) {
    return new URL(path, window.location.origin).toString();
  }
  return `https://${BRAND.website}${path}`;
};

const createQrDataUrl = async (reference) => QRCode.toDataURL(getQrPayload(reference), {
  errorCorrectionLevel: 'M',
  margin: 1,
  width: 480,
  color: {
    dark: '#001F2B',
    light: '#FFFDF7',
  },
});

const drawPassengerTable = (doc, passengers, startY, maxRows = passengers.length) => {
  const rows = passengers.slice(0, maxRows);
  const left = 18;
  const width = 174;
  const headerHeight = 7;
  const rowHeight = 6;

  doc.setFillColor(...COLORS.goldSoft);
  doc.roundedRect(left, startY, width, headerHeight, 1, 1, 'F');
  doc.setTextColor(...COLORS.muted);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('PASSENGER', left + 4, startY + 4.7);
  doc.text('AGE', 113, startY + 4.7, { align: 'center' });
  doc.text('GENDER', 143, startY + 4.7, { align: 'center' });
  doc.text('SEAT', 181, startY + 4.7, { align: 'center' });

  rows.forEach((passenger, index) => {
    const y = startY + headerHeight + index * rowHeight;
    if (index % 2 === 1) {
      doc.setFillColor(...COLORS.paperWarm);
      doc.rect(left, y, width, rowHeight, 'F');
    }

    doc.setTextColor(...COLORS.ink);
    doc.setFont('helvetica', index === 0 ? 'bold' : 'normal');
    doc.setFontSize(7.8);
    doc.text(truncateText(doc, passenger.name, 78), left + 4, y + 4.2);
    doc.setFont('helvetica', 'normal');
    doc.text(safeString(passenger.age, '-'), 113, y + 4.2, { align: 'center' });
    doc.text(safeString(passenger.gender, '-'), 143, y + 4.2, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.text(safeString(passenger.seat, '-'), 181, y + 4.2, { align: 'center' });
  });

  return startY + headerHeight + rows.length * rowHeight;
};

const drawManifestPage = (doc, data) => {
  const {
    passengers,
    reference,
    pnr,
    fromCity,
    toCity,
    journeyDate,
    departureTime,
    boardingPoint,
    droppingPoint,
    contactPhone,
    contactEmail,
    brandLogo,
  } = data;

  doc.addPage('a4', 'portrait');
  doc.setFillColor(...COLORS.page);
  doc.rect(0, 0, 210, 297, 'F');
  doc.setFillColor(...COLORS.paper);
  doc.setDrawColor(...COLORS.gold);
  doc.setLineWidth(0.7);
  doc.roundedRect(8, 8, 194, 281, 7, 7, 'FD');

  doc.setFillColor(...COLORS.navy);
  doc.roundedRect(8, 8, 194, 46, 7, 7, 'F');
  drawBrandLogo(doc, brandLogo, 16, 13, 14);
  doc.setTextColor(...COLORS.white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(BRAND.name, 35, 23);
  doc.setTextColor(...COLORS.goldLight);
  doc.setFontSize(8);
  doc.text('PASSENGER MANIFEST', 35, 31);
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(10);
  doc.text(`${safeString(fromCity)}  >  ${safeString(toCity)}`, 192, 22, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`${formatDate(journeyDate)} | ${formatTime(departureTime)}`, 192, 31, { align: 'right' });
  doc.text(`Ticket: ${safeString(reference)}${pnr ? ` | PNR: ${shortReference(pnr)}` : ''}`, 192, 40, { align: 'right' });

  doc.setTextColor(...COLORS.gold);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('ALL TRAVELLERS', 18, 68);
  const tableEnd = drawPassengerTable(doc, passengers, 74);

  const detailY = Math.max(tableEnd + 14, 155);
  drawDashedLine(doc, 18, detailY - 8, 192);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.gold);
  doc.text('BOARDING POINT', 18, detailY);
  doc.text('DROPPING POINT', 108, detailY);
  doc.setTextColor(...COLORS.ink);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(doc.splitTextToSize(safeString(boardingPoint, 'To be confirmed'), 76), 18, detailY + 7);
  doc.text(doc.splitTextToSize(safeString(droppingPoint, 'To be confirmed'), 76), 108, detailY + 7);

  doc.setFillColor(...COLORS.paperWarm);
  doc.roundedRect(18, detailY + 28, 174, 35, 3, 3, 'F');
  doc.setTextColor(...COLORS.gold);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('TRAVEL REMINDERS', 24, detailY + 37);
  doc.setTextColor(...COLORS.muted);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('1. Arrive at the boarding point at least 15 minutes before departure.', 24, detailY + 45);
  doc.text('2. Carry a valid government-issued photo ID for verification.', 24, detailY + 51);
  doc.text('3. Operator boarding, baggage, and cancellation rules apply.', 24, detailY + 57);

  doc.setTextColor(...COLORS.muted);
  doc.setFontSize(7);
  const contact = [contactPhone && `Phone: ${contactPhone}`, contactEmail && `Email: ${contactEmail}`]
    .filter(Boolean)
    .join(' | ');
  if (contact) doc.text(truncateText(doc, contact, 170), 105, 270, { align: 'center' });
  doc.setTextColor(...COLORS.gold);
  doc.setFont('helvetica', 'bold');
  doc.text(`${BRAND.website} | ${BRAND.email}`, 105, 280, { align: 'center' });
};

export const createTicketPDF = async (ticketData) => {
  const {
    bookingId = 'N/A',
    ticketNo = '',
    pnr = '',
    busName = 'Bus Service',
    busType = 'Bus',
    serviceNo = '',
    vehicleNo = '',
    status = 'CONFIRMED',
    fromCity = 'Origin',
    toCity = 'Destination',
    journeyDate,
    boardingPoint,
    droppingPoint,
    departureTime = '',
    arrivalTime = '',
    seats = [],
    seatLayout = [],
    passengers = [],
    totalFare = 0,
    paymentId = '',
    contactPhone = '',
    contactEmail = '',
    hasUpperDeck = false,
  } = ticketData || {};

  const reference = safeString(ticketNo || bookingId);
  const seatNames = normalizeSeats(seats);
  const passengerRows = normalizePassengers(passengers, seatNames);
  const passengerCount = passengerRows.length || seatNames.length;
  const boardingText = getPointText(boardingPoint);
  const droppingText = getPointText(droppingPoint);
  const serviceText = shortReference(serviceNo || vehicleNo) || '-';
  const normalizedStatus = safeString(status, 'CONFIRMED').toUpperCase();
  const isCancelled = normalizedStatus.includes('CANCEL');
  const brandLogo = await loadBrandLogo();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(...COLORS.page);
  doc.rect(0, 0, pageWidth, 297, 'F');
  doc.setFillColor(...COLORS.paper);
  doc.setDrawColor(...COLORS.gold);
  doc.setLineWidth(0.7);
  doc.roundedRect(8, 8, 194, 281, 7, 7, 'FD');

  // Dark premium route header.
  doc.setFillColor(...COLORS.navy);
  doc.roundedRect(8, 8, 194, 79, 7, 7, 'F');
  drawSkyline(doc, 82);
  drawBrandLogo(doc, brandLogo, 16, 12, 14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(17);
  doc.text(BRAND.name, 35, 22);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.goldLight);
  doc.setFontSize(7.5);
  doc.text(BRAND.tagline, 35, 29);

  doc.setDrawColor(...COLORS.goldLight);
  doc.setLineWidth(0.5);
  doc.roundedRect(142, 15, 50, 14, 3, 3, 'S');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('BOARDING PASS', 167, 24, { align: 'center' });

  doc.setFontSize(7);
  doc.setTextColor(...COLORS.goldLight);
  doc.text('FROM', 18, 42);
  doc.text('TO', 192, 42, { align: 'right' });
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(13);
  doc.text(truncateText(doc, fromCity, 58), 18, 51);
  doc.text(truncateText(doc, toCity, 58), 192, 51, { align: 'right' });

  drawPin(doc, 73, 48);
  drawPin(doc, 137, 48);
  doc.setDrawColor(...COLORS.goldLight);
  doc.setLineDashPattern([1.2, 1.8], 0);
  doc.line(77, 48, 96, 48);
  doc.line(114, 48, 133, 48);
  doc.setLineDashPattern([], 0);
  drawBusIcon(doc, 105, 48, 1.05);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.goldLight);
  doc.setFontSize(8);
  doc.text(truncateText(doc, busName, 115), 105, 67, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(7);
  doc.text(truncateText(doc, busType, 105), 105, 73, { align: 'center' });

  // Summary strip overlaps the header like a boarding-pass coupon.
  doc.setFillColor(...COLORS.white);
  doc.setDrawColor(...COLORS.goldLight);
  doc.setLineWidth(0.45);
  doc.roundedRect(16, 76, 178, 30, 5, 5, 'FD');
  doc.setDrawColor(...COLORS.goldSoft);
  doc.line(75, 82, 75, 101);
  doc.line(135, 82, 135, 101);

  const summary = [
    { label: 'PASSENGERS', value: passengerCount || '-' , x: 45 },
    { label: 'SERVICE NO.', value: serviceText, x: 105 },
    { label: 'SEAT NO.', value: seatNames.length ? seatNames.join(', ') : '-', x: 165 },
  ];
  summary.forEach((item) => {
    doc.setTextColor(...COLORS.gold);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text(item.label, item.x, 87, { align: 'center' });
    doc.setTextColor(...COLORS.ink);
    doc.setFontSize(item.label === 'SEAT NO.' ? 10 : 14);
    doc.text(truncateText(doc, item.value, 48), item.x, 98, { align: 'center' });
  });

  // Ticket-cut notches.
  doc.setFillColor(...COLORS.page);
  doc.setDrawColor(...COLORS.gold);
  doc.circle(8, 105, 5, 'FD');
  doc.circle(202, 105, 5, 'FD');

  // Departure and boarding details.
  drawCalendarIcon(doc, 20, 116);
  doc.setTextColor(...COLORS.gold);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('DEPARTURE', 32, 120);
  doc.setTextColor(...COLORS.ink);
  doc.setFontSize(13);
  doc.text(formatDate(journeyDate), 32, 131);
  doc.setFontSize(12);
  doc.text(formatTime(departureTime), 32, 141);
  if (arrivalTime) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.muted);
    doc.setFontSize(7.5);
    doc.text(`Expected arrival: ${formatTime(arrivalTime)}`, 32, 148);
  }

  doc.setTextColor(...COLORS.gold);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('BOARDING', 20, 157);
  doc.text('DROPPING', 83, 157);
  doc.setTextColor(...COLORS.ink);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(truncateText(doc, boardingText || 'To be confirmed', 55), 20, 164);
  doc.text(truncateText(doc, droppingText || 'To be confirmed', 55), 83, 164);

  // Scannable ticket QR.
  doc.setFillColor(...COLORS.white);
  doc.setDrawColor(...COLORS.goldLight);
  doc.roundedRect(148, 113, 43, 43, 4, 4, 'FD');
  try {
    const qrDataUrl = await createQrDataUrl(reference);
    doc.addImage(qrDataUrl, 'PNG', 151, 116, 37, 37);
  } catch (qrError) {
    console.warn('Ticket QR generation failed:', qrError);
    doc.setTextColor(...COLORS.muted);
    doc.setFontSize(7);
    doc.text('QR unavailable', 169.5, 135, { align: 'center' });
  }
  doc.setTextColor(...COLORS.muted);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.text(`TICKET ${truncateText(doc, reference, 42)}`, 169.5, 163, { align: 'center' });
  if (pnr) doc.text(`PNR ${shortReference(pnr)}`, 169.5, 168, { align: 'center' });

  drawDashedLine(doc, 16, 174, 194);

  // Compact bus map with the traveller's chosen seat highlighted in gold.
  drawSeatIcon(doc, 20, 181);
  doc.setTextColor(...COLORS.gold);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('CONFIRMED SEAT ALLOCATION', 33, 187);
  doc.setTextColor(...COLORS.muted);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.text('Your selected seat is highlighted in gold.', 33, 193);
  drawMiniSeatLayout(doc, seatNames, seatLayout, hasUpperDeck || /sleeper/i.test(busType));

  drawDashedLine(doc, 16, 216, 194);
  doc.setTextColor(...COLORS.gold);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('TRAVELLERS', 18, 224);
  const previewRows = Math.min(passengerRows.length, 4);
  const tableEnd = drawPassengerTable(doc, passengerRows, 228, previewRows);
  if (passengerRows.length > previewRows) {
    doc.setTextColor(...COLORS.muted);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(6.5);
    doc.text(`+ ${passengerRows.length - previewRows} more traveller(s) listed on page 2`, 18, tableEnd + 5);
  }

  // Fare, status, and booking reference band.
  doc.setFillColor(...COLORS.navy);
  doc.roundedRect(16, 260, 178, 17, 3, 3, 'F');
  doc.setTextColor(...COLORS.goldLight);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.text('STATUS', 23, 266);
  doc.text('TOTAL FARE', 105, 266, { align: 'center' });
  doc.text('BOOKING ID', 187, 266, { align: 'right' });
  doc.setTextColor(...(isCancelled ? COLORS.red : COLORS.white));
  doc.setFontSize(8);
  doc.text(normalizedStatus, 23, 272);
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(10);
  doc.text(`INR ${formatFare(totalFare)}`, 105, 273, { align: 'center' });
  doc.setFontSize(7.5);
  doc.text(truncateText(doc, bookingId, 50), 187, 272, { align: 'right' });

  doc.setTextColor(...COLORS.gold);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('THANK YOU FOR CHOOSING SANCHARIE', 105, 283, { align: 'center' });
  doc.setTextColor(...COLORS.muted);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  const paymentText = paymentId ? `Payment: ${paymentId} | ` : '';
  doc.text(`${paymentText}${BRAND.website}`, 105, 287, { align: 'center' });

  if (passengerRows.length > previewRows) {
    drawManifestPage(doc, {
      passengers: passengerRows,
      reference,
      pnr,
      fromCity,
      toCity,
      journeyDate,
      departureTime,
      boardingPoint: boardingText,
      droppingPoint: droppingText,
      contactPhone,
      contactEmail,
      brandLogo,
    });
  }

  const fileReference = reference.replace(/[^a-zA-Z0-9]/g, '_');
  return {
    doc,
    fileName: `Sancharie_Boarding_Pass_${fileReference}.pdf`,
  };
};

export const generateTicketPDF = async (ticketData) => {
  try {
    const { doc, fileName } = await createTicketPDF(ticketData);
    doc.save(fileName);
    return true;
  } catch (error) {
    console.error('Error generating PDF ticket:', error);
    return false;
  }
};

export default generateTicketPDF;
