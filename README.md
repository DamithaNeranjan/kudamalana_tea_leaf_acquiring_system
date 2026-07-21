# Tea Leaf Acquiring System

Offline-first tea leaf intake and payment system for a tea factory.

## Applications

- `apps/mobile-android`: Native Android tablet app for field collection, offline saved records, offline-capable line-user login, QR pairing to the desktop sync server, master-data download, local Wi-Fi upload, and ESC/POS Bluetooth receipt printing.
- `apps/desktop`: Electron desktop app scaffold and local Wi-Fi sync service. The desktop app is the offline operational source of truth, stores local data in SQLite, and includes office login, profile management, supplier/line/user maintenance, monthly rate settings, staging review, collection-record audit, pairing, and green leaf book views.
- `apps/backend`: Node.js API scaffold for hosted MySQL sync, web user management, green leaf book access, and director balance-transfer signals.
- `apps/web`: React/Vite web interface for super admins, directors, and office users, including Green Leaf Book, Balances, and Advances signal views.
- `packages/shared`: Shared calculation and identity helpers used by desktop/backend tests, including the Green Leaf Book and automatic arrears calculation.

## Current runnable commands

```powershell
npm.cmd install
npm.cmd test
npm.cmd run backend
npm.cmd run desktop
npm.cmd run web:dev
```

PowerShell script execution blocks `npm`, so use `npm.cmd` on this machine.

The backend persists web/director data in MySQL. Copy `.env.example` to `.env`, set the `MYSQL_*` values, then run `npm.cmd run backend`. The backend creates the configured database and missing tables at startup when the MySQL user has permission.

`npm.cmd run desktop` starts the Electron desktop frontend and automatically starts the desktop local backend server on port `7070`. Use `npm.cmd run desktop:sync` only when you want the desktop backend server without opening the Electron frontend.

## Default Accounts

Deployment startup seeds one active user for each app role:

| App area | Role | Username | Password |
| --- | --- | --- | --- |
| Web/backend | Super admin | `admin` | `admin123` |
| Web/backend | Director | `director` | `director123` |
| Web/backend | Office user | `office` | `office123` |
| Desktop | Admin | `admin` | `admin123` |
| Desktop | Office user | `office` | `office123` |
| Android tablet | Line user | `lineuser` | `lineuser123` |

The backend also keeps the older development super-admin login `superadmin` / `admin123`, and the desktop sync server keeps the older tablet `admin` / `admin123` line-user login for compatibility.

Change these before production deployment.

Desktop passwords are stored as salted `scrypt` hashes. Existing legacy plain-text desktop passwords are upgraded after successful login.

Deployment startup also seeds the shared supplier master data: 14 tea lines and 496 suppliers. The supplier and tea-line inserts are insert-only, so operational edits made after deployment are not overwritten by later restarts.

## Data Flow

1. Desktop office users log in locally and register line users, tea lines, suppliers, and monthly Green Leaf Book rate settings.
2. Office users open Pair Tablet in the desktop app and scan the QR code from the tablet to save the current desktop sync address.
3. Android tablets use the paired sync URL to log in once online, cache that line-user account for offline login, and sync active tea lines and active suppliers from the desktop over local Wi-Fi before collection rounds.
4. Tablets record collection entries offline, preview receipts, print or reprint saved receipts through paired Bluetooth ESC/POS printers, and keep the saved records editable until upload.
5. Tablets upload unsynced entries back to the desktop over local Wi-Fi.
6. Desktop imports uploaded entries into staging, office users review/edit net weights, then post permanent entries individually or with Post all confirmation.
7. After balance payments are complete, office users can close a Green Leaf Book month in the desktop app; admin users can reopen it for corrections.
8. Desktop syncs finalized Green Leaf Book data and closed-month state to the hosted Node.js + MySQL backend when internet is available.
9. Directors and office users view month-wise green leaf books in the web app/backend layer. Directors and admins can also record web-only balance-transfer and advance signals for office users to act on manually in the desktop app.

## Deployment Model

