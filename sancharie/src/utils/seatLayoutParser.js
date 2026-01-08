/**
 * Seat Layout Parser Utility
 * 
 * This utility provides helper functions to parse and process bus seat layout data
 * from the API response, including HTML layout parsing if needed.
 */

/**
 * Parse seat type from HTML class names
 * @param {string} className - HTML class attribute value
 * @returns {number} Seat type (1 for seater, 2 for sleeper)
 */
export const parseSeatTypeFromHTML = (className) => {
  // hseat/bhseat = horizontal seat (sleeper)
  // nseat/bseat = normal seat (seater)
  // rseat = reserved seat
  if (className.includes('hseat') || className.includes('bhseat')) {
    return 2; // Sleeper
  }
  return 1; // Seater
};

/**
 * Parse seat status from HTML class names
 * @param {string} className - HTML class attribute value
 * @returns {boolean} true if available, false if booked
 */
export const parseSeatStatusFromHTML = (className) => {
  // bseat/bhseat = blocked/booked seat
  // nseat/hseat = normal/available seat
  return !className.includes('bseat') && !className.includes('bhseat');
};

/**
 * Extract seat information from HTML onclick attribute
 * @param {string} onclickStr - HTML onclick attribute value
 * @returns {object} Seat information
 */
export const parseSeatOnClick = (onclickStr) => {
  // Example: "javascript:AddRemoveSeat(this,'1UC','2456.00')"
  const match = onclickStr.match(/AddRemoveSeat\(this,'([^']+)','([^']+)'\)/);
  
  if (!match) {
    return null;
  }
  
  return {
    seatName: match[1],
    price: parseFloat(match[2]),
  };
};

/**
 * Parse position from HTML style attribute
 * @param {string} styleStr - HTML style attribute value
 * @returns {object} Position {top, left}
 */
export const parseSeatPosition = (styleStr) => {
  const topMatch = styleStr.match(/top:(\d+)px/);
  const leftMatch = styleStr.match(/left:(\d+)px/);
  
  return {
    top: topMatch ? parseInt(topMatch[1], 10) : 0,
    left: leftMatch ? parseInt(leftMatch[1], 10) : 0,
  };
};

/**
 * Parse HTML layout to extract seat data (alternative to SeatLayout)
 * @param {string} htmlLayout - Raw HTML layout string
 * @returns {array} Array of seat objects
 */
export const parseHTMLLayout = (htmlLayout) => {
  const seats = [];
  
  // Create a temporary DOM element to parse HTML
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlLayout, 'text/html');
  
  // Find all seat divs (both upper and lower deck)
  const seatDivs = doc.querySelectorAll('[id^="5001011"]'); // Seat IDs start with this pattern
  
  seatDivs.forEach((seatDiv) => {
    const id = seatDiv.id;
    const className = seatDiv.className;
    const onclick = seatDiv.getAttribute('onclick');
    const style = seatDiv.getAttribute('style');
    
    // Skip if no onclick (not a selectable seat)
    if (!onclick || className.includes('bhseat') || className.includes('bseat')) {
      return;
    }
    
    const seatInfo = parseSeatOnClick(onclick);
    const position = parseSeatPosition(style);
    const seatType = parseSeatTypeFromHTML(className);
    const status = parseSeatStatusFromHTML(className);
    
    if (seatInfo) {
      seats.push({
        id,
        seatName: seatInfo.seatName,
        price: seatInfo.price,
        seatType,
        status: status ? 'available' : 'booked',
        position,
        isUpper: seatInfo.seatName.includes('U'), // Upper deck seats have 'U' in name
        isLadiesSeat: false, // Cannot determine from HTML
        isMalesSeat: false, // Cannot determine from HTML
      });
    }
  });
  
  return seats;
};

/**
 * Calculate grid dimensions from position data
 * @param {array} seats - Array of seat objects with position
 * @returns {object} Grid dimensions {maxRow, maxCol, seatSize}
 */
