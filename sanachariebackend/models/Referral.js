const mongoose = require('mongoose');

const referralSchema = new mongoose.Schema({
  referrerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  referredUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  code: { type: String, required: true, uppercase: true, trim: true, maxlength: 40 },
  status: { type: String, enum: ['joined', 'qualified', 'rewarded'], default: 'joined', index: true },
  firstBookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },
  bookingAmount: { type: Number, default: 0, min: 0 },
  rewardPercentage: { type: Number, default: 0, min: 0, max: 100 },
  rewardAmount: { type: Number, default: 0, min: 0 },
  qualifiedAt: { type: Date, default: null },
  rewardedAt: { type: Date, default: null },
}, { timestamps: true, strict: 'throw' });

referralSchema.index({ referrerUserId: 1, createdAt: -1 });

module.exports = mongoose.models.Referral || mongoose.model('Referral', referralSchema);
