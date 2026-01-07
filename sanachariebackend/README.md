# 🔐 Secure OTP Authentication System

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                    SECURITY ARCHITECTURE                          │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│   ┌─────────────┐        ┌─────────────┐        ┌─────────────┐  │
│   │   React     │   →    │  Node.js    │   →    │  MetaReach  │  │
│   │  Frontend   │        │  Backend    │        │   SMS API   │  │
│   │             │        │             │        │             │  │
│   │  NO SECRETS │        │  .env FILE  │        │  EXTERNAL   │  │
│   │  NO API KEY │        │  API KEY ✓  │        │  SERVICE    │  │
│   └─────────────┘        └─────────────┘        └─────────────┘  │
│                                                                   │
│   ✅ Safe to expose        ✅ Protected          ✅ Never called  │
│      to users                 on server             from frontend │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

## 🔒 Security Features

| Feature | Implementation |
|---------|---------------|
| **API Key Protection** | Stored in backend `.env` only |
| **Rate Limiting** | 3 OTP requests per 10 minutes |
| **OTP Expiry** | 5 minutes auto-expiration |
| **Single-Use OTP** | Deleted after successful verification |
| **Attempt Limiting** | Max 3 incorrect attempts |
| **CORS Protection** | Only frontend domain allowed |
| **Input Validation** | Phone number format validation |
| **Secure Random** | Crypto.randomInt for OTP generation |

## 📁 Project Structure

```
sanachariebackend/
├── .env                    # 🔐 SECRETS HERE (never commit)
├── .env.example            # Template for .env
├── .gitignore              # Excludes .env from git
├── index.js                # Express server entry point
├── package.json
├── routes/
│   └── auth.js             # /auth/send-otp, /auth/verify-otp
├── services/
│   ├── otpService.js       # OTP generation & validation
│   └── smsService.js       # MetaReach API integration
└── middleware/
    └── validation.js       # Rate limiting & validation

sancharie/
├── .env                    # Frontend config (NO SECRETS)
└── src/
    ├── services/
    │   └── authApi.js      # API calls to backend
    └── components/
        └── Authantication/
            └── Login.jsx   # Login UI component
```

## 🚀 Setup Instructions

### 1. Backend Setup

```bash
cd sanachariebackend

# Install dependencies
npm install

# Configure environment variables
# Edit .env file with your MetaReach credentials:
#   SMS_API_KEY=your_actual_api_key
#   SMS_SENDER_ID=your_sender_id

# Start the server
npm run dev
```

### 2. Frontend Setup

```bash
cd sancharie

# Install dependencies (if not already done)
npm install

# Start the development server
npm run dev
```

### 3. Configure MetaReach Credentials

Edit `sanachariebackend/.env`:

```env
SMS_API_KEY=your_metareach_api_key_here
SMS_SENDER_ID=your_approved_sender_id
SMS_API_URL=https://api.metareach.com/sms/send
```

⚠️ **IMPORTANT**: Get these credentials from your MetaReach dashboard.

## 📡 API Endpoints

### POST `/auth/send-otp`

Send OTP to mobile number.

**Request:**
```json
{
  "mobile": "9876543210"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "OTP sent successfully",
  "expiresIn": 5
}
```

**Response (Rate Limited):**
```json
{
  "success": false,
  "message": "Too many OTP requests. Please try again in 8 minute(s).",
  "retryAfter": 8
}
```

### POST `/auth/verify-otp`

Verify OTP entered by user.

**Request:**
```json
{
  "mobile": "9876543210",
  "otp": "123456"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "OTP verified successfully",
  "user": {
    "mobile": "9876543210",
    "isAuthenticated": true
  }
}
```

### POST `/auth/resend-otp`

Resend OTP (subject to rate limiting).

**Request:**
```json
{
  "mobile": "9876543210"
}
```

## ⚙️ Configuration Options

### Backend `.env`

| Variable | Description | Default |
|----------|-------------|---------|
| `SMS_API_KEY` | MetaReach API Key | Required |
| `SMS_SENDER_ID` | Approved Sender ID | Required |
| `SMS_API_URL` | MetaReach API URL | https://api.metareach.com/sms/send |
| `PORT` | Server port | 5000 |
| `FRONTEND_URL` | CORS allowed origin | http://localhost:5173 |
| `OTP_EXPIRY_MINUTES` | OTP validity duration | 5 |
| `RATE_LIMIT_MAX_REQUESTS` | Max OTP requests per window | 3 |
| `RATE_LIMIT_WINDOW_MINUTES` | Rate limit window | 10 |

## 🛡️ Security Checklist

- [x] API key stored in backend `.env` only
- [x] `.env` added to `.gitignore`
- [x] Frontend never calls SMS API directly
- [x] Rate limiting implemented
- [x] OTP expiry implemented
- [x] Single-use OTP (deleted after verification)
- [x] Input validation for phone numbers
- [x] CORS restricted to frontend domain
- [x] Helmet security headers enabled
- [x] Cryptographically secure OTP generation

## ⚠️ Security Warnings

### DO NOT:
- ❌ Commit `.env` file to version control
- ❌ Hardcode API keys in frontend code
- ❌ Call MetaReach API from frontend
- ❌ Expose OTP in API responses
- ❌ Log sensitive credentials

### ALWAYS:
- ✅ Keep `.env` in `.gitignore`
- ✅ Use environment variables for secrets
- ✅ Route all SMS calls through backend
- ✅ Validate and sanitize inputs
- ✅ Implement rate limiting

## 🔧 Production Deployment

### Backend
1. Use a process manager (PM2)
2. Enable HTTPS
3. Use Redis for OTP storage (instead of in-memory)
4. Set `NODE_ENV=production`
5. Update `FRONTEND_URL` to production domain

### Frontend
1. Update `VITE_API_URL` to production backend URL
2. Build for production: `npm run build`

## 📞 MetaReach API Notes

The SMS service (`smsService.js`) is configured for MetaReach HTTP API. If your API format differs, update the `sendOTP` function accordingly.

Typical MetaReach parameters:
- `apikey` - Your API key
- `senderid` - Approved sender ID
- `number` - Phone number with country code
- `message` - URL-encoded message text

## 📝 License

Private - Sancharie Project