- The Android mobile app is offline-first. It stores collection records locally and syncs over the local Wi-Fi/hotspot to the desktop sync server.
- The desktop app is also offline-first. It runs a local SQLite database and a local sync server for tablets. It needs internet only when the office user presses Sync to Web App.
- The web app is an online app. It is served together with, or pointed at, the hosted backend API. The backend API and MySQL database must run on online hosting.
- The local desktop server and hosted web backend are separate server sources in this repo. The desktop server is `apps/desktop/src/server.mjs` and stays local with SQLite and tablet/offline office workflows. The hosted web backend is `apps/backend/src/server.mjs` and runs online with MySQL and only the API surface needed by the web app plus desktop cloud sync.
- The desktop-to-web sync uses configured `BACKEND_URL` and `CLOUD_SYNC_TOKEN` values, not human-entered web credentials.
- Before production, test this with three local terminals: hosted-style backend API on `8080`, Electron desktop app with its bundled local server on `7070`, and web frontend on its Vite port. This mirrors the live split between local desktop operations and hosted web operations.

## Web Login Notes

- The web app uses backend port `8080` on the same host used to open the web page.
- Successful web login stores the backend session token in an HttpOnly `SameSite=Lax` cookie.
- Reloading the web app restores the signed-in user through `/auth/me`.
- Logout revokes the current backend session, clears the session cookie, and returns the browser to the login screen.
- Super admins can create, edit, activate, and deactivate director and office-user accounts.
- Directors can view director and office-user lists without making changes.
- Office users can view the office-user list without making changes.
- Inactive web users are blocked from login.
- The web app uses the shared Kudamalana logo as its favicon and app branding.

## Desktop Local Database

The desktop app stores offline data in:

```text
apps/desktop/desktop-data/tea-local-db.sqlite
```

Open this file with a SQLite viewer such as DB Browser for SQLite. MySQL Workbench is for the hosted backend MySQL database, not the desktop offline database.

## Desktop UI Notes

