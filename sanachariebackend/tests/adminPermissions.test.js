const test = require('node:test');
const assert = require('node:assert/strict');
const { ROLE_PERMISSIONS, hasPermission } = require('../services/adminPermissions');

test('support accounts are read-only for customer and booking operations', () => {
  const support = { role: 'support', permissions: [] };
  assert.equal(hasPermission(support, 'users:read'), true);
  assert.equal(hasPermission(support, 'bookings:read'), true);
  assert.equal(hasPermission(support, 'bookings:manage'), false);
  assert.equal(hasPermission(support, 'settings:manage'), false);
});

test('admins can manage operations but not critical settings or other admins', () => {
  const admin = { role: 'admin', permissions: [] };
  assert.equal(hasPermission(admin, 'coupons:manage'), true);
  assert.equal(hasPermission(admin, 'themes:manage'), true);
  assert.equal(hasPermission(admin, 'settings:manage'), false);
  assert.equal(hasPermission(admin, 'admins:manage'), false);
});

test('super admins receive all configured permissions and custom permissions remain extensible', () => {
  const superAdmin = { role: 'super_admin', permissions: [] };
  assert.equal(hasPermission(superAdmin, 'admins:manage'), true);
  assert.equal(ROLE_PERMISSIONS.super_admin.includes('audit:read'), true);
  assert.equal(hasPermission({ role: 'support', permissions: ['future:permission'] }, 'future:permission'), true);
});
