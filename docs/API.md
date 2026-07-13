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

Returns the calculated monthly green leaf book. Posted collection entries for the month are included even if their current supplier master row is unavailable. Advance payments are returned per row as `advancePayments` date/amount entries, with `totalAdvances` included in deductions and balance calculations.

Rows include payment state when a month-end payment has been recorded. Factory-owned suppliers return `balanceExcluded: true`; their monthly details remain present but payable balance is not calculated.

When the month has been closed in the desktop app, the response includes `closed: true` and a `closure` object with close user/time metadata. Closed books remain viewable but should be treated as read-only.

### `GET /office/month-end-summary?month=YYYY-MM`

Office-session protected endpoint that generates month-end supplier bills and line-wise totals from posted Green Leaf Book data.

Returns:

- supplier bill details with daily kg, collection entries, price, leaf value, transport additions/deductions, advances, fertilizer installments and carry-forward amounts, made tea packets, arrears, totals, balance, supplier payment mode, and payment state
- line summaries with supplier count, kg totals, additions, deductions, balance, and paid count

### `POST /office/supplier-bill-print-audit`

Office-session protected endpoint called by the desktop app after the operating-system print dialog completes for supplier bills. It records a print audit with the selected month, supplier names/codes, and server-side print timestamp. Opening or expanding the print preview does not call this endpoint.

Payload:

```json
{
  "month": "2026-06",
  "suppliers": [
    { "id": "supplier-id", "code": "S001", "name": "Supplier Name" }
  ]
}
```

### `POST /office/supplier-payments`

Office-session protected endpoint that records month-end payments made outside the system. This marks the selected supplier or all payable suppliers in a line as paid for the month without changing the calculated Green Leaf Book balance. Negative Green Leaf Book balances continue into the next month as arrears, including suppliers without a recorded payment.

Supplier-wise payload:

```json
{
  "month": "2026-06",
  "scope": "supplier",
  "supplierId": "supplier-id",
  "paidAt": "2026-06-30",
  "amount": 12500,
  "note": "Cash paid"
}
```

Line-wise payload:

```json
{
  "month": "2026-06",
  "scope": "line",
  "lineName": "Line A",
  "paidAt": "2026-06-30",
  "note": "Line payment batch"
}
```

### `POST /office/green-leaf-book/close`

Office-session protected desktop endpoint that closes a Green Leaf Book month after all suppliers with positive payable balances have recorded payments. Closing writes any negative balances into the next month as arrears and blocks further month-specific edits until reopened.

### `POST /office/green-leaf-book/reopen`

Desktop admin-only endpoint that reopens a closed Green Leaf Book month for corrections. Close and reopen actions are written to the audit log.

### `GET /office/audit-log`

Office-session protected endpoint that returns the append-only audit trail for office mutations in latest-first order. The audit log records creations, updates, checkbox/status changes, staging posts, line price override batches, supplier bill print completion, and supplier payment recording. Viewing-only operations, including supplier bill print-preview viewing, are not logged, and sensitive fields such as passwords, hashes, tokens, and authorization values are excluded from before/after snapshots.

Response shape:

```json
{
  "auditLogs": [
    {
      "id": "audit_...",
      "displayName": "Factory Office",
      "action": "update",
      "entityType": "supplier",
      "entityId": "sup_1",
      "entityLabel": "S001 Nimal",
      "summary": "Updated supplier: S001 Nimal",
      "before": {},
      "after": {},
      "createdAt": "2026-06-01T10:30:00.000Z"
    }
  ]
}
```

### `POST /office/advances`

Office-session protected endpoint that records an advance given to a supplier for an effective month. Closed effective months reject new advances until an admin reopens the Green Leaf Book month.

Payload:

```json
{
  "supplierId": "supplier-id",
  "effectiveMonth": "2026-06",
  "date": "2026-06-15",
  "amount": 5000
}
```

### `GET /office/advance-suggestion?month=YYYY-MM&supplierId=supplier-id`

