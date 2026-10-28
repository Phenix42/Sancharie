# Sancharie Wallet API

Customer endpoints below are mounted at `/user` and require the signed-in customer JWT. Send it as `Authorization: Bearer <customer-token>`. Amounts in request and response JSON are Indian rupees unless a field is explicitly named `amount` on a Razorpay order, where Razorpay uses paise.

## Get balance and recent activity

`GET /user/wallet`

Returns the customer's current balance, personal minimum booking threshold, up to 50 newest wallet transactions, and the active bonus rule (if one exists).

Referral commissions are credited to the referrer's wallet only after the referred customer completes their first successful bus booking. The commission percentage is managed in Admin → Application settings. Signup by itself does not create a referral wallet transaction.

```json
{
  "success": true,
  "balance": 1250,
  "transactions": [
    {
      "type": "credit",
      "amount": 1500,
      "orderId": "order_example",
      "paymentId": "pay_example",
      "description": "Wallet top-up",
      "createdAt": "2026-10-15T10:00:00.000Z"
    },
    {
      "type": "debit",
      "amount": 250,
      "reference": "booking_SAN123456",
      "requestId": "wallet-purchase-uuid",
      "description": "Bus booking",
      "createdAt": "2026-10-15T10:02:00.000Z"
    }
  ]
}
```

## Claim an active bonus rule

`POST /user/wallet/promotion/claim`

A customer may claim the current enabled promotion once. The server atomically reserves a place, so the `recipientLimit` cannot be exceeded under concurrent claims. If all places have been claimed, the response returns `claimed: false` and `exhausted: true`.

```json
{
  "success": true,
  "claimed": true,
  "balance": 500,
  "minimumBookingAmount": 200,
  "rewardAmount": 500
}
```

A customer's minimum booking threshold is returned by `GET /user/wallet`. The debit endpoint looks up the authenticated customer's pending booking and checks its stored fare against that threshold.

## Add money

1. `POST /user/wallet/top-up-order` with `{ "amount": 500 }` (minimum ₹100; maximum ₹50,000).
2. Open Razorpay Checkout using the returned `order.id`, `order.amount` (paise), `order.currency`, and `keyId`.
3. After Razorpay Checkout succeeds, send its response object to `POST /user/wallet/credit`.

Create order response:

```json
{
  "success": true,
  "order": { "id": "order_example", "amount": 50000, "currency": "INR" },
  "keyId": "rzp_live_public_key"
}
```

Credit request (forward the three values returned by Razorpay Checkout):

```json
{
  "razorpay_order_id": "order_example",
  "razorpay_payment_id": "pay_example",
  "razorpay_signature": "<razorpay-signature>"
}
```

The server checks the signature, confirms the order belongs to the signed-in customer, and confirms the payment was captured for the exact order amount before crediting the wallet. Repeating the same verified order is idempotent and does not add funds twice. Do not credit the wallet from a client-side success callback without calling this endpoint.

## Spend wallet balance

`POST /user/wallet/debit`

Debits the authenticated customer's wallet. Use a stable unique `requestId` for each purchase attempt and reuse it if retrying the same request. The server returns the original result for a repeated request ID and rejects debits that exceed the available balance.

```json
{
  "amount": 250,
  "bookingId": "<pending-booking-database-id>",
  "description": "Bus booking",
  "requestId": "wallet-purchase-uuid"
}
```

Success response:

```json
{
  "success": true,
  "idempotent": false,
  "balance": 1000,
  "transaction": {
    "type": "debit",
    "amount": 250,
    "reference": "booking_SAN123456",
    "description": "Bus booking",
    "requestId": "wallet-purchase-uuid"
  }
}
```

Debits accept ₹0.01–₹500,000 and must be attached to a pending booking owned by the signed-in customer. The server reads the booking fare and checks the customer's minimum booking threshold; callers cannot set the threshold amount themselves. A debit cannot exceed the booking total. The app should check the displayed balance for convenience, but must treat this endpoint response as authoritative. Debit transactions are internal wallet ledger entries; use only where the app's fulfillment flow supports wallet settlement.

## Common errors

- `401` / `403`: customer token missing, invalid or expired.
- `400`: invalid amount, request ID, or booking ID.
- `404`: pending booking not found for the authenticated customer.
- `409`: insufficient balance, booking is no longer pending, or minimum booking amount not met.
- `503`: Razorpay wallet top-up is unavailable because payment credentials are not configured.

## Admin wallet API

Admin endpoints are mounted at `/api/admin` and use the separate admin JWT from the Sancharie Admin portal.

- `GET /api/admin/wallets?q=&page=1&limit=50` — searchable customer wallets and aggregate balance summary (`wallets:read`).
- `GET /api/admin/wallets/:customerId` — wallet balance and latest 100 ledger entries (`wallets:read`).
- `POST /api/admin/wallets/:customerId/adjust` — manual credit/debit, reason required, idempotent `requestId` required (`wallets:manage`).
- `GET /api/admin/wallet-promotions` — current/latest bonus rule and claim progress (`wallets:read`).
- `POST /api/admin/wallet-promotions` — starts a new rule and pauses any prior rule (`wallets:manage`).
- `PATCH /api/admin/wallet-promotions/:promotionId` — pause or resume a rule (`wallets:manage`).

Example adjustment body:

```json
{
  "direction": "credit",
  "amount": 25,
  "reason": "Support case SC-1042 correction",
  "requestId": "admin-adjustment-uuid"
}
```

Manual adjustments are recorded in the customer ledger and admin audit log. Admin debits cannot take a wallet below zero.


### Configure first-customer bonus

`POST /api/admin/wallet-promotions`

```json
{
  "rewardAmount": 500,
  "minimumBookingAmount": 200,
  "recipientLimit": 100
}
```

This starts a rule that credits ₹500 to the first 100 customers who claim it. Each bonus is recorded as a wallet transaction. The customer's wallet debit request is rejected unless its `bookingAmount` is at least ₹200. Starting a new rule pauses the previous active rule; already claimed balances remain in customer wallets.
