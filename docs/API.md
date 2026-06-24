# API Reference

## Desktop Local Sync API

Base URL while desktop app is running:

```text
http://127.0.0.1:7070
```

### `GET /health`

Returns sync server health.

### `GET /sync/master-data`

Used by tablets before field collection rounds.

Returns:

- line users
- tea lines
- suppliers
- monthly settings

### `POST /sync/login`

Used by the tablet login screen after QR pairing. Authenticates an active desktop line user during online setup; the tablet caches the successful line-user login locally for later offline login.

Payload:

```json
{
  "username": "lineuser1",
  "password": "lineUser1"
}
```

Response:

```json
{
  "user": {
    "id": "line_user_id",
    "username": "lineuser1",
    "displayName": "Line User 1"
  }
}
```

### `POST /sync/collections`

Used by tablets at the end of the day.

Payload shape:

```json
{
  "deviceId": "tablet-1",
  "records": [
    {
      "id": "mobile-record-id",
      "collectionDate": "2026-06-05",
      "collectionTime": "08:30",
      "tabletSavedAt": "2026-06-05 08:30:00",
      "printedAt": "2026-06-05 08:31:10",
      "lineId": "line-id",
      "lineName": "Line A",
      "supplierId": "supplier-id",
      "supplierCode": "S001",
      "supplierName": "Supplier Name",
      "bagCount": 2,
      "grossWeightKg": 12.5,
      "lineUserName": "Line User",
      "printStatus": "printed"
    }
  ]
}
```

The desktop app imports these records into staging and skips duplicates by `id`. `tabletSavedAt` and `printedAt` are preserved for desktop audit views when supplied.

### `GET /office/green-leaf-book?month=YYYY-MM`

Returns the calculated monthly green leaf book. Posted collection entries for the month are included even if their current supplier master row is unavailable.

### `POST /office/supplier-month-overrides`

Office-session protected endpoint that sets a month-specific override for one supplier. When `teaPricePerKg` is supplied, it replaces the selected month's default tea price for that supplier.

Payload:

```json
{
  "supplierId": "supplier-id",
  "month": "2026-06",
  "teaPricePerKg": 250
}
```

### `POST /office/line-supplier-price-overrides`

Office-session protected endpoint that applies the same month-specific green leaf price to every active supplier in a selected tea line. The desktop Tea Line edit dialog sends `lineId`; `lineName` is accepted as a fallback.

Payload:

```json
{
  "lineId": "line-id",
  "lineName": "Line A",
  "month": "2026-06",
  "teaPricePerKg": 250
}
```

Response:

```json
{
  "lineId": "line-id",
  "lineName": "Line A",
  "month": "2026-06",
  "teaPricePerKg": 250,
  "updatedCount": 10
}
```

### `GET /office/pairing-info`

Office-session protected endpoint used by the desktop Pair Tablet screen. Returns the current desktop sync URL and a QR code data URL.

Response:

```json
{
  "primaryUrl": "http://192.168.1.50:7070",
  "urls": ["http://192.168.1.50:7070"],
  "pairingPayload": "{\"type\":\"kudamalana-tablet-sync\",\"version\":1,\"syncUrl\":\"http://192.168.1.50:7070\"}",
  "qrDataUrl": "data:image/png;base64,..."
}
```

## Backend API

Base URL in development:

```text
http://127.0.0.1:8080
```

### `POST /auth/login`

Returns a bearer token and public user details for API clients. Browser clients also receive the same session token as an HttpOnly `tea_session` cookie.
Inactive users are rejected with `403`.

Payload:

```json
{
  "username": "superadmin",
  "password": "admin123"
}
```

Response:

```json
{
  "token": "session-token",
  "user": {
    "id": "user-id",
    "username": "superadmin",
    "displayName": "Super Admin",
    "role": "super_admin",
    "active": true,
    "createdAt": "2026-06-16 10:30:00"
  }
}
```

### `POST /auth/logout`

Deletes the current bearer token or `tea_session` cookie token from backend sessions, and clears the browser cookie.

Requires one of:

```text
Authorization: Bearer <token>
Cookie: tea_session=<token>
```

### `GET /auth/me`

Returns the currently signed-in user from the bearer token or `tea_session` cookie. The web app calls this after reload to restore the visible session.

### `POST /admin/directors`

Super admin-only endpoint for director account creation.

### `GET /admin/directors`

Super admin and director endpoint that lists existing director accounts. Directors receive view-only access.

### `POST /admin/users`

Super admin-only endpoint for creating managed web users.

Supported roles:

- `director`
- `office_user`

Payload:

```json
{
  "role": "office_user",
  "username": "office-web",
  "password": "temporary-password",
  "displayName": "Office User"
}
```

### `GET /admin/users?role=director`

Super admin and director endpoint that lists users for a managed role. Use `role=director` or `role=office_user`.
Directors receive view-only access.

### `PATCH /admin/users/:id`

Super admin-only endpoint for editing, activating, or deactivating managed users.

Payload fields are optional:

```json
{
  "displayName": "Updated Name",
  "username": "updated-username",
  "password": "new-password",
  "active": false
}
```

### `POST /sync/desktop`

Accepts finalized desktop data for cloud sync.

### `GET /green-leaf-book?month=YYYY-MM`

Returns a role-protected monthly green leaf book from synced backend data.

## Authentication Notes

- API clients can authenticate with `Authorization: Bearer <token>`.
- Browser clients authenticate with an HttpOnly `SameSite=Lax` `tea_session` cookie.
- The cookie is marked `Secure` when `COOKIE_SECURE=true` or `NODE_ENV=production`.
- Backend sessions are stored in MySQL and checked on protected endpoints.
- Inactive users cannot log in and inactive existing sessions are rejected on protected endpoints.
- Role checks restrict user management and desktop sync endpoints. Super admins can manage directors and office users; directors can view those lists; office users cannot access user management.
