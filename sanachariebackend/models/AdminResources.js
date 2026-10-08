const mongoose = require('mongoose');

const common = { timestamps: true, strict: 'throw', minimize: false };
const routeTargets = { type: [String], default: [] };
const datePair = {
  startDate: { type: Date, required: true, index: true },
  endDate: { type: Date, required: true, index: true, validate: { validator(value) { return !this.startDate || value >= this.startDate; }, message: 'End date must be on or after the start date' } },
  enabled: { type: Boolean, default: true, index: true },
};

const discountSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, default: '', maxlength: 1000 },
  code: { type: String, default: '', trim: true, uppercase: true, maxlength: 40 },
  bannerImage: { type: String, default: '', maxlength: 2000, match: /^(|https:\/\/|\/(?!\/))/ },
  percentage: { type: Number, required: true, min: 0.01, max: 100 },
  maximumDiscount: { type: Number, min: 0, default: null },
  minimumBooking: { type: Number, min: 0, default: 0 },
  usageLimit: { type: Number, min: 0, default: null },
  perUserLimit: { type: Number, min: 0, default: null },
  applicableRoutes: routeTargets,
  ...datePair,
  usageCount: { type: Number, min: 0, default: 0 },
}, common);

const couponSchema = new mongoose.Schema({
  code: { type: String, required: true, trim: true, uppercase: true, unique: true, maxlength: 40 },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  type: { type: String, enum: ['percentage', 'fixed'], required: true },
  value: { type: Number, required: true, min: 0.01, validate: { validator(value) { return this.type !== 'percentage' || value <= 100; }, message: 'Percentage coupon cannot exceed 100' } },
  maximumDiscount: { type: Number, min: 0, default: null },
  minimumBooking: { type: Number, min: 0, default: 0 },
  usageLimit: { type: Number, min: 0, default: null },
  perUserLimit: { type: Number, min: 0, default: null },
  applicableRoutes: routeTargets,
  ...datePair,
  usageCount: { type: Number, min: 0, default: 0 },
}, common);

const offerSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, default: '', maxlength: 1000 },
  type: { type: String, enum: ['first_booking', 'weekend', 'new_user', 'festival', 'route', 'referral', 'payment_method', 'custom'], default: 'custom' },
  discountType: { type: String, enum: ['percentage', 'fixed'], required: true },
  discountValue: { type: Number, required: true, min: 0.01, validate: { validator(value) { return this.discountType !== 'percentage' || value <= 100; }, message: 'Percentage offer cannot exceed 100' } },
  maximumDiscount: { type: Number, min: 0, default: null },
  minimumBooking: { type: Number, min: 0, default: 0 },
  eligibility: { type: mongoose.Schema.Types.Mixed, default: {} },
  usageLimit: { type: Number, min: 0, default: null },
  perUserLimit: { type: Number, min: 0, default: null },
  applicableRoutes: routeTargets,
  bannerImage: { type: String, default: '', maxlength: 2000, match: /^(|https:\/\/|\/(?!\/))/ },
  priority: { type: Number, min: 0, default: 0 },
  ...datePair,
}, common);

const themeSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  festival: { type: String, default: 'custom', maxlength: 80 },
  primaryColor: { type: String, default: '#1746a2', match: /^#[0-9a-fA-F]{6}$/ },
  secondaryColor: { type: String, default: '#f3a712', match: /^#[0-9a-fA-F]{6}$/ },
  backgroundColor: { type: String, default: '#ffffff', match: /^#[0-9a-fA-F]{6}$/ },
  bannerImage: { type: String, default: '', maxlength: 2000 },
  logoImage: { type: String, default: '', maxlength: 2000, match: /^(|https:\/\/|\/(?!\/))/ },
  icon: { type: String, default: '', maxlength: 100 },
  promotionalText: { type: String, default: '', maxlength: 500 },
  ctaText: { type: String, default: '', maxlength: 100 },
  ...datePair,
  priority: { type: Number, min: 0, default: 0 },
}, common);

const bannerSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 160 },
  description: { type: String, default: '', maxlength: 1000 },
  image: { type: String, default: '', maxlength: 2000, match: /^(|https:\/\/|\/(?!\/))/ },
  ctaText: { type: String, default: '', maxlength: 100 },
  ctaUrl: { type: String, default: '', maxlength: 2000, match: /^(|https:\/\/|\/(?!\/))/ },
  kind: { type: String, enum: ['homepage', 'promotion', 'announcement', 'notification'], default: 'homepage' },
  priority: { type: Number, min: 0, default: 0 },
  ...datePair,
}, common);

const settingsSchema = new mongoose.Schema({
  key: { type: String, unique: true, default: 'global' },
  maintenanceMode: { type: Boolean, default: false },
  bookingsEnabled: { type: Boolean, default: true },
  registrationEnabled: { type: Boolean, default: true },
  couponsEnabled: { type: Boolean, default: true },
  discountsEnabled: { type: Boolean, default: true },
  festivalThemeEnabled: { type: Boolean, default: true },
  contactEmail: { type: String, default: '', maxlength: 254 },
  contactPhone: { type: String, default: '', maxlength: 30 },
  supportInformation: { type: String, default: '', maxlength: 2000 },
  announcement: { type: String, default: '', maxlength: 1000 },
}, common);

const appAssetSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, enum: ['app-icon'] },
  contentType: { type: String, required: true, enum: ['image/png', 'image/jpeg', 'image/webp'] },
  image: { type: Buffer, required: true },
}, { timestamps: true });

module.exports = {
  Discount: mongoose.models.Discount || mongoose.model('Discount', discountSchema),
  Coupon: mongoose.models.Coupon || mongoose.model('Coupon', couponSchema),
  Offer: mongoose.models.Offer || mongoose.model('Offer', offerSchema),
  FestivalTheme: mongoose.models.FestivalTheme || mongoose.model('FestivalTheme', themeSchema),
  Banner: mongoose.models.Banner || mongoose.model('Banner', bannerSchema),
  ApplicationSettings: mongoose.models.ApplicationSettings || mongoose.model('ApplicationSettings', settingsSchema),
  AppAsset: mongoose.models.AppAsset || mongoose.model('AppAsset', appAssetSchema),
};
