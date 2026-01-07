/**
 * Ticket PDF Generator - Creates downloadable bus tickets
 */

import { jsPDF } from 'jspdf';

/**
 * Generate and download a PDF ticket
 * @param {Object} ticketData - Booking/ticket data
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
      contactEmail = ''
    } = ticketData || {};

    // Create new PDF document
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    
    // ===== HEADER SECTION =====
    // Header background
    doc.setFillColor(156, 118, 53); // Gold/Brown
    doc.rect(0, 0, pageWidth, 40, 'F');

    // Logo/Brand name
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(24);
    doc.text('SANCHARIE', pageWidth / 2, 18, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('E-TICKET / BOOKING CONFIRMATION', pageWidth / 2, 32, { align: 'center' });

    // ===== BOOKING INFO =====
    doc.setFillColor(245, 245, 245);
    doc.rect(0, 40, pageWidth, 25, 'F');

    doc.setTextColor(0, 44, 63);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    
    // Booking ID
    doc.text('BOOKING ID', 20, 50);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text(String(bookingId), 20, 58);

    // PNR (if available)
    if (pnr) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text('PNR', 80, 50);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.text(String(pnr), 80, 58);
    }

    // Status
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('STATUS', pageWidth - 50, 50);
    doc.setTextColor(34, 139, 34); // Green
    doc.setFontSize(11);
    doc.text('CONFIRMED', pageWidth - 50, 58);

    // ===== BUS DETAILS =====
    let yPos = 75;

    doc.setTextColor(0, 44, 63);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(String(busName), 20, yPos);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(100, 100, 100);
    doc.text(String(busType), 20, yPos + 7);

    // ===== JOURNEY DATE =====
    yPos = 95;
    doc.setTextColor(156, 118, 53);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('JOURNEY DATE', 20, yPos);
    
    doc.setTextColor(0, 44, 63);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.text(formatDate(journeyDate), 20, yPos + 7);

    // ===== ROUTE SECTION =====
    yPos = 115;
    
    // FROM Section
    doc.setFillColor(156, 118, 53);
    doc.circle(30, yPos + 5, 3, 'F');
    
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(9);
    doc.text('FROM', 45, yPos);
    
    doc.setTextColor(0, 44, 63);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(String(fromCity), 45, yPos + 8);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(String(departureTime), 45, yPos + 16);
    
    // Boarding point
    const bpText = getBoardingPointText(boardingPoint);
    if (bpText) {
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.text('Boarding: ' + bpText, 45, yPos + 23);
    }

    // Vertical line connecting FROM to TO
    doc.setDrawColor(156, 118, 53);
    doc.setLineWidth(0.5);
    doc.line(30, yPos + 10, 30, yPos + 40);

    // TO Section
    yPos = 160;
    doc.setFillColor(156, 118, 53);
    doc.circle(30, yPos + 5, 3, 'F');
    
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(9);
    doc.text('TO', 45, yPos);
    
    doc.setTextColor(0, 44, 63);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(String(toCity), 45, yPos + 8);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(String(arrivalTime), 45, yPos + 16);
    
    // Dropping point
    const dpText = getBoardingPointText(droppingPoint);
    if (dpText) {
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.text('Dropping: ' + dpText, 45, yPos + 23);
    }

    // ===== SEAT DETAILS =====
    yPos = 195;
    
    // Divider
    doc.setDrawColor(200, 200, 200);
    doc.line(20, yPos, pageWidth - 20, yPos);
    
    yPos += 10;
    doc.setTextColor(156, 118, 53);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('SEAT DETAILS', 20, yPos);
    
    doc.setTextColor(0, 44, 63);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    const seatText = Array.isArray(seats) ? seats.join(', ') : String(seats || 'N/A');
    doc.text('Seats: ' + seatText, 20, yPos + 8);

    // ===== PASSENGERS =====
    if (passengers && passengers.length > 0) {
      yPos += 20;
      doc.setTextColor(156, 118, 53);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('PASSENGERS', 20, yPos);

      // Table header
      yPos += 8;
      doc.setFillColor(245, 245, 245);
      doc.rect(20, yPos - 4, pageWidth - 40, 10, 'F');
      
      doc.setTextColor(100, 100, 100);
      doc.setFontSize(8);
      doc.text('NAME', 25, yPos + 2);
      doc.text('AGE', 100, yPos + 2);
      doc.text('GENDER', 120, yPos + 2);
      doc.text('SEAT', 155, yPos + 2);

      // Passenger rows
      doc.setTextColor(0, 44, 63);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      
      passengers.forEach((passenger, index) => {
        yPos += 12;
        doc.text(String(passenger.name || 'Passenger ' + (index + 1)), 25, yPos);
        doc.text(String(passenger.age || '-'), 100, yPos);
        doc.text(capitalizeFirst(passenger.gender), 120, yPos);
        doc.text(String(passenger.seatNumber || passenger.seatName || seats?.[index] || '-'), 155, yPos);
      });
    }

    // ===== FARE SECTION =====
    yPos += 25;
    
    // Fare box
    doc.setFillColor(250, 250, 250);
    doc.roundedRect(20, yPos, pageWidth - 40, 25, 3, 3, 'F');
    
    doc.setTextColor(156, 118, 53);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('TOTAL FARE', 30, yPos + 10);
    
    doc.setTextColor(0, 44, 63);
    doc.setFontSize(16);
    doc.text('Rs. ' + String(totalFare), 30, yPos + 20);
    
    // Payment ID
    if (paymentId) {
      doc.setTextColor(100, 100, 100);
      doc.setFontSize(8);
      doc.text('Payment ID: ' + String(paymentId), pageWidth - 90, yPos + 15);
    }

    // ===== CONTACT INFO =====
    yPos += 35;
    if (contactPhone || contactEmail) {
      doc.setTextColor(100, 100, 100);
      doc.setFontSize(8);
      if (contactPhone) {
        doc.text('Contact: ' + String(contactPhone), 20, yPos);
      }
      if (contactEmail) {
        doc.text('Email: ' + String(contactEmail), 20, yPos + 5);
      }
    }

    // ===== FOOTER =====
    const footerY = 270;
    
    // Divider
    doc.setDrawColor(200, 200, 200);
    doc.line(20, footerY - 10, pageWidth - 20, footerY - 10);

    // Terms
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(7);
    doc.text('* Please arrive at the boarding point 15 minutes before departure', 20, footerY);
    doc.text('* Carry a valid photo ID for verification', 20, footerY + 4);
    doc.text('* This e-ticket is valid for the journey mentioned above only', 20, footerY + 8);

    // Sancharie footer
    doc.setTextColor(156, 118, 53);
    doc.setFontSize(8);
    doc.text('www.sancharie.com | support@sancharie.com', pageWidth / 2, footerY + 18, { align: 'center' });

    // Save the PDF
    const fileName = 'Sancharie_Ticket_' + String(bookingId).replace(/[^a-zA-Z0-9]/g, '_') + '.pdf';
    doc.save(fileName);
    
    console.log('PDF ticket downloaded:', fileName);
    return true;
  } catch (error) {
    console.error('Error generating PDF:', error);
    alert('Failed to generate PDF ticket. Please try again.');
    return false;
  }
};

/**
 * Get boarding/dropping point text
 */
const getBoardingPointText = (point) => {
  if (!point) return '';
  if (typeof point === 'string') return point;
  return point.name || point.CityPointName || '';
};

/**
 * Format date for display
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
      year: 'numeric'
    });
  } catch {
    return String(dateString);
  }
};

/**
 * Capitalize first letter
 */
const capitalizeFirst = (str) => {
  if (!str) return '-';
  return String(str).charAt(0).toUpperCase() + String(str).slice(1).toLowerCase();
};

export default generateTicketPDF;
