const mongoose = require('mongoose');

const pushSubscriptionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  endpoint: { type: String, required: true, unique: true, maxlength: 2048 },
  keys: {
    p256dh: { type: String, required: true, maxlength: 200 },
    auth: { type: String, required: true, maxlength: 100 },
  },
  expirationTime: { type: Number, default: null },
}, { timestamps: true, strict: 'throw' });

module.exports = mongoose.models.PushSubscription || mongoose.model('PushSubscription', pushSubscriptionSchema);
