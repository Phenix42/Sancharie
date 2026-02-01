/**
 * ============================================
 * TICKET PDF GENERATOR
 * ============================================
 * 
 * Client-side PDF generation for bus tickets.
 * Uses jsPDF library to create downloadable tickets.
 * 
 * @module utils/ticketGenerator
 */

import { jsPDF } from 'jspdf';

// ============================================
// CONFIGURATION
// ============================================

const BRAND = {
  name: 'SANCHARIE',
  color: { r: 156, g: 118, b: 53 }, // Gold/Brown
  website: 'www.sancharie.com',
  email: 'support@sancharie.com',
};

const COLORS = {
  primary: [156, 118, 53],      // Brand gold
  dark: [0, 44, 63],            // Dark text
  muted: [100, 100, 100],       // Secondary text
  light: [245, 245, 245],       // Light background
  success: [34, 139, 34],       // Green
  white: [255, 255, 255],
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Format date for display
 * @param {string|Date} dateString - Date to format
 * @returns {string} Formatted date
 */
const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return String(dateString);
    return date.toLocaleDateString('en-IN', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return String(dateString);
  }
};

/**
 * Get boarding/dropping point text
 * @param {Object|string} point - Point data
 * @returns {string} Point name
 */
const getPointText = (point) => {
  if (!point) return '';
  if (typeof point === 'string') return point;
  return point.name || point.CityPointName || '';
};

/**
 * Capitalize first letter
 * @param {string} str - String to capitalize
 * @returns {string} Capitalized string
 */
const capitalize = (str) => {
  if (!str) return '-';
  return String(str).charAt(0).toUpperCase() + String(str).slice(1).toLowerCase();
};

/**
 * Sanitize string for PDF
 * @param {*} value - Value to sanitize
 * @returns {string} Safe string
 */
const safeString = (value) => {
  if (value === null || value === undefined) return 'N/A';
  return String(value);
};

// ============================================
// PDF GENERATOR
// ============================================

/**
 * Generate and download a PDF ticket
 * @param {Object} ticketData - Booking/ticket data
 * @returns {boolean} Success status
 */
