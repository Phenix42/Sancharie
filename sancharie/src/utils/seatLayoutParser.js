/**
 * ============================================
 * ETS (eTravelSmart) Seat Layout Parser Utility
 * ============================================
 * 
 * This utility provides helper functions to parse and process bus seat layout data
 * from the ETS API response.
 * 
 * ETS Seat Layout Format:
 * - seats: Array of seat objects with row, column, zIndex, length, width
 * - zIndex: 0 = lower deck, 1 = upper deck
 * - length/width: 1x1 = seater, 1x2 = vertical sleeper, 2x1 = horizontal sleeper
 * 
 * @module utils/seatLayoutParser
 */

/**
 * Parse ETS seat data to standardized format
 * @param {Object} seat - ETS seat object
 * @returns {Object} Standardized seat object
 */
export const parseETSSeat = (seat) => {
  return {
    id: seat.id,
    seatName: seat.id,
    row: seat.row,
    column: seat.column,
    zIndex: seat.zIndex, // 0 = lower, 1 = upper
    length: seat.length,
    width: seat.width,
    fare: parseFloat(seat.fare) || 0,
    totalFareWithTaxes: parseFloat(seat.totalFareWithTaxes) || parseFloat(seat.fare) || 0,
    serviceTaxAmount: parseFloat(seat.serviceTaxAmount) || 0,
    serviceTaxPer: parseFloat(seat.serviceTaxPer) || 0,
    operatorServiceChargeAbsolute: parseFloat(seat.operatorServiceChargeAbsolute) || 0,
    operatorServiceChargePercent: parseFloat(seat.operatorServiceChargePercent) || 0,
    commission: seat.commission,
    available: seat.available === true,
    status: seat.available === true ? 'available' : 'booked',
    ladiesSeat: seat.ladiesSeat === true,
    bookedBy: seat.bookedBy, // 'Male'/'Female' if booked
    ac: seat.ac === true,
    sleeper: seat.sleeper === true,
    isUpper: seat.zIndex === 1,
    // Determine seat type based on dimensions
    seatType: getSeatType(seat.length, seat.width, seat.sleeper),
  };
};

/**
 * Determine seat type based on dimensions
 * @param {number} length - Seat length
 * @param {number} width - Seat width
 * @param {boolean} isSleeper - Is sleeper flag from API
 * @returns {string} Seat type: 'seater', 'sleeper-vertical', 'sleeper-horizontal', 'semi-sleeper'
 */
export const getSeatType = (length, width, isSleeper) => {
  if (length === 1 && width === 1) {
    return isSleeper ? 'semi-sleeper' : 'seater';
  } else if (length === 1 && width === 2) {
    return 'sleeper-vertical'; // Vertical sleeper
  } else if (length === 2 && width === 1) {
    return 'sleeper-horizontal'; // Horizontal sleeper
  }
  return 'seater';
};

/**
 * Parse ETS API seat layout response to organized structure
 * @param {Array} seats - Array of seats from ETS API
 * @returns {Object} Organized seat layout with lower and upper decks
 */
export const parseETSLayout = (seats) => {
  if (!seats || !Array.isArray(seats) || seats.length === 0) {
    return {
      lower: { grid: [], maxRow: 0, maxCol: 0, seats: [] },
      upper: { grid: [], maxRow: 0, maxCol: 0, seats: [] },
      allSeats: [],
    };
  }

  // Parse and separate seats by deck (zIndex)
  const lowerSeats = [];
  const upperSeats = [];

  seats.forEach((seat) => {
    const parsedSeat = parseETSSeat(seat);
    if (parsedSeat.zIndex === 0) {
      lowerSeats.push(parsedSeat);
    } else {
      upperSeats.push(parsedSeat);
    }
  });

  // Sort seats by row, then column
  const sortSeats = (seatArray) => {
    return [...seatArray].sort((a, b) => {
      if (a.row !== b.row) return a.row - b.row;
      return a.column - b.column;
    });
  };

  const sortedLower = sortSeats(lowerSeats);
  const sortedUpper = sortSeats(upperSeats);

  // Create grid structure
  const createGrid = (seatArray) => {
    if (seatArray.length === 0) {
      return { grid: [], maxRow: 0, maxCol: 0, seats: seatArray };
    }

    const maxRow = Math.max(...seatArray.map((s) => s.row)) + 1;
    const maxCol = Math.max(...seatArray.map((s) => s.column)) + 1;

    // Initialize empty grid
    const grid = Array(maxRow)
      .fill(null)
      .map(() => Array(maxCol).fill(null));

    // Place seats in grid
    seatArray.forEach((seat) => {
      grid[seat.row][seat.column] = seat;
    });

    return { grid, maxRow, maxCol, seats: seatArray };
  };

  return {
    lower: createGrid(sortedLower),
    upper: createGrid(sortedUpper),
    allSeats: [...sortedLower, ...sortedUpper],
  };
};

