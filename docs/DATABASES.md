# Databases

## Desktop Local Database

The desktop app uses SQLite for offline local storage.

Runtime file:

```text
apps/desktop/desktop-data/tea-local-db.sqlite
```

This runtime database is intentionally ignored by Git.

Open it with DB Browser for SQLite or a similar SQLite viewer. MySQL Workbench cannot open this file because it is not MySQL.

The reference desktop schema is:

```text
apps/desktop/src/sqlite-schema.sql
```

## Hosted Backend Database

The backend API uses MySQL for hosted data persistence. Web login, director and office-user management, desktop sync uploads, sessions, and green leaf book reads all go through the MySQL-backed store.

Reference schema:

```text
apps/backend/src/mysql-schema.sql
```

MySQL Workbench is suitable for this hosted backend database.

Configure the backend with `.env` values at the repository root:

```text
NODE_ENV=production
PORT=8080
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_DATABASE=tea_leaf_system
MYSQL_USER=root
MYSQL_PASSWORD=<strong-password>
ALLOWED_ORIGINS=https://<web-app-domain>
COOKIE_SECURE=true
CLOUD_SYNC_TOKEN=<same-long-random-secret-used-by-desktop>
```

The backend creates the configured database, creates missing tables from `apps/backend/src/mysql-schema.sql`, and seeds default web users for the `super_admin`, `director`, and `office_user` roles at startup when the MySQL user has permission. It also keeps the older development `superadmin` account.

## Current Persistence Notes

- Desktop uses SQLite through Node's built-in `node:sqlite` module in the spawned sync server.
- Electron does not load SQLite directly; it starts the sync server as a normal Node process.
- The desktop app can migrate an old `tea-local-db.json` file into SQLite if that JSON file exists beside the new `.sqlite` file.
- Desktop office-user and line-user passwords are stored as salted `scrypt` hashes.
- Web/backend seeds `admin` / `admin123` as super admin, `director` / `director123` as director, and `office` / `office123` as office user. It also keeps `superadmin` / `admin123` for older development access.
- Desktop seeds `admin` / `admin123` for office admin login, `office` / `office123` for office-user login, and `lineuser` / `lineuser123` for tablet line-user login. It also keeps the older tablet `admin` / `admin123` line-user login for compatibility.
- Desktop and hosted backend deployment startup seed the shared supplier master data: 14 tea lines and 496 suppliers from `packages/shared/src/defaultData.mjs`. Supplier and line seed inserts are insert-only so later operational edits are not overwritten on restart.
- Existing legacy plain-text desktop passwords are transparently upgraded after a successful login.
- Desktop posted collection entries store original gross weight, reviewed gross/net weight, print status, tablet saved time, tablet printed time, posted time, and the office user who posted the record. The Collection Records desktop table shows original gross and net weights, while reviewed gross remains stored for audit/sync data.
- Backend web users, including super admins, directors, office users, and sessions, are stored in MySQL.
- Backend logout deletes the current bearer token or web cookie token from the `sessions` table.
- Suppliers are validated against active registered tea lines before saving and store a payment mode of Cash or Bank transfer, defaulting to Cash.
- Tea lines store a `whole_line_bank_transfer` flag used by the web Balances view to group a line's positive supplier balances as a single bank-transfer signal. This flag does not change supplier bill payment labels.
- Monthly settings are stored by calendar month and drive green leaf price, deduction percentage, transport add per kg, and transport deduction per kg in the desktop Green Leaf Book.
- Supplier month overrides store one supplier's special green leaf price for one month. These rows are synced idempotently to the hosted backend so the web Green Leaf Book uses the same effective price as desktop.
- Supplier month overrides are stored separately by supplier and month. A supplier override price takes precedence over the selected month's default green leaf price.
- Advances are stored by supplier, effective month, date given, and amount. They are subtracted from Green Leaf Book balances and shown with date/amount details.
- Web balance and advance signals are stored separately from real desktop payments/advances. They preserve the signalled amount, optional comment, signalling user, signalling timestamp, and read metadata (`read_at`, `read_by_user_id`, `read_by_display_name`) used by office users/admins to clear handled signals from the default web listings. Advance signals also preserve scope, supplier/line target, effective month, date given, suggested amount, and per-supplier suggestion breakdown.
- Green Leaf Book month closures are stored in `month_closures` with close/reopen timestamps, acting office/admin users, notes, and `updated_at`. Closed months remain viewable but reject month-specific desktop edits until an admin reopens them. Closure rows sync to the hosted backend so the web Green Leaf Book can show the same closed-month note.
- Fertilizer issues are stored by supplier, given date, kg given, total rupee value, split count, and effective month or months. Monthly fertilizer installments are generated from those issues and drive the Green Leaf Book fertilizer deduction for each selected month.
- Made tea packet deductions are stored by supplier, given date, packet count, per-packet price, total amount, and effective month. They are included in Green Leaf Book totals and the desktop book table for the selected month only.
- The hosted MySQL backend treats `DATE` columns as calendar dates when returning Green Leaf Book inputs. Do not convert date-only values through UTC ISO strings, because timezone shifts can move first-of-month collections into the previous month.
- The hosted MySQL backend opens MySQL connections with UTC timezone handling for `DATETIME` columns. Timestamp-style values are stored from UTC ISO timestamps and rendered by clients in the user's local/system timezone, while date-only Green Leaf Book fields remain calendar dates. Web and shared month defaults use local/business month values instead of UTC ISO slicing so month selection does not drift around midnight. Android stores tablet saved/printed instants as ISO timestamps while preserving collection date/time as local collection values for receipts and Green Leaf Book grouping.
- Desktop `audit_log` is append-only for office login/logout, create/update/post/payment actions, and successful supplier bill print actions. It stores the acting user, action, entity metadata, summary, timestamp, and sanitized before/after JSON while excluding passwords, hashes, tokens, and authorization values. Viewing bill print previews is not logged.
- Desktop cloud sync run history is retained for operational review with pagination/filtering in the UI. Cleanup keeps recent history for 180 days and preserves at least the latest 500 runs before pruning older rows.
- Local runtime data, WAL files, and logs are excluded from Git.