export const calculateGridDimensions = (seats) => {
  if (seats.length === 0) {
    return { maxRow: 0, maxCol: 0, seatSize: 25 };
  }
  
  const topPositions = [...new Set(seats.map(s => s.position.top))].sort((a, b) => a - b);
  const leftPositions = [...new Set(seats.map(s => s.position.left))].sort((a, b) => a - b);
  
  const seatHeight = topPositions.length > 1 ? topPositions[1] - topPositions[0] : 30;
  const seatWidth = leftPositions.length > 1 ? leftPositions[1] - leftPositions[0] : 25;
  
  return {
    maxRow: topPositions.length,
    maxCol: leftPositions.length,
    seatHeight,
    seatWidth,
  };
};

/**
 * Organize seats into grid based on position
 * @param {array} seats - Array of seat objects with position
 * @returns {object} Grid structure {grid, dimensions}
 */
export const organizeSeatsFromPosition = (seats) => {
  if (seats.length === 0) {
    return { grid: [], dimensions: { maxRow: 0, maxCol: 0 } };
  }
  
  const dimensions = calculateGridDimensions(seats);
  
  // Group seats by row (top position)
  const rowMap = new Map();
  seats.forEach(seat => {
    if (!rowMap.has(seat.position.top)) {
      rowMap.set(seat.position.top, []);
    }
    rowMap.get(seat.position.top).push(seat);
  });
  
  // Convert to 2D array
  const grid = Array.from(rowMap.values()).map(row => {
    // Sort by left position
    return row.sort((a, b) => a.position.left - b.position.left);
  });
  
  return { grid, dimensions };
};

/**
 * Validate seat layout data
 * @param {object} seatLayout - SeatLayout object from API
 * @returns {object} Validation result {isValid, errors}
 */
