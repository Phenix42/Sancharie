// Bus Booking API Service
// Base URL should be configured in environment variables

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "https://api.bdsd.technology/api/";

// API Authentication credentials - configure in environment variables
const API_USERNAME = import.meta.env.VITE_API_USERNAME || "TTS";
const API_PASSWORD = import.meta.env.VITE_API_PASSWORD || "TTS@@!@001";

// Common headers for all API requests
const getHeaders = () => ({
  "Content-Type": "application/json",
  "Accept-Encoding": "gzip, deflate, br",
  "Connection": "keep-alive",
  "Username": API_USERNAME,
  "Password": API_PASSWORD,
});

// Helper function to get user IP (you can replace with actual IP detection)
const getUserIp = () => {
  return "103.209.223.52"; // Default IP, should be dynamically fetched in production
};

/**
 * 1. Search Buses
 * POST /busservice/rest/search
 */
export const searchBuses = async (originId, destinationId, dateOfJourney) => {
  try {
    const response = await fetch(`${BASE_URL}/busservice/rest/search`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        UserIp: getUserIp(),
        DateOfJourney: dateOfJourney,
        OriginId: String(originId),
        DestinationId: String(destinationId),
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    console.log("Search API full response:", JSON.stringify(data, null, 2));
    
    // ErrorCode 1 means "no result found" - return empty results, not an error
    if (data.Error && data.Error.ErrorCode !== 0 && data.Error.ErrorCode !== 1) {
      throw new Error(data.Error.ErrorMessage || "Search failed");
    }

    return {
      searchTokenId: data.SearchTokenId || data.TokenId || data.Token,
      results: data.Result || [],
      userIp: data.UserIp,
    };
  } catch (error) {
    console.error("Search buses error:", error);
    throw error;
  }
};

/**
 * 2. Get Seat Layout
 * POST /busservice/rest/seatlayout
 */
export const getSeatLayout = async (searchTokenId, resultIndex) => {
  const requestBody = {
    UserIp: getUserIp(),
    SearchTokenId: searchTokenId,
    ResultIndex: resultIndex,
  };
  console.log("getSeatLayout request:", requestBody);
  
  try {
    const response = await fetch(`${BASE_URL}/busservice/rest/seatlayout`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.Error && data.Error.ErrorCode !== 0) {
      throw new Error(data.Error.ErrorMessage || "Failed to get seat layout");
    }

    return {
      availableSeats: data.Result?.AvailableSeats,
      htmlLayout: data.Result?.HTMLLayout,
      seatLayout: data.Result?.SeatLayout,
      searchTokenId: data.SearchTokenId,
    };
  } catch (error) {
    console.error("Get seat layout error:", error);
    throw error;
  }
};

/**
 * 3. Get Boarding Points
 * POST /busservice/rest/boardingpoint
 */
export const getBoardingPoints = async (searchTokenId, resultIndex) => {
  const requestBody = {
    UserIp: getUserIp(),
    SearchTokenId: searchTokenId,
    ResultIndex: resultIndex,
  };
  console.log("getBoardingPoints request:", requestBody);
  
  try {
    const response = await fetch(`${BASE_URL}/busservice/rest/boardingpoint`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.Error && data.Error.ErrorCode !== 0) {
      throw new Error(data.Error.ErrorMessage || "Failed to get boarding points");
    }

    return {
      boardingPoints: data.Result?.BoardingPointsDetails || [],
      droppingPoints: data.Result?.DroppingPointsDetails || [],
      searchTokenId: data.SearchTokenId,
    };
  } catch (error) {
    console.error("Get boarding points error:", error);
    throw error;
  }
};

/**
 * 4. Block Seat
 * POST /busservice/rest/blockseat
 */
export const blockSeat = async (
  searchTokenId,
  resultIndex,
  boardingPointId,
  droppingPointId,
  passengers
) => {
  try {
    const response = await fetch(`${BASE_URL}/busservice/rest/blockseat`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        UserIp: getUserIp(),
        SearchTokenId: searchTokenId,
        ResultIndex: resultIndex,
        BoardingPointId: boardingPointId,
        DroppingPointId: droppingPointId,
          Passenger: passengers.map((p, index) => ({
          LeadPassenger: index === 0,
          Title: p.gender === "male" ? "Mr" : p.gender === "female" ? "Ms" : "Mr",
          FirstName: p.name.split(" ")[0] || p.name,
            LastName: p.name.split(" ").slice(1).join(" ") || p.name.split(" ")[0] || "",
          Email: p.email || "",
          Phoneno: p.phone || "",
          Gender: p.gender === "male" ? "1" : "2",
          IdType: p.idType || null,
          IdNumber: p.idNumber || null,
          Address: p.address || "",
          Age: String(p.age || "25"),
          SeatName: p.seatName,
        })),
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.Error && data.Error.ErrorCode !== 0) {
      throw new Error(data.Error.ErrorMessage || "Failed to block seat");
    }

    return {
      isPriceChanged: data.Result?.IsPriceChanged,
      arrivalTime: data.Result?.ArrivalTime,
      busType: data.Result?.BusType,
      departureTime: data.Result?.DepartureTime,
      travelName: data.Result?.TravelName,
      boardingPointDetails: data.Result?.BoardingPointdetails,
      cancelPolicy: data.Result?.CancelPolicy || [],
      passengers: data.Result?.Passenger || [],
      searchTokenId: data.SearchTokenId,
    };
  } catch (error) {
    console.error("Block seat error:", error);
    throw error;
  }
};

/**
 * 5. Book Ticket
 * POST /busservice/rest/book
 */
export const bookTicket = async (
  searchTokenId,
  resultIndex,
  boardingPointId,
  droppingPointId,
  passengers
) => {
  try {
    const response = await fetch(`${BASE_URL}/busservice/rest/book`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        UserIp: getUserIp(),
        SearchTokenId: searchTokenId,
        ResultIndex: resultIndex,
        BoardingPointId: boardingPointId,
        DroppingPointId: droppingPointId,
        Passenger: passengers.map((p, index) => ({
          LeadPassenger: index === 0,
          Title: p.gender === "male" ? "Mr" : p.gender === "female" ? "Ms" : "Mr",
          FirstName: p.name.split(" ")[0] || p.name,
          LastName: p.name.split(" ").slice(1).join(" ") || "",
          Email: p.email || "",
          Phoneno: p.phone || "",
          Gender: p.gender === "male" ? "1" : "2",
          IdType: p.idType || null,
          IdNumber: p.idNumber || null,
          Address: p.address || "",
          Age: String(p.age || "25"),
          SeatName: p.seatName,
        })),
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.Error && data.Error.ErrorCode !== 0) {
      throw new Error(data.Error.ErrorMessage || "Booking failed");
    }

    return {
      bookingStatus: data.Result?.BookingStatus,
      invoiceAmount: data.Result?.InvoiceAmount,
      invoiceNumber: data.Result?.InvoiceNumber,
      bookingId: data.Result?.BookingID,
      ticketNo: data.Result?.TicketNo,
      travelOperatorPNR: data.Result?.TravelOperatorPNR,
      searchTokenId: data.SearchTokenId,
    };
  } catch (error) {
    console.error("Book ticket error:", error);
    throw error;
  }
};

/**
 * 6. Get Booking Details
 * POST /busservice/rest/getbookingdetail
 */
export const getBookingDetails = async (searchTokenId, bookingId) => {
  try {
    const response = await fetch(`${BASE_URL}/busservice/rest/getbookingdetail`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        UserIp: getUserIp(),
        SearchTokenId: searchTokenId,
        BookingId: bookingId,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.Error && data.Error.ErrorCode !== 0) {
      throw new Error(data.Error.ErrorMessage || "Failed to get booking details");
    }

    return {
      bookingId: data.Result?.BookingId,
      ticketNo: data.Result?.TicketNo,
      travelOperatorPNR: data.Result?.TravelOperatorPNR,
      origin: data.Result?.Origin,
      originId: data.Result?.OriginID,
      destination: data.Result?.Destination,
      destinationId: data.Result?.DestinationId,
      dateOfJourney: data.Result?.DateOfJourney,
      noOfSeats: data.Result?.NoOfSeats,
      departureTime: data.Result?.DepartureTime,
      arrivalTime: data.Result?.ArrivalTime,
      duration: data.Result?.Duration,
      busType: data.Result?.BusType,
      travelName: data.Result?.TravelName,
      passengers: data.Result?.Passenger || [],
      boardingPointDetails: data.Result?.BoardingPointdetails,
      droppingPointDetails: data.Result?.DroppingPointdetails,
      cancelPolicy: data.Result?.CancelPolicy || [],
      price: data.Result?.Price,
      invoiceNumber: data.Result?.InvoiceNumber,
      invoiceAmount: data.Result?.InvoiceAmount,
      invoiceCreatedOn: data.Result?.InvoiceCreatedOn,
    };
  } catch (error) {
    console.error("Get booking details error:", error);
    throw error;
  }
};

/**
 * 7. Cancel Booking
 * POST /busservice/rest/cancelrequest
 */
export const cancelBooking = async (searchTokenId, bookingId, seatId, remarks = "Cancel Bus Ticket") => {
  try {
    const response = await fetch(`${BASE_URL}/busservice/rest/cancelrequest`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        UserIp: getUserIp(),
        SearchTokenId: searchTokenId,
        BookingId: bookingId,
        SeatId: String(seatId),
        Remarks: remarks,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    // Check for cancellation error
    if (data.SendChangeRequestResult?.Error?.ErrorCode !== 0) {
      throw new Error(
        data.SendChangeRequestResult?.Error?.ErrorMessage || "Cancellation failed"
      );
    }

    return {
      responseStatus: data.SendChangeRequestResult?.ResponseStatus,
      traceId: data.SendChangeRequestResult?.TraceId,
    };
  } catch (error) {
    console.error("Cancel booking error:", error);
    throw error;
  }
};

// Export all functions
export default {
  searchBuses,
  getSeatLayout,
  getBoardingPoints,
  blockSeat,
  bookTicket,
  getBookingDetails,
  cancelBooking,
};