/**
 * Generate seat layout HTML using ETS recommended logic
 * Based on the generateLayout function from ETS documentation
 * 
 * @param {Array} seats - Sorted array of seats (for one deck)
 * @param {number} zIndex - Deck index (0 = lower, 1 = upper)
 * @returns {Object} Layout structure for rendering
 */
export const generateETSLayoutStructure = (seats, zIndex) => {
  if (!seats || seats.length === 0) {
    return { rows: [], pathwayRowIndex: -1 };
  }

  // Group seats by row
  const rowMap = new Map();
  seats.forEach((seat) => {
    if (!rowMap.has(seat.row)) {
      rowMap.set(seat.row, []);
    }
    rowMap.get(seat.row).push(seat);
  });

  // Find pathway (gap in row numbers)
  let pathwayRowIndex = -1;
  const rowIndices = Array.from(rowMap.keys()).sort((a, b) => a - b);
  
  for (let i = 1; i < rowIndices.length; i++) {
    if (rowIndices[i] - rowIndices[i - 1] > 1) {
      pathwayRowIndex = rowIndices[i - 1] + 1;
      break;
    }
  }

  // Get max columns
  const maxCol = Math.max(...seats.map((s) => s.column)) + 1;

  // Build rows array
  const rows = rowIndices.map((rowIndex, idx) => {
    const rowSeats = rowMap.get(rowIndex);
    // Sort by column
    rowSeats.sort((a, b) => a.column - b.column);

    // Fill gaps with null
    const filledRow = Array(maxCol).fill(null);
    rowSeats.forEach((seat) => {
      filledRow[seat.column] = seat;
    });

    return {
      rowIndex,
      seats: filledRow,
      isDriverRow: zIndex === 0 && idx === 0, // First row of lower deck has driver seat
      isPathwayBefore: rowIndex === pathwayRowIndex,
    };
  });

  return { rows, pathwayRowIndex, maxCol };
};

/**
 * Get boarding points based on inventory type
 * According to ETS documentation:
 * - inventoryType 0, 1: Use boarding points from Available Buses response
 * - inventoryType 2, 3, 5, 6: Use boarding points from Bus Layout response
 * 
 * @param {number} inventoryType - Inventory type value
 * @param {Array} searchBoardingPoints - Boarding points from search/available buses
 * @param {Array} layoutBoardingPoints - Boarding points from layout response
 * @returns {Array} Appropriate boarding points array
 */
export const getBoardingPointsByInventoryType = (
  inventoryType,
  searchBoardingPoints,
  layoutBoardingPoints
) => {
  if ([0, 1].includes(inventoryType)) {
    return searchBoardingPoints || [];
  }
  return layoutBoardingPoints || [];
};

/**
 * Get dropping points based on inventory type
 * @param {number} inventoryType - Inventory type value
 * @param {Array} searchDroppingPoints - Dropping points from search/available buses
 * @param {Array} layoutDroppingPoints - Dropping points from layout response
 * @param {string} destinationCity - Destination city as fallback
 * @returns {Array} Appropriate dropping points array
 */
export const getDroppingPointsByInventoryType = (
  inventoryType,
  searchDroppingPoints,
  layoutDroppingPoints,
  destinationCity
) => {
  let points = [];
  
  if ([0, 1].includes(inventoryType)) {
    points = searchDroppingPoints || [];
  } else {
    points = layoutDroppingPoints || [];
  }

  // If no dropping points, use destination city as fallback
  if (points.length === 0 && destinationCity) {
    return [{ id: 'dest', location: destinationCity, time: null }];
  }

  return points;
};

/**
 * Validate ETS seat layout data
 * @param {Array} seats - Seats array from ETS API
 * @returns {Object} Validation result {isValid, errors}
 */
