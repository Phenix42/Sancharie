# Admin API setup

The admin API is mounted at `/api/admin` and uses an admin-specific JWT secret and audience. Customer JWTs cannot authorize admin requests.

Required environment:

```env
ADMIN_JWT_SECRET=<random secret, different from JWT_SECRET>
ADMIN_JWT_TTL=8h
ADMIN_URL=https://admin.sancharie.com
CORS_ORIGINS=https://sancharie.com,https://www.sancharie.com,https://admin.sancharie.com
TRUST_PROXY=true
```

Create the first account with `npm run admin:bootstrap` and one-time `ADMIN_BOOTSTRAP_EMAIL` and `ADMIN_BOOTSTRAP_PASSWORD` environment values. The script is intentionally separate from HTTP routes. Admin API mutations create audit records. Audit logs have no API update/delete endpoints.

Public customer configuration is available from `GET /api/config`. It returns only active themes, scheduled banners and customer-safe application settings. Admin management uses `/api/admin/auth/*`, `/api/admin/dashboard`, and the modules for users, bookings, discounts, coupons, offers, themes, banners, payments, settings, admin users and audit logs.

## Customer push notifications

Configure `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` in the backend environment. Generate a key pair with `npx web-push generate-vapid-keys`; keep the private key on the server. The customer browser must use HTTPS (localhost is allowed for development), and each customer must opt in under Profile → App notifications.

- `GET /user/push/public-key` returns the public VAPID key.
- `POST /user/push/subscriptions` saves the signed-in customer's browser subscription.
- `DELETE /user/push/subscriptions` removes that customer's subscription.
- `GET /api/admin/notifications` reports service and opt-in counts.
- `POST /api/admin/notifications/campaign` sends a promotional message to opted-in devices. Admins need `notifications:send`.

Booking status and refund-status changes send transactional notifications. Promotion campaigns are sent from the separate Sancharie Admin app. Expired browser subscriptions are removed when a push provider reports them as gone.

## Referral tracking

New customer accounts receive a referral code. A new account created through a `/?ref=SAN…` invite link is attributed to its referrer; signed-in customers can share the link from Profile. Referral reward values and qualification rules still need business configuration before automatic rewards are issued.


## Wallets

The admin portal exposes wallet review and adjustment endpoints. See [wallet-api.md](./wallet-api.md) for the complete customer and admin API contract.

- `GET /api/admin/wallets` and `GET /api/admin/wallets/:customerId` require `wallets:read`.
- `POST /api/admin/wallets/:customerId/adjust` requires `wallets:manage`, a reason, and an idempotency request ID. All adjustments are recorded in the wallet ledger and admin audit log.