export const validateSeatLayout = (seatLayout) => {
  const errors = [];
  
  if (!seatLayout) {
    errors.push('Seat layout is null or undefined');
    return { isValid: false, errors };
  }
  
  if (!seatLayout.SeatDetails || !Array.isArray(seatLayout.SeatDetails)) {
    errors.push('SeatDetails is missing or not an array');
  }
  
  if (seatLayout.SeatDetails && seatLayout.SeatDetails.length === 0) {
    errors.push('No seats found in SeatDetails');
  }
  
  // Validate each seat
  seatLayout.SeatDetails?.forEach((row, rowIndex) => {
    if (!Array.isArray(row)) {
      errors.push(`Row ${rowIndex} is not an array`);
      return;
    }
    
    row.forEach((seat, colIndex) => {
      if (!seat.SeatName) {
        errors.push(`Seat at row ${rowIndex}, col ${colIndex} has no SeatName`);
      }
      if (seat.SeatType !== 1 && seat.SeatType !== 2) {
        errors.push(`Invalid SeatType for ${seat.SeatName}: ${seat.SeatType}`);
      }
      if (typeof seat.SeatStatus !== 'boolean') {
        errors.push(`Invalid SeatStatus for ${seat.SeatName}: ${seat.SeatStatus}`);
      }
    });
  });
  
  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Get seat statistics
 * @param {array} seats - Array of processed seats
 * @returns {object} Statistics
 */
export const getSeatStatistics = (seats) => {
  const stats = {
    total: seats.length,
    available: 0,
    booked: 0,
    seater: 0,
    sleeper: 0,
    ladies: 0,
    gents: 0,
    upper: 0,
    lower: 0,
    priceRange: {
      min: Infinity,
      max: -Infinity,
      average: 0,
    },
  };
  
  let totalPrice = 0;
  
  seats.forEach(seat => {
    if (seat.status === 'available') stats.available++;
    if (seat.status === 'booked') stats.booked++;
    if (seat.seatType === 1) stats.seater++;
    if (seat.seatType === 2) stats.sleeper++;
    if (seat.isLadiesSeat) stats.ladies++;
    if (seat.isMalesSeat) stats.gents++;
    if (seat.isUpper) stats.upper++;
    if (!seat.isUpper) stats.lower++;
    
    totalPrice += seat.price;
    stats.priceRange.min = Math.min(stats.priceRange.min, seat.price);
    stats.priceRange.max = Math.max(stats.priceRange.max, seat.price);
  });
  
  stats.priceRange.average = stats.total > 0 ? totalPrice / stats.total : 0;
  
  return stats;
};

/**
 * Filter seats by criteria
 * @param {array} seats - Array of seats
 * @param {object} criteria - Filter criteria
 * @returns {array} Filtered seats
 */
export const filterSeats = (seats, criteria = {}) => {
  return seats.filter(seat => {
    if (criteria.status && seat.status !== criteria.status) return false;
    if (criteria.seatType && seat.seatType !== criteria.seatType) return false;
    if (criteria.isUpper !== undefined && seat.isUpper !== criteria.isUpper) return false;
    if (criteria.isLadiesSeat !== undefined && seat.isLadiesSeat !== criteria.isLadiesSeat) return false;
    if (criteria.isMalesSeat !== undefined && seat.isMalesSeat !== criteria.isMalesSeat) return false;
    if (criteria.minPrice && seat.price < criteria.minPrice) return false;
    if (criteria.maxPrice && seat.price > criteria.maxPrice) return false;
    return true;
  });
};

/**
 * Sort seats by criteria
 * @param {array} seats - Array of seats
 * @param {string} sortBy - Sort criteria ('price', 'name', 'position')
 * @param {string} order - Sort order ('asc', 'desc')
 * @returns {array} Sorted seats
 */
export const sortSeats = (seats, sortBy = 'price', order = 'asc') => {
  const sorted = [...seats];
  
  sorted.sort((a, b) => {
    let comparison = 0;
    
    switch (sortBy) {
      case 'price':
        comparison = a.price - b.price;
        break;
      case 'name':
        comparison = a.seatName.localeCompare(b.seatName);
        break;
      case 'position':
        comparison = (a.rowNo - b.rowNo) || (a.columnNo - b.columnNo);
        break;
      default:
        comparison = 0;
    }
    
    return order === 'desc' ? -comparison : comparison;
  });
  
  return sorted;
};

/**
 * Format seat name for display
 * @param {string} seatName - Raw seat name from API
 * @returns {string} Formatted seat name
 */
export const formatSeatName = (seatName) => {
  // Remove any special characters and format nicely
  return seatName.replace(/[^A-Za-z0-9]/g, '');
};

/**
 * Calculate fare breakdown
 * @param {array} selectedSeats - Array of selected seat objects
 * @param {object} options - Calculation options
 * @returns {object} Fare breakdown
 */
export const calculateFareBreakdown = (selectedSeats, options = {}) => {
  const {
    gstRate = 0.05,
    serviceChargePerSeat = 30,
    discountPercentage = 0,
  } = options;
  
  const baseFare = selectedSeats.reduce((sum, seat) => sum + seat.price, 0);
  const discount = baseFare * (discountPercentage / 100);
  const fareAfterDiscount = baseFare - discount;
  const gst = Math.round(fareAfterDiscount * gstRate);
  const serviceCharge = selectedSeats.length * serviceChargePerSeat;
  const totalFare = fareAfterDiscount + gst + serviceCharge;
  
  return {
    baseFare: Math.round(baseFare),
    discount: Math.round(discount),
    fareAfterDiscount: Math.round(fareAfterDiscount),
    gst,
    serviceCharge,
    totalFare: Math.round(totalFare),
    seatCount: selectedSeats.length,
    perSeatAverage: Math.round(totalFare / selectedSeats.length),
  };
};

export default {
  parseSeatTypeFromHTML,
  parseSeatStatusFromHTML,
  parseSeatOnClick,
  parseSeatPosition,
  parseHTMLLayout,
  calculateGridDimensions,
  organizeSeatsFromPosition,
  validateSeatLayout,
  getSeatStatistics,
  filterSeats,
  sortSeats,
  formatSeatName,
  calculateFareBreakdown,
};
