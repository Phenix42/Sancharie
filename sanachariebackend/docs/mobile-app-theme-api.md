# Mobile app theme integration

## Endpoint

Fetch the active customer configuration with:

```http
GET {API_BASE_URL}/api/config
Accept: application/json
```

This read-only endpoint requires **no API key and no user login**. It returns public customer configuration only. Do not put Admin credentials or an Admin bearer token in the mobile app.

The repository is currently configured for local development at `http://localhost:8000`. The deployed HTTPS backend hostname must be confirmed before using this endpoint in a released app. Android emulators normally reach a developer machine through `http://10.0.2.2:8000`; physical devices need the developer machine's LAN address or a deployed server.

## Theme response

The active theme is returned at `data.theme`. If there is no active theme or an Admin disables festival themes, `data.theme` is `null`; use the app's built-in colors in that case.

```json
{
  "success": true,
  "data": {
    "settings": {
      "festivalThemeEnabled": true,
      "announcement": ""
    },
    "appIconUrl": "/api/app-icon?v=1791388800000",
    "theme": {
      "name": "Diwali",
      "festival": "Diwali",
      "primaryColor": "#1746a2",
      "secondaryColor": "#f3a712",
      "backgroundColor": "#ffffff",
      "bannerImage": "https://example.com/banner.png",
      "logoImage": "https://example.com/logo.png",
      "icon": "",
      "promotionalText": "Seasonal offers are live",
      "ctaText": "Explore"
    },
    "banners": [],
    "discounts": [],
    "coupons": [],
    "offers": []
  }
}
```

`data.appIconUrl` is `null` until an Admin uploads an icon in Application settings. When present, resolve this path against `API_BASE_URL` and use it as the app's in-app brand/logo image. It is a public image endpoint and requires no API key. Re-fetch `/api/config` on app resume (or after the 60-second config cache) to detect a replacement. The URL version changes on each upload for cache invalidation.

This changes the icon shown inside the app. iOS and Android launcher icons are packaged native assets: the mobile app developer must separately configure platform support for changing those icons. A remote upload cannot replace the already installed app's launcher icon by itself.

## Applying theme updates

On app start and when the app returns to the foreground, request `/api/config`. Apply the `theme` values to the mobile app's theme provider/design tokens. Keep built-in defaults for any missing values, and use normal text/background contrast rules. Admin scheduled themes are selected by their enabled flag and start/end dates, so the next config fetch picks up Admin changes automatically. The endpoint cache lifetime is 60 seconds; refresh on app resume or after that interval.

Example in JavaScript/React Native:

```js
const response = await fetch(`${API_BASE_URL}/api/config`, {
  headers: { Accept: 'application/json' },
});
if (response.ok) {
  const { data } = await response.json();
  const theme = data.settings?.festivalThemeEnabled ? data.theme : null;
  applyTheme({
    primary: theme?.primaryColor ?? '#002C3F',
    secondary: theme?.secondaryColor ?? '#CEB45F',
    background: theme?.backgroundColor ?? '#FFFFFF',
    logo: data.appIconUrl ? new URL(data.appIconUrl, API_BASE_URL).toString() : theme?.logoImage || null,
    banner: theme?.bannerImage || null,
  });
}
```

Other public config values are `data.banners`, `data.discounts`, `data.coupons`, `data.offers`, and customer-facing `data.settings`. The discounts array only includes enabled discounts within their active date window. Values are content/configuration; coupon redemption and discounted checkout must be implemented separately in the mobile booking flow.

## Admin APIs

Theme creation and editing are under `/api/admin/themes`, but require the Admin sign-in flow and a short-lived Admin JWT. Keep that token on the trusted Admin client only; the customer mobile app should use the public `/api/config` endpoint.
