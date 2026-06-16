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

The desktop app imports these records into staging and skips duplicates by `id`.

### `GET /office/green-leaf-book?month=YYYY-MM`

Returns the calculated monthly green leaf book.

## Backend API

Base URL in development:

```text
http://127.0.0.1:8080
```

### `POST /auth/login`

Returns a bearer token and public user details for authenticated requests.

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

Deletes the current bearer token from backend sessions.

Requires:

```text
Authorization: Bearer <token>
```

### `POST /admin/directors`

Super admin-only endpoint for director account creation.

### `POST /sync/desktop`

Accepts finalized desktop data for cloud sync.

### `GET /green-leaf-book?month=YYYY-MM`

Returns a director-readable monthly green leaf book from synced backend data.

## Authentication Notes

- Authenticated backend requests use `Authorization: Bearer <token>`.
- Web tokens are stored only in browser JavaScript memory, not local storage.
- Backend sessions are stored in MySQL and checked on protected endpoints.
- Role checks restrict director creation and desktop sync endpoints.