Office-session protected endpoint that suggests an advance amount using unpaid positive balances from the selected effective month through the current month. Months already paid through `supplier_payments` or closed through `month_closures` are excluded. The calculation uses the same Green Leaf Book payable balance logic, including special prices, 2% deduction, transport additions/deductions, prior advances, fertilizer, made tea packets, and arrears.

### `POST /office/fertilizer-issues`

Office-session protected endpoint that records fertilizer lent to a supplier and creates one or two monthly deduction installments.

Payload:

```json
{
  "supplierId": "supplier-id",
  "date": "2026-06-15",
  "kgGiven": 20,
  "totalAmount": 10000,
  "splitMonths": 2,
  "effectiveMonth1": "2026-06",
  "effectiveMonth2": "2026-07"
}
```

`splitMonths` must be `1` or `2`. The Green Leaf Book only deducts the generated fertilizer installment amount whose effective month matches the selected book month.

### `POST /office/tea-packets`

Office-session protected endpoint that records made tea packets borrowed by a supplier for deduction in an effective month.

Payload:

```json
{
  "supplierId": "supplier-id",
  "date": "2026-06-15",
  "packetCount": 2,
  "perPacketPrice": 100,
  "totalAmount": 200,
  "effectiveMonth": "2026-06"
}
```

The Green Leaf Book only deducts made tea packet totals whose effective month matches the selected book month.

### `POST /office/supplier-month-overrides`

