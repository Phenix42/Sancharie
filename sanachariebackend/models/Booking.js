/**
 * Booking Model - MongoDB Schema
 * Stores bus booking information
 */

const mongoose = require('mongoose');

const passengerSchema = new mongoose.Schema({
  name: { type: String, default: 'Passenger' },
  age: { type: Number, default: 25 },
  gender: { type: String, enum: ['male', 'female', 'other'], default: 'male' },
  seatNumber: { type: String, default: '' }
});

const bookingSchema = new mongoose.Schema({
  // Reference to user
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  userPhone: {
    type: String,
    required: true,
    index: true
  },
  
  // Booking reference
  bookingId: {
    type: String,
    unique: true,
    default: function() {
      return 'SAN' + Date.now() + Math.random().toString(36).substr(2, 4).toUpperCase();
    }
  },
  pnr: {
    type: String,
    default: ''
  },
  
  // Bus details
  busName: { type: String, required: true },
  busType: { type: String, required: true },
  busNumber: { type: String, default: '' },
  
  // Journey details
  source: { type: String, required: true },
  destination: { type: String, required: true },
  fromCity: { type: String, default: '' },
  toCity: { type: String, default: '' },
  journeyDate: { type: Date, required: true },
  departureTime: { type: String, default: '' },
  arrivalTime: { type: String, default: '' },
  
  // Boarding point (can be string or object)
  boardingPoint: {
    type: mongoose.Schema.Types.Mixed,
    default: ''
  },
  
  // Dropping point (can be string or object)
  droppingPoint: {
    type: mongoose.Schema.Types.Mixed,
    default: ''
  },
  
  // Seat details
  seats: [String],
  selectedSeats: [String],
  passengers: [passengerSchema],
  
  // External booking reference
  externalBookingId: { type: String, default: '' },
  ticketNo: { type: String, default: '' },
  
  // Fare details
  baseFare: { type: Number, required: true },
  serviceTax: { type: Number, default: 0 },
  totalFare: { type: Number, required: true },
  
  // Payment details
  paymentId: { type: String, default: '' },
  paymentStatus: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'refunded'],
    default: 'pending'
  },
  paymentMethod: { type: String, default: '' },
  
  // Booking status
  status: {
    type: String,
    enum: ['confirmed', 'cancelled', 'pending', 'completed'],
    default: 'pending'
  },
  
  // Cancellation details
  cancellationReason: { type: String, default: '' },
  refundAmount: { type: Number, default: 0 },
  refundStatus: { type: String, default: '' },
  
  // Timestamps
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Update timestamp on save
bookingSchema.pre('save', async function() {
  this.updatedAt = new Date();
});

// Index for efficient queries
bookingSchema.index({ userId: 1, createdAt: -1 });
bookingSchema.index({ userPhone: 1, createdAt: -1 });

module.exports = mongoose.model('Booking', bookingSchema);