export const generateTicketPDF = (ticketData) => {
  try {
    const {
      bookingId = 'N/A',
      pnr = '',
      busName = 'Bus Service',
      busType = 'AC Sleeper',
      fromCity = 'Origin',
      toCity = 'Destination',
      journeyDate,
      boardingPoint,
      droppingPoint,
      departureTime = '',
      arrivalTime = '',
      seats = [],
      passengers = [],
      totalFare = 0,
      paymentId = '',
      contactPhone = '',
      contactEmail = '',
    } = ticketData || {};

    // Create PDF document
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = doc.internal.pageSize.getWidth();

    // ===== HEADER =====
    doc.setFillColor(...COLORS.primary);
    doc.rect(0, 0, pageWidth, 40, 'F');

    doc.setTextColor(...COLORS.white);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(24);
    doc.text(BRAND.name, pageWidth / 2, 18, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('E-TICKET / BOOKING CONFIRMATION', pageWidth / 2, 32, { align: 'center' });

    // ===== BOOKING INFO BAR =====
    doc.setFillColor(...COLORS.light);
    doc.rect(0, 40, pageWidth, 25, 'F');

    doc.setTextColor(...COLORS.dark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);

    // Booking ID
    doc.text('BOOKING ID', 20, 50);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text(safeString(bookingId), 20, 58);

    // PNR
    if (pnr) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text('PNR', 80, 50);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.text(safeString(pnr), 80, 58);
    }

    // Status
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('STATUS', pageWidth - 50, 50);
    doc.setTextColor(...COLORS.success);
    doc.setFontSize(11);
    doc.text('CONFIRMED', pageWidth - 50, 58);

    // ===== BUS DETAILS =====
    let yPos = 75;

    doc.setTextColor(...COLORS.dark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(safeString(busName), 20, yPos);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.muted);
    doc.text(safeString(busType), 20, yPos + 7);

    // ===== JOURNEY DATE =====
    yPos = 95;
    doc.setTextColor(...COLORS.primary);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('JOURNEY DATE', 20, yPos);

    doc.setTextColor(...COLORS.dark);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.text(formatDate(journeyDate), 20, yPos + 7);

    // ===== ROUTE SECTION =====
    yPos = 115;

    // FROM
    doc.setFillColor(...COLORS.primary);
    doc.circle(30, yPos + 5, 3, 'F');

    doc.setTextColor(...COLORS.muted);
    doc.setFontSize(9);
    doc.text('FROM', 45, yPos);

    doc.setTextColor(...COLORS.dark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(safeString(fromCity), 45, yPos + 8);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(safeString(departureTime), 45, yPos + 16);

    const bpText = getPointText(boardingPoint);
    if (bpText) {
      doc.setFontSize(9);
      doc.setTextColor(...COLORS.muted);
      doc.text('Boarding: ' + bpText, 45, yPos + 23);
    }

    // Connecting line
    doc.setDrawColor(...COLORS.primary);
    doc.setLineWidth(0.5);
    doc.line(30, yPos + 10, 30, yPos + 40);

    // TO
    yPos = 160;
    doc.setFillColor(...COLORS.primary);
    doc.circle(30, yPos + 5, 3, 'F');

    doc.setTextColor(...COLORS.muted);
    doc.setFontSize(9);
    doc.text('TO', 45, yPos);

    doc.setTextColor(...COLORS.dark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(safeString(toCity), 45, yPos + 8);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(safeString(arrivalTime), 45, yPos + 16);

    const dpText = getPointText(droppingPoint);
    if (dpText) {
      doc.setFontSize(9);
      doc.setTextColor(...COLORS.muted);
      doc.text('Dropping: ' + dpText, 45, yPos + 23);
    }

    // ===== SEAT DETAILS =====
    yPos = 195;

    doc.setDrawColor(200, 200, 200);
    doc.line(20, yPos, pageWidth - 20, yPos);

    yPos += 10;
    doc.setTextColor(...COLORS.primary);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('SEAT DETAILS', 20, yPos);

    doc.setTextColor(...COLORS.dark);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    const seatText = Array.isArray(seats) ? seats.join(', ') : safeString(seats);
    doc.text('Seats: ' + seatText, 20, yPos + 8);

    // ===== PASSENGERS =====
    if (passengers && passengers.length > 0) {
      yPos += 20;
      doc.setTextColor(...COLORS.primary);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('PASSENGERS', 20, yPos);

      // Table header
      yPos += 8;
      doc.setFillColor(...COLORS.light);
      doc.rect(20, yPos - 4, pageWidth - 40, 10, 'F');

      doc.setTextColor(...COLORS.muted);
      doc.setFontSize(8);
      doc.text('NAME', 25, yPos + 2);
      doc.text('AGE', 100, yPos + 2);
      doc.text('GENDER', 120, yPos + 2);
      doc.text('SEAT', 155, yPos + 2);

      // Passenger rows
      doc.setTextColor(...COLORS.dark);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);

      passengers.forEach((passenger, index) => {
        yPos += 12;
        doc.text(safeString(passenger.name || `Passenger ${index + 1}`), 25, yPos);
        doc.text(safeString(passenger.age || '-'), 100, yPos);
        doc.text(capitalize(passenger.gender), 120, yPos);
        doc.text(safeString(passenger.seatNumber || passenger.seatName || seats?.[index] || '-'), 155, yPos);
      });
    }

    // ===== FARE SECTION =====
    yPos += 25;

    doc.setFillColor(250, 250, 250);
    doc.roundedRect(20, yPos, pageWidth - 40, 25, 3, 3, 'F');

    doc.setTextColor(...COLORS.primary);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('TOTAL FARE', 30, yPos + 10);

    doc.setTextColor(...COLORS.dark);
    doc.setFontSize(16);
    doc.text('Rs. ' + safeString(totalFare), 30, yPos + 20);

    if (paymentId) {
      doc.setTextColor(...COLORS.muted);
      doc.setFontSize(8);
      doc.text('Payment ID: ' + safeString(paymentId), pageWidth - 90, yPos + 15);
    }

    // ===== CONTACT INFO =====
    yPos += 35;
    if (contactPhone || contactEmail) {
      doc.setTextColor(...COLORS.muted);
      doc.setFontSize(8);
      if (contactPhone) doc.text('Contact: ' + safeString(contactPhone), 20, yPos);
      if (contactEmail) doc.text('Email: ' + safeString(contactEmail), 20, yPos + 5);
    }

    // ===== FOOTER =====
    const footerY = 270;

    doc.setDrawColor(200, 200, 200);
    doc.line(20, footerY - 10, pageWidth - 20, footerY - 10);

    doc.setTextColor(...COLORS.muted);
    doc.setFontSize(7);
    doc.text('* Please arrive at the boarding point 15 minutes before departure', 20, footerY);
    doc.text('* Carry a valid photo ID for verification', 20, footerY + 4);
    doc.text('* This e-ticket is valid for the journey mentioned above only', 20, footerY + 8);

    doc.setTextColor(...COLORS.primary);
    doc.setFontSize(8);
    doc.text(`${BRAND.website} | ${BRAND.email}`, pageWidth / 2, footerY + 18, { align: 'center' });

    // Save PDF
    const fileName = `Sancharie_Ticket_${safeString(bookingId).replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
    doc.save(fileName);

    console.log('✅ PDF ticket downloaded:', fileName);
    return true;
  } catch (error) {
    console.error('❌ Error generating PDF:', error);
    return false;
  }
};

export default generateTicketPDF;