Office-session protected endpoint that sets a month-specific override for one supplier. When `teaPricePerKg` is supplied, it replaces the selected month's default green leaf price for that supplier.

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
  "username": "admin",
  "password": "admin123"
}
```

Response:

```json
{
  "token": "session-token",
  "user": {
    "id": "user-id",
    "username": "admin",
    "displayName": "Admin",
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

Super admin and director endpoint that lists director accounts.

### `GET /admin/users?role=office_user`

Super admin, director, and office-user endpoint that lists office-user accounts. Directors and office users receive view-only access.

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

Accepts finalized desktop data for cloud sync. The desktop sync payload should include only Green Leaf Book source data plus office-user account records:

- `officeUsers`
- `teaLines`
- `suppliers`
- `collectionEntries`
- `monthlySettings`
- `supplierMonthOverrides`
- `advances`
- `fertilizerInstallments`
- `teaPackets`
- `supplierPayments`
- `arrears`
- `monthClosures`

Office-user records sync with password hashes, not plain-text passwords. The response includes the backend office-user directory as `officeUsers` so the desktop app can import web-created office users locally.

The hosted backend stores MySQL `DATE` values as calendar dates when building Green Leaf Books. Date-only collection fields must not be converted through UTC, because a `2026-07-01` collection can otherwise appear as `2026-06-30` on servers ahead of UTC and disappear from the selected month.

### `POST /office/cloud-sync`

Desktop-session protected endpoint on the local desktop sync server. Posts the desktop Green Leaf Book sync payload to the backend `/sync/desktop` endpoint, then imports returned backend office users into the desktop SQLite database.

By default this endpoint runs an incremental sync from the last successful cloud-sync cursor. Send `fullSync: true` to resend all Green Leaf Book source data and office users.

Incremental Green Leaf Book sync still resends display/reference and adjustment data, including tea lines, suppliers, monthly settings, supplier overrides, advances, fertilizer installments, made tea packets, supplier payment state, arrears, and month closures. Posted collection entries remain cursor-based. This keeps daily syncs light while ensuring hosted calculations, paid/factory row colors, special prices, arrears, closed-book notes, and factory-owned balance exclusion do not become stale.

In production, the desktop sync server reads these deployment settings from environment variables:

- `BACKEND_URL`
- `CLOUD_SYNC_TOKEN`

The office user does not enter web credentials in the desktop UI. The logged-in desktop office session authorizes pressing the local sync button, while `CLOUD_SYNC_TOKEN` authenticates the desktop server to the hosted backend.

Request body options:

- `fullSync: true` resends all records instead of using the last successful cursor.
- `syncOfficeUsers: true` includes bidirectional office-user account sync. Omit or set false for daily Green Leaf Book-only syncs; in that mode the desktop does not send local office users or import backend office users.

### `GET /office/cloud-sync/status`

Desktop-session protected endpoint returning the last successful web-app sync and paginated sync runs for the desktop status report. Optional query parameters: `page`, `pageSize`, `status`, and `mode`.

### `GET /green-leaf-book?month=YYYY-MM`

Returns a role-protected monthly green leaf book from synced backend data. The backend uses the shared Green Leaf Book calculation, applies supplier and line special prices, calculates automatic arrears from the previous month using previous-month collection, settings, deduction, payment, and arrears inputs, and returns synced closed-book metadata when available.

### `GET /balances?month=YYYY-MM`

Returns the web Balances view model from synced backend data. Office users, directors, and super admins can view it.

The response includes:

- `lineWiseBankTransfers`: lines marked `Whole Tea Line Bank Transfer` with summed positive supplier balances and any director/admin paid signal
- `supplierWiseBankTransfers`: suppliers whose payment mode is `bank_transfer`, excluding suppliers already included in whole-line bank transfer lines
- `factoryOfficerTransfers`: remaining cash suppliers, positive and negative totals, director/admin added payment rows, and remaining positive balance

Signal rows include read metadata when an office user or super admin has marked them read: `readAt`, `readByUserId`, and `readByDisplayName`.

### `POST /balances/mark-paid`

Director/super-admin endpoint that marks a line-wise or supplier-wise bank transfer row as paid for web signalling only. This does not record a desktop supplier payment.

Payload:

```json
{
  "month": "2026-06",
  "section": "line",
  "targetId": "line-id",
  "targetLabel": "Line A",
  "amount": 12500,
  "comment": "Bank transfer completed"
}
```

Use `"section": "supplier"` with a supplier id for supplier-wise bank transfer rows.

### `POST /balances/factory-officer-payments`

Director/super-admin endpoint that adds a web-only factory officer transfer signal row. The backend recalculates the remaining positive balance by subtracting these added rows from the selected month's positive cash-supplier total. This does not record a desktop supplier payment.

Payload:

```json
{
  "month": "2026-06",
  "amount": 50000,
  "comment": "First transfer to factory officer"
}
```

### `GET /advance-signals`

Returns supplier and tea-line choices plus latest-first web advance signals. Office users, directors, and super admins can view it.

Advance signal rows include read metadata when an office user or super admin has marked them read: `readAt`, `readByUserId`, and `readByDisplayName`.

### `GET /advance-signals/suggestion?scope=supplier|line&targetId=id&month=YYYY-MM`

Returns the suggested advance amount for a supplier or tea line. Supplier suggestions use the shared advance-suggestion logic from the desktop app. Line suggestions sum each active supplier's suggestion for that line and include a `breakdown` array with supplier, leaf value, arrears, existing advances, and suggested amount.

### `POST /advance-signals`

Director/super-admin endpoint that records a web-only advance signal. This does not create or update desktop advance records.

Payload:

```json
{
  "scope": "supplier",
  "targetId": "supplier-id",
  "effectiveMonth": "2026-06",
  "dateGiven": "2026-06-15",
  "amount": 5000,
  "comment": "Requested by director"
}
```

Use `"scope": "line"` with a tea-line id for line advance signals.

### `POST /signals/mark-read`

Office-user/super-admin endpoint that marks a web signal as read so completed signals can be identified in the Balances and Advances listings, or hidden when the user turns off the show-read checkbox. Directors cannot mark signals as read.

Payload:

```json
{
  "type": "advance",
  "id": "signal-id"
}
```

Use `"type": "balance"` for line-wise or supplier-wise balance transfer signals and `"type": "factory"` for factory officer transfer signals.

## Authentication Notes

- API clients can authenticate with `Authorization: Bearer <token>`.
- Browser clients authenticate with an HttpOnly `SameSite=Lax` `tea_session` cookie.
- The cookie is marked `Secure` when `COOKIE_SECURE=true` or `NODE_ENV=production`.
- Backend sessions are stored in MySQL and checked on protected endpoints.
- Inactive users cannot log in and inactive existing sessions are rejected on protected endpoints.
- Role checks restrict user management and desktop sync endpoints. Super admins can manage directors and office users; directors can view director and office-user lists; office users can view only the office-user list.
