const test = require('node:test');
const assert = require('node:assert/strict');
const { Discount, Coupon, Offer, FestivalTheme } = require('../models/AdminResources');

const dates = { startDate: '2026-10-15T00:00:00Z', endDate: '2026-10-25T00:00:00Z' };

test('discount schema rejects out-of-range percentage and inverted dates', () => {
  const badPercentage = new Discount({ name: 'Too much', percentage: 101, ...dates });
  assert.ok(badPercentage.validateSync().errors.percentage);
  const inverted = new Discount({ name: 'Inverted', percentage: 10, startDate: dates.endDate, endDate: dates.startDate });
  assert.ok(inverted.validateSync().errors.endDate);
});

test('coupon schema requires type/value and a code', () => {
  const coupon = new Coupon({ name: 'Incomplete', ...dates });
  const errors = coupon.validateSync().errors;
  assert.ok(errors.code);
  assert.ok(errors.type);
  assert.ok(errors.value);
});

test('percentage coupons and offers cannot exceed 100 percent', async () => {
  const coupon = new Coupon({ code: 'TOOMUCH', name: 'Too much', type: 'percentage', value: 120, ...dates });
  const offer = new Offer({ name: 'Too much', discountType: 'percentage', discountValue: 120, ...dates });
  await assert.rejects(coupon.validate(), /Percentage coupon cannot exceed 100/);
  await assert.rejects(offer.validate(), /Percentage offer cannot exceed 100/);
});

test('festival theme colors must be valid six-digit hex colors', () => {
  const theme = new FestivalTheme({ name: 'Festival', primaryColor: 'orange', ...dates });
  assert.ok(theme.validateSync().errors.primaryColor);
});
