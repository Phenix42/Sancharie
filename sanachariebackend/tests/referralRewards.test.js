const test = require('node:test');
const assert = require('node:assert/strict');
const { _test } = require('../routes/bus');

test('referral rewards calculate 2% for the referrer and 8% once for the invitee', () => {
  assert.deepEqual(_test.calculateReferralRewards(1250), {
    eligibleAmount: 1250,
    referrerAmount: 25,
    inviteeAmount: 100,
  });
});

test('referral reward calculations round eligible fares and cash amounts to paise', () => {
  assert.deepEqual(_test.calculateReferralRewards(99.995), {
    eligibleAmount: 100,
    referrerAmount: 2,
    inviteeAmount: 8,
  });
});

test('invalid or negative fares produce no referral reward', () => {
  assert.deepEqual(_test.calculateReferralRewards(-10), {
    eligibleAmount: 0,
    referrerAmount: 0,
    inviteeAmount: 0,
  });
  assert.equal(_test.calculateReferralRewards(Number.NaN).eligibleAmount, 0);
});
