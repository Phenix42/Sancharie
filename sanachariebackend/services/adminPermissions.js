const PERMISSIONS = Object.freeze({
  dashboard: ['dashboard:read'],
  users: ['users:read', 'users:manage'],
  bookings: ['bookings:read', 'bookings:manage'],
  discounts: ['discounts:read', 'discounts:manage'],
  coupons: ['coupons:read', 'coupons:manage'],
  offers: ['offers:read', 'offers:manage'],
  themes: ['themes:read', 'themes:manage'],
  banners: ['banners:read', 'banners:manage'],
  notifications: ['notifications:read', 'notifications:send'],
  payments: ['payments:read'],
  wallets: ['wallets:read', 'wallets:manage'],
  settings: ['settings:read', 'settings:manage'],
  admins: ['admins:manage'],
  audit: ['audit:read'],
});

const ROLE_PERMISSIONS = Object.freeze({
  super_admin: Object.values(PERMISSIONS).flat(),
  admin: ['dashboard:read', 'users:read', 'users:manage', 'bookings:read', 'bookings:manage', 'discounts:read', 'discounts:manage', 'coupons:read', 'coupons:manage', 'offers:read', 'offers:manage', 'themes:read', 'themes:manage', 'banners:read', 'banners:manage', 'notifications:read', 'notifications:send', 'payments:read', 'wallets:read', 'wallets:manage'],
  support: ['dashboard:read', 'users:read', 'bookings:read', 'payments:read', 'wallets:read'],
});

const hasPermission = (admin, permission) => admin?.role === 'super_admin' ||
  ROLE_PERMISSIONS[admin?.role]?.includes(permission) || admin?.permissions?.includes(permission);

module.exports = { PERMISSIONS, ROLE_PERMISSIONS, hasPermission };