export const validateSeatLayout = (seats) => {
  const errors = [];
  
  if (!seats) {
    errors.push('Seat layout is null or undefined');
    return { isValid: false, errors };
  }
  
  if (!Array.isArray(seats)) {
    errors.push('Seats is not an array');
    return { isValid: false, errors };
  }
  
  if (seats.length === 0) {
    errors.push('No seats found in layout');
    return { isValid: false, errors };
  }
  
  // Validate each seat
  seats.forEach((seat, index) => {
    if (!seat.id) {
      errors.push(`Seat at index ${index} has no id`);
    }
    if (seat.row === undefined || seat.row === null) {
      errors.push(`Seat ${seat.id || index} has no row`);
    }
    if (seat.column === undefined || seat.column === null) {
      errors.push(`Seat ${seat.id || index} has no column`);
    }
    if (typeof seat.available !== 'boolean') {
      errors.push(`Seat ${seat.id || index} has invalid available status`);
    }
  });
  
  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Get seat statistics from ETS layout
 * @param {Array} seats - Array of processed seats
 * @returns {Object} Statistics
 */
export const getSeatStatistics = (seats) => {
  const stats = {
    total: seats.length,
    available: 0,
    booked: 0,
    seater: 0,
    sleeper: 0,
    semiSleeper: 0,
    ladies: 0,
    upper: 0,
    lower: 0,
    ac: 0,
    nonAc: 0,
    priceRange: {
      min: Infinity,
      max: -Infinity,
      average: 0,
    },
  };
  
  let totalPrice = 0;
  
  seats.forEach(seat => {
    if (seat.available || seat.status === 'available') stats.available++;
    else stats.booked++;
    
    if (seat.seatType === 'seater') stats.seater++;
    else if (seat.seatType === 'semi-sleeper') stats.semiSleeper++;
    else stats.sleeper++;
    
    if (seat.ladiesSeat) stats.ladies++;
    if (seat.isUpper || seat.zIndex === 1) stats.upper++;
    else stats.lower++;
    if (seat.ac) stats.ac++;
    else stats.nonAc++;
    
    const price = seat.totalFareWithTaxes || seat.fare || 0;
    totalPrice += price;
    if (price > 0) {
      stats.priceRange.min = Math.min(stats.priceRange.min, price);
      stats.priceRange.max = Math.max(stats.priceRange.max, price);
    }
  });
  
  stats.priceRange.average = stats.total > 0 ? totalPrice / stats.total : 0;
  if (stats.priceRange.min === Infinity) stats.priceRange.min = 0;
  
  return stats;
};

/**
 * Filter seats by criteria
 * @param {Array} seats - Array of seats
 * @param {Object} criteria - Filter criteria
 * @returns {Array} Filtered seats
 */
export const filterSeats = (seats, criteria = {}) => {
  return seats.filter(seat => {
    if (criteria.available !== undefined && seat.available !== criteria.available) return false;
    if (criteria.status && seat.status !== criteria.status) return false;
    if (criteria.seatType && seat.seatType !== criteria.seatType) return false;
    if (criteria.isUpper !== undefined && (seat.isUpper !== criteria.isUpper && seat.zIndex !== (criteria.isUpper ? 1 : 0))) return false;
    if (criteria.ladiesSeat !== undefined && seat.ladiesSeat !== criteria.ladiesSeat) return false;
    if (criteria.ac !== undefined && seat.ac !== criteria.ac) return false;
    if (criteria.sleeper !== undefined && seat.sleeper !== criteria.sleeper) return false;
    if (criteria.minPrice && (seat.totalFareWithTaxes || seat.fare) < criteria.minPrice) return false;
    if (criteria.maxPrice && (seat.totalFareWithTaxes || seat.fare) > criteria.maxPrice) return false;
    return true;
  });
};

/**
 * Sort seats by criteria
 * @param {Array} seats - Array of seats
 * @param {string} sortBy - Sort criteria ('price', 'name', 'row')
 * @param {string} order - Sort order ('asc', 'desc')
 * @returns {Array} Sorted seats
 */
export const sortSeats = (seats, sortBy = 'price', order = 'asc') => {
  const sorted = [...seats];
  
  sorted.sort((a, b) => {
    let comparison = 0;
    
    switch (sortBy) {
      case 'price':
        comparison = (a.totalFareWithTaxes || a.fare || 0) - (b.totalFareWithTaxes || b.fare || 0);
        break;
      case 'name':
        comparison = (a.id || a.seatName || '').localeCompare(b.id || b.seatName || '');
        break;
      case 'row':
        comparison = (a.row - b.row) || (a.column - b.column);
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
  if (!seatName) return '';
  // Return as-is for ETS format (e.g., "D", "L2", "R9")
  return seatName.toString().trim();
};

/**
 * Calculate fare breakdown for ETS seats
 * @param {Array} selectedSeats - Array of selected seat objects
 * @param {Object} rtcFareUpdate - Optional RTC fare update response
 * @returns {Object} Fare breakdown
 */
export const calculateFareBreakdown = (selectedSeats, rtcFareUpdate = null) => {
  // Sum up individual seat fares and taxes
  let baseFare = 0;
  let totalServiceTax = 0;
  let totalOperatorCharge = 0;
  let totalFareWithTaxes = 0;

  selectedSeats.forEach(seat => {
    baseFare += parseFloat(seat.fare) || 0;
    totalServiceTax += parseFloat(seat.serviceTaxAmount) || 0;
    totalOperatorCharge += parseFloat(seat.operatorServiceChargeAbsolute) || 0;
    totalFareWithTaxes += parseFloat(seat.totalFareWithTaxes) || parseFloat(seat.fare) || 0;
  });

  // If RTC fare update is available, use those values
  if (rtcFareUpdate) {
    return {
      baseFare: Math.round(baseFare),
      serviceTax: Math.round(totalServiceTax),
      operatorServiceCharge: Math.round(totalOperatorCharge),
      convenienceFee: rtcFareUpdate.convenienceFee || 0,
      bookingFee: rtcFareUpdate.bookingFee || 0,
      reservationFee: rtcFareUpdate.reservationFee || 0,
      tollFee: rtcFareUpdate.tollFee || 0,
      otherCharges: rtcFareUpdate.otherCharges || 0,
      previousFare: rtcFareUpdate.previousFare,
      totalFare: rtcFareUpdate.updatedFare,
      seatCount: selectedSeats.length,
      perSeatAverage: Math.round(rtcFareUpdate.updatedFare / selectedSeats.length),
    };
  }

  return {
    baseFare: Math.round(baseFare),
    serviceTax: Math.round(totalServiceTax),
    operatorServiceCharge: Math.round(totalOperatorCharge),
    totalFare: Math.round(totalFareWithTaxes),
    seatCount: selectedSeats.length,
    perSeatAverage: selectedSeats.length > 0 ? Math.round(totalFareWithTaxes / selectedSeats.length) : 0,
  };
};

/**
 * Parse cancellation policy from ETS format
 * @param {string|Array} cancellationPolicy - Cancellation policy from API
 * @returns {Array} Parsed cancellation policy array
 */
export const parseCancellationPolicy = (cancellationPolicy) => {
  if (!cancellationPolicy) return [];
  
  // If it's already an array, return it
  if (Array.isArray(cancellationPolicy)) {
    return cancellationPolicy;
  }
  
  // If it's a JSON string, parse it
  if (typeof cancellationPolicy === 'string') {
    try {
      const parsed = JSON.parse(cancellationPolicy);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error('Failed to parse cancellation policy:', e);
      return [];
    }
  }
  
  return [];
};

/**
 * Format cancellation policy for display
 * @param {string|Array} cancellationPolicy - Raw cancellation policy
 * @returns {Array} Formatted policy array for display
 */
export const formatCancellationPolicy = (cancellationPolicy) => {
  const policies = parseCancellationPolicy(cancellationPolicy);
  
  return policies.map(policy => ({
    cutoffHours: policy.cutoffTime,
    refundPercentage: policy.refundInPercentage,
    description: formatCutoffDescription(policy.cutoffTime, policy.refundInPercentage),
  }));
};

/**
 * Format cutoff time description
 * @param {string} cutoffTime - Cutoff time string (e.g., "0-1", "24")
 * @param {string} refundPercentage - Refund percentage
 * @returns {string} Human readable description
 */
const formatCutoffDescription = (cutoffTime, refundPercentage) => {
  if (cutoffTime.includes('-')) {
    const [start, end] = cutoffTime.split('-');
    if (start === '0') {
      return `Cancel within ${end} hour(s) of departure: ${refundPercentage}% refund`;
    }
    return `Cancel ${start}-${end} hours before departure: ${refundPercentage}% refund`;
  }
  return `Cancel more than ${cutoffTime} hours before departure: ${refundPercentage}% refund`;
};

/**
 * Check if bus has amenity
 * @param {Array} busAmenities - Array of amenities from bus data
 * @param {string} amenity - Amenity to check for
 * @returns {boolean} True if bus has the amenity
 */
export const hasAmenity = (busAmenities, amenity) => {
  if (!busAmenities || !Array.isArray(busAmenities)) return false;
  return busAmenities.some(a => 
    a.toLowerCase().includes(amenity.toLowerCase())
  );
};

/**
 * Parse duration in minutes to human readable format
 * @param {number} durationInMins - Duration in minutes
 * @returns {string} Formatted duration (e.g., "9h 44m")
 */
export const formatDuration = (durationInMins) => {
  if (!durationInMins || durationInMins <= 0) return '';
  
  const hours = Math.floor(durationInMins / 60);
  const minutes = durationInMins % 60;
  
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
};

export default {
  parseETSSeat,
  getSeatType,
  parseETSLayout,
  generateETSLayoutStructure,
  getBoardingPointsByInventoryType,
  getDroppingPointsByInventoryType,
  validateSeatLayout,
  getSeatStatistics,
  filterSeats,
  sortSeats,
  formatSeatName,
  calculateFareBreakdown,
  parseCancellationPolicy,
  formatCancellationPolicy,
  hasAmenity,
  formatDuration,
};
