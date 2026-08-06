/**
 * Booking Model - MongoDB Schema
 * Stores the complete lifecycle of a travel booking attempt.
 */

const mongoose = require('mongoose');

const passengerSchema = new mongoose.Schema({
  name: { type: String, default: 'Passenger' },
  age: { type: Number, default: 25 },
  gender: { type: String, enum: ['male', 'female', 'other'], default: 'male' },
  seatNumber: { type: String, default: '' }
});

const selectedSeatDetailSchema = new mongoose.Schema({
  seatNumber: { type: String, default: '', maxlength: 50 },
  row: { type: Number, min: 0, max: 100, default: null },
  column: { type: Number, min: 0, max: 100, default: null },
  zIndex: { type: Number, enum: [0, 1], default: 0 }
}, { _id: false });

const seatLayoutItemSchema = new mongoose.Schema({
  seatNumber: { type: String, required: true, maxlength: 50 },
  row: { type: Number, min: 0, max: 100, required: true },
  column: { type: Number, min: 0, max: 100, required: true },
  zIndex: { type: Number, enum: [0, 1], default: 0 },
  length: { type: Number, min: 1, max: 4, default: 1 },
  width: { type: Number, min: 1, max: 4, default: 1 },
  sleeper: { type: Boolean, default: false },
  available: { type: Boolean, default: false },
  ladiesSeat: { type: Boolean, default: false },
  malesSeat: { type: Boolean, default: false },
  reservedForSocialDistancing: { type: Boolean, default: false }
}, { _id: false });

const statusHistorySchema = new mongoose.Schema({
  status: {
    type: String,
    enum: ['confirmed', 'cancelled', 'pending', 'completed', 'failed'],
    required: true
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'refunded'],
    default: 'pending'
  },
  stage: { type: String, default: '' },
  message: { type: String, default: '', maxlength: 500 },
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

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

  // A browser-generated idempotency key. It lets a retried request return the
  // original attempt instead of adding a duplicate dashboard entry.
  clientReference: {
    type: String,
    trim: true,
    maxlength: 100
  },
  serviceType: {
    type: String,
    enum: ['bus', 'flight', 'hotel'],
    default: 'bus'
  },
  // SHA-256 of the provider block/search reference. The raw supplier token is
  // never persisted, but this hash lets reconciliation join provider reports,
  // payments, and the original pending booking safely.
  providerReferenceHash: { type: String, default: '', index: true },
  
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
  seatDetails: { type: [selectedSeatDetailSchema], default: [] },
  seatLayout: { type: [seatLayoutItemSchema], default: [] },
  hasUpperDeck: { type: Boolean, default: false },
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
  paymentOrderId: { type: String, default: '' },
  relatedPaymentIds: { type: [String], default: [] },
  paymentIssue: {
    type: String,
    enum: ['', 'duplicate_payment', 'amount_mismatch'],
    default: ''
  },
  paymentNote: { type: String, default: '', maxlength: 500 },
  paymentStatus: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'refunded'],
    default: 'pending'
  },
  paymentMethod: { type: String, default: '' },
  
  // Booking status
  status: {
    type: String,
    enum: ['confirmed', 'cancelled', 'pending', 'completed', 'failed'],
    default: 'pending'
  },

  // Lifecycle diagnostics make partially-completed bookings visible and
  // actionable without exposing provider secrets.
  failureStage: { type: String, default: '' },
  failureReason: { type: String, default: '', maxlength: 500 },
  providerStatus: { type: String, default: '' },
  reconciliationSource: { type: String, default: '' },
  lastReconciledAt: { type: Date },
  statusHistory: { type: [statusHistorySchema], default: [] },
  confirmedAt: { type: Date },
  failedAt: { type: Date },
  
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
bookingSchema.index(
  { userId: 1, clientReference: 1 },
  {
    unique: true,
    partialFilterExpression: { clientReference: { $exists: true } }
  }
);

module.exports = mongoose.model('Booking', bookingSchema);
