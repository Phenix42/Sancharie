# 🚌 Sancharie Backend API

A secure Node.js/Express backend for the Sancharie bus booking platform.

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                       SECURITY ARCHITECTURE                           │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│   ┌─────────────┐      ┌─────────────┐      ┌─────────────────────┐  │
│   │   React     │  →   │  Node.js    │  →   │  External APIs      │  │
│   │  Frontend   │      │  Backend    │      │  - MetaReach SMS    │  │
│   │             │      │             │      │  - Bus Booking API  │  │
│   │  NO SECRETS │      │  ALL KEYS   │      │  - Razorpay         │  │
│   └─────────────┘      └─────────────┘      └─────────────────────┘  │
│                                                                       │
│   ✅ Public only       ✅ Credentials      ✅ Hidden from            │
│                           protected           browser network tab    │
└──────────────────────────────────────────────────────────────────────┘
```

## 🔒 Security Features

| Feature | Implementation |
|---------|---------------|
| **API Key Protection** | All secrets in backend `.env` only |
| **Rate Limiting** | 3 OTP requests per 10 minutes |
| **OTP Security** | 5-min expiry, single-use, max 3 attempts |
| **API Proxy** | Third-party APIs hidden from browser |
| **CORS Protection** | Only allowed frontend domains |
| **Input Validation** | All endpoints validated |
| **JWT Auth** | Secure token-based sessions |
| **Payment Security** | Server-side Razorpay signature verification |

## 📁 Project Structure

```
sanachariebackend/
├── .env                    # 🔐 SECRETS (never commit)
├── .env.example            # Template for .env
├── .gitignore              # Excludes .env
├── index.js                # Express entry point
├── package.json
│
├── routes/
│   ├── auth.js             # OTP authentication
│   ├── bus.js              # Bus API proxy (hides third-party API)
│   ├── flight.js           # Flight API proxy (hides provider credentials)
│   ├── payment.js          # Razorpay integration
│   └── user.js             # User profile & bookings
│
├── services/
│   ├── otpService.js       # OTP generation & validation
│   ├── smsService.js       # MetaReach SMS integration
│   └── paymentService.js   # Razorpay payment processing
│
├── models/
│   ├── User.js             # User schema (MongoDB)
│   └── Booking.js          # Booking schema
│
└── middleware/
    └── validation.js       # Rate limiting & validation
```

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy and configure environment
cp .env.example .env
# Edit .env with your actual credentials

# 3. Start MongoDB (local)
mongod

# 4. Start development server
npm run dev
```

## 📡 API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/send-otp` | Send OTP to phone |
| POST | `/auth/verify-otp` | Verify OTP |
| POST | `/auth/resend-otp` | Resend OTP |

### User
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/user/login-complete` | Complete login, get JWT |
| POST | `/user/verify-token` | Verify JWT token |
| GET | `/user/profile` | Get user profile (auth required) |
| PUT | `/user/profile` | Update profile (auth required) |
| GET | `/user/bookings` | Get bookings (auth required) |
| POST | `/user/bookings` | Save booking (auth required) |

### Bus (Proxy)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/busservice/rest/search` | Search buses |
| POST | `/api/busservice/rest/seatlayout` | Get seat layout |
| POST | `/api/busservice/rest/boardingpoint` | Get boarding points |
| POST | `/api/busservice/rest/blockseat` | Block seats |
| POST | `/api/busservice/rest/book` | Book ticket |
| POST | `/api/busservice/rest/getbookingdetail` | Get booking details |
| POST | `/api/busservice/rest/cancelrequest` | Cancel booking |

### Payment
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/payment/config` | Get Razorpay public key |
| POST | `/payment/create-order` | Create payment order |
| POST | `/payment/verify-payment` | Verify payment signature |
| GET | `/payment/order/:id` | Get order status |

### Flights (BDSD/TTS Proxy)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/flights/search` | Search flights |
| POST | `/api/flights/calendar-fares` | Get calendar fares |
| POST | `/api/flights/fare-rule` | Get rules for a selected fare |
| POST | `/api/flights/fare-confirmation` | Revalidate price and flight details |
| POST | `/api/flights/ssr` | Get meals, baggage, and seat inventory |
| POST | `/api/flights/book` | Book selected flight (auth + captured payment required) |
| POST | `/api/flights/booking-detail` | Get provider booking details (auth required) |
| POST | `/api/flights/cancel-request` | Request full cancellation (auth required) |

## 🔧 Environment Variables

See `.env.example` for all required variables:

```env
# Server
PORT=8000
NODE_ENV=development

# MongoDB
MONGODB_URI=mongodb://localhost:27017/sancharie

# JWT
JWT_SECRET=your-secret-key

# SMS (MetaReach)
SMS_API_KEY=xxx
SMS_SENDER_ID=xxx
SMS_API_URL=https://sms.metareach.in/vb/apikey.php
SMS_ENTITY_ID=xxx
SMS_TEMPLATE_ID=xxx

# Razorpay
RAZORPAY_KEY_ID=rzp_xxx
RAZORPAY_KEY_SECRET=xxx
RAZORPAY_MERCHANT_NAME=Your Business

# Bus API (Third-party - HIDDEN FROM FRONTEND)
BUS_API_URL=https://...
BUS_API_USERNAME=xxx
BUS_API_PASSWORD=xxx

# Flight API (Third-party - HIDDEN FROM FRONTEND)
FLIGHT_API_BASE_URL=https://api.bdsd.technology/api
FLIGHT_API_USERNAME=xxx
FLIGHT_API_PASSWORD=xxx
FLIGHT_API_TIMEOUT=30000
```

## 🛡️ Security Notes

1. **Never commit `.env`** - Contains all secrets
2. **API Proxy** - Bus API URL completely hidden from browser network tab
3. **JWT Tokens** - 30-day expiry, secure httpOnly cookies recommended for production
4. **Rate Limiting** - Prevents brute force attacks on OTP
5. **CORS** - Restricted to frontend domains only
6. **Input Sanitization** - All inputs validated before processing

## 📦 Dependencies

- `express` - Web framework
- `mongoose` - MongoDB ODM
- `jsonwebtoken` - JWT authentication
- `axios` - HTTP client for API proxy
- `cors` - Cross-origin handling
- `helmet` - Security headers
- `dotenv` - Environment variables
- `razorpay` - Payment integration

## 🔄 Development

```bash
# Run with auto-reload
npm run dev

# Run production
npm start

# Check for issues
npm run lint
```

---

© 2025 Sancharie Travels
