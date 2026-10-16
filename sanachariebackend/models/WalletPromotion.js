const mongoose = require('mongoose');

const walletPromotionSchema = new mongoose.Schema({
  rewardAmount: { type: Number, required: true, min: 0.01, max: 50000 },
  minimumBookingAmount: { type: Number, required: true, min: 0, max: 500000 },
  recipientLimit: { type: Number, required: true, min: 1, max: 100000 },
  claimedCount: { type: Number, default: 0, min: 0 },
  claimedUserIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  enabled: { type: Boolean, default: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
}, { timestamps: true });

walletPromotionSchema.index({ createdAt: -1 });
module.exports = mongoose.model('WalletPromotion', walletPromotionSchema);