- The app opens to an office login screen.
- The sidebar is grouped as Home; Monthly Work; Sync & Records; and Reports. The dashboard mirrors the same section order with shortcut cards, and Profile opens from the user button in the header.
- Monthly Settings controls green leaf price per kg, month deduction percentage, transport add per kg, and transport deduction per kg for the selected Green Leaf Book month.
- Supplier editing can set a supplier-specific green leaf price for a month, set the supplier payment mode to Cash or Bank transfer, and mark factory-owned suppliers whose Green Leaf Book details are recorded without calculating a payable balance. Tea Line editing can mark `Whole Tea Line Bank Transfer` for web Balances grouping and can apply one special price to all active suppliers in that line for a month.
- Advances records supplier, effective month, given date, and amount; it also suggests an advance amount from unpaid positive Green Leaf Book balances from the selected effective month through the current month, excluding months already paid or closed.
- Fertilizer records supplier, date given, kg given, total rupee value, one-month or two-month repayment split, and the effective month or months for Green Leaf Book deductions.
- Made Tea Packets records supplier, date given, number of packets, per-packet price, total amount, and the effective month for Green Leaf Book deductions.
- Office users can open Pair Tablet to show a QR code that stores the current desktop sync URL on a tablet.
- Office users can open Sync to Web App below Green Leaf Book and press Sync now. Normal daily syncs send posted collection entries changed after the last successful sync and resend Green Leaf Book adjustment/reference data idempotently, including monthly settings, supplier special prices, advances, fertilizer installments, made tea packets, supplier payments, arrears, and month closures. A full sync checkbox is available for setup/recovery, and a Green Leaf Book-only checkbox skips office-user account sync for daily use. Sync run history is paginated, filterable, and pruned after 180 days while keeping at least the latest 500 runs.
- Collection Records is a read-only audit table for posted mobile records, original gross/net weights, print status, tablet saved/printed times rendered in local/system time, and the office user who posted each record.
- Audit Reports shows an append-only office action trail for logins, logouts, creations, updates, checkbox/status changes, staging posts, price override batches, supplier bill print completion, and payment recording. Viewing-only operations and print-preview viewing are not logged, and sensitive values such as passwords are excluded from before/after details.
- Green Leaf Book uses posted collection entries for the selected month, supports supplier-name and line-name filtering, highlights calculated Poya day columns over any row background, includes a color legend, splits advance date, advance amount, and total advance into separate columns, labels kg and rupee columns with units, formats table values with thousand separators and two decimal places when decimals are present, shows total additions before total deductions, includes final kg times price in total additions, colors addition values green and deduction values red, shows balance values in bold, splits the balance footer into positive and negative totals, shows paid rows in light blue and factory-owned rows in light grey, subtracts advances from balance, applies supplier and line special prices, carries negative balances into the next month as arrears, and shows only the selected month's fertilizer and made tea packet rupee deductions before transport deductions. Closed months show a closed-book note in desktop and web and are view-only until reopened by a desktop admin. Desktop and web use shared calculation logic for automatic arrears.
- Supplier Bills generates supplier bill details and line-wise totals for all suppliers, a selected supplier, or a selected line from the same monthly Green Leaf Book data, including daily kg, price, transport, advances, fertilizer installments, arrears, made tea packets, additions, deductions, balances, and payment mode. Supplier bill printing uses a Sinhala half-A4 layout with two bills per A4 sheet by default, fixed two-decimal currency values, a collapsible print preview, and optional supplier-by-supplier selection before printing.
- Balance Payment records supplier-wise or line-wise month-end payments without changing calculated Green Leaf Book balances. Payment amounts are suggested from the selected supplier or line balance but remain editable, supplier payment selection is searchable, debt suppliers are shown as inactive options, successful payment submission resets the entry form to defaults for the loaded month, paid supplier rows are highlighted in light blue, negative balances continue into the next month as arrears, and completed payments are listed with filters, pagination, and latest payments first.
- Web Balances is a view-only menu for office users and an editable signal board for directors/admins. It groups positive balances into collapsible Line wise bank transfers, Supplier wise bank transfers, and Bank transfers to factory officer sections. Marking rows or adding factory officer transfer rows is only a web signal and does not record actual desktop payments. Listings include read signals by default, can hide them with a checkbox, support filters and pagination, show comments and read status in separate columns, and allow office users/admins to mark signals as read.
- Web Advances is a view-only menu for office users and an editable signal board for directors/admins. Directors/admins can signal supplier or line advances with effective month, date given, suggested amount, amount given, and an optional comment. Supplier suggestions use the same advance-suggestion logic as desktop, and line suggestions sum the supplier suggestions for active suppliers in that line with a per-supplier breakdown. These are only web signals and do not create desktop advance records. Listings include read signals by default, can hide them with a checkbox, support filters and pagination, show comments and read status in separate columns, and allow office users/admins to mark signals as read.
- The desktop sidebar has its own scroll area on desktop-sized windows, section headers use a lightly tinted label band with separators, and section content keeps the standard page layout.
- Desktop form inputs, including login and edit-modal fields, trim leading and trailing spaces before values are used or submitted.
- Saved listing tables are paginated at 10 records per page and show the latest saved records first.
- Date-only Green Leaf Book fields stay as calendar dates, while timestamp-style values are stored as ISO/UTC instants and rendered in the user's local/system timezone. Month defaults use local/business month values instead of UTC slicing.
- Tea Lines, Line Users, Office Users, and Suppliers can be created, filtered, edited in a modal, and marked active/inactive. Only desktop admin users can create or manage office users; office users visiting that menu get a read-only listing.
- Suppliers must be assigned to an already registered active tea line.
- The desktop window uses `apps/logo/KudamalanaLogo1.png` for visible branding and the Electron window icon.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Development Guide](docs/DEVELOPMENT.md)
- [Databases](docs/DATABASES.md)
- [API Reference](docs/API.md)
- [Testing](docs/TESTING.md)
- [Roadmap](docs/ROADMAP.md)
