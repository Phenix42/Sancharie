const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { Discount, Coupon, Offer, FestivalTheme, Banner, ApplicationSettings, AppAsset } = require('../models/AdminResources');

const dates = { startDate: '2026-10-15T00:00:00Z', endDate: '2026-10-25T00:00:00Z' };

test('discount schema rejects out-of-range percentage and inverted dates', () => {
  const badPercentage = new Discount({ name: 'Too much', percentage: 101, ...dates });
  assert.ok(badPercentage.validateSync().errors.percentage);
  const inverted = new Discount({ name: 'Inverted', percentage: 10, startDate: dates.endDate, endDate: dates.startDate });
  assert.ok(inverted.validateSync().errors.endDate);
});

test('coupon schema can create an empty draft with an automatically generated code', () => {
  const coupon = new Coupon({ name: 'Incomplete', ...dates });
  assert.equal(coupon.validateSync(), undefined);
  assert.match(coupon.code, /^SAN[A-F0-9]{10}$/);
  assert.equal(coupon.type, 'percentage');
});

test('content records allow missing names, values, and schedules as drafts', () => {
  const discount = new Discount({});
  const offer = new Offer({});
  const theme = new FestivalTheme({});
  const banner = new Banner({});
  for (const record of [discount, offer, theme, banner]) {
    assert.equal(record.validateSync(), undefined);
    assert.equal(record.startDate, undefined);
    assert.equal(record.endDate, undefined);
  }
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

test('festival theme colors can use the customer portal defaults', () => {
  const theme = new FestivalTheme({ name: 'Default colors', primaryColor: '', secondaryColor: '', backgroundColor: '', ...dates });
  assert.equal(theme.validateSync(), undefined);
});

test('homepage hero text and color overrides are not part of application settings', () => {
  assert.throws(
    () => new ApplicationSettings({ heroTitleLine1: 'Overridden title', heroTitleColor: '#123456' }),
    /not in schema/,
  );
});

test('discount banner uploads use a supported asset key', () => {
  const asset = new AppAsset({
    key: `discount-${new mongoose.Types.ObjectId()}-bannerImage`,
    contentType: 'image/png',
    image: Buffer.from('image'),
  });
  assert.equal(asset.validateSync()?.errors.key, undefined);
});
