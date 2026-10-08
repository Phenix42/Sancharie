# Sancharie Admin

Standalone React, TypeScript and Vite application for `admin.sancharie.com`. It is not part of the customer frontend build. It connects to the existing Sancharie API under `/api/admin/*`.

## Local development

Requirements: Node.js 20.19 or newer and npm.

```sh
cp .env.example .env.local
npm install
npm run dev
```

Set `VITE_API_URL` in `.env.local` to the backend origin, such as `http://localhost:8000`. The separate admin Vite server runs on port 5174; set `ADMIN_URL`/`CORS_ORIGINS` in the backend environment to allow that origin.

## First Super Admin

Configure `ADMIN_JWT_SECRET` to a randomly generated secret that is separate from the customer `JWT_SECRET`. Keep `ADMIN_JWT_TTL` at a short duration such as `8h`. Bootstrap the first administrator from the backend directory using one-time environment values:

```sh
ADMIN_BOOTSTRAP_EMAIL=admin@example.com ADMIN_BOOTSTRAP_PASSWORD='use-a-long-unique-password' npm run admin:bootstrap
```

The password must be at least 14 characters. The script refuses to overwrite an existing account. Remove the bootstrap credentials from the process environment after it succeeds. Admin accounts are not created through a public signup endpoint.

## Build and deployment

```sh
npm run build
```

Publish `dist/` on the separate admin virtual host. Configure the backend with `ADMIN_URL=https://admin.sancharie.com` and an allowlist in `CORS_ORIGINS` containing only the required customer and admin origins. Keep HTTPS enabled and do not expose backend secrets to this frontend.

Example Nginx site for an SPA fallback:

```nginx
server {
    server_name admin.sancharie.com;
    root /var/www/sancharie-admin/dist;
    index index.html;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options DENY always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://api.sancharie.com" always;
    location / { try_files $uri $uri/ /index.html; }
}
```

The backend needs Node.js 20.19 or newer for its current Mongoose dependency. Set `TRUST_PROXY=true` when it runs behind the single Nginx reverse proxy so login throttling and audit IPs use the client address. Restart it with PM2 after deploying backend changes. Admin JWTs expire and can be revoked when the admin is disabled, their role/password changes, or they sign out.

## Current data boundaries

Dashboard, user, booking and payment summaries read existing MongoDB records. Payment records are currently booking-backed because the existing app has no payment ledger collection. Promotions and runtime themes/settings are stored in separate admin collections. Coupon/discount administration is in place; applying discounts to the customer checkout still requires a server-side pricing contract with the bus, flight and hotel providers so checkout amounts cannot be manipulated or leave supplier totals underpaid.
