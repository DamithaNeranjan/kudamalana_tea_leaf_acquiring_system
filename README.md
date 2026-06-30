# Tea Leaf Acquiring System

Offline-first tea leaf intake and payment system for a tea factory.

## Applications

- `apps/mobile-android`: Native Android tablet app for field collection, offline saved records, offline-capable line-user login, QR pairing to the desktop sync server, master-data download, local Wi-Fi upload, and ESC/POS Bluetooth receipt printing.
- `apps/desktop`: Electron desktop app scaffold and local Wi-Fi sync service. The desktop app is the offline operational source of truth, stores local data in SQLite, and includes office login, profile management, supplier/line/user maintenance, monthly rate settings, staging review, collection-record audit, pairing, and green leaf book views.
- `apps/backend`: Node.js API scaffold for hosted MySQL sync, web user management, and green leaf book access.
- `apps/web`: React/Vite web interface for super admins, directors, and office users.
- `packages/shared`: Shared calculation and identity helpers used by desktop/backend tests.

## Current runnable commands

```powershell
npm.cmd install
npm.cmd test
npm.cmd run backend
npm.cmd run desktop:sync
npm.cmd run web:dev
```

PowerShell script execution blocks `npm`, so use `npm.cmd` on this machine.

The backend persists web/director data in MySQL. Copy `.env.example` to `.env`, set the `MYSQL_*` values, then run `npm.cmd run backend`. The backend creates the configured database and missing tables at startup when the MySQL user has permission.

## Default Accounts

All apps seed a default admin account that remains available after deployment setup:

- Username: `admin`
- Password: `admin123`

Change this before production deployment.

The backend also keeps the older development super admin login:

- Username: `superadmin`
- Password: `admin123`

The desktop app also seeds a default office user for local development:

- Username: `office`
- Password: `office123`

Desktop passwords are stored as salted `scrypt` hashes. Existing legacy plain-text desktop passwords are upgraded after successful login.

## Data Flow

1. Desktop office users log in locally and register line users, tea lines, suppliers, and monthly Green Leaf Book rate settings.
2. Office users open Pair Tablet in the desktop app and scan the QR code from the tablet to save the current desktop sync address.
3. Android tablets use the paired sync URL to log in once online, cache that line-user account for offline login, and sync active tea lines and active suppliers from the desktop over local Wi-Fi before collection rounds.
4. Tablets record collection entries offline, preview receipts, print or reprint saved receipts through paired Bluetooth ESC/POS printers, and keep the saved records editable until upload.
5. Tablets upload unsynced entries back to the desktop over local Wi-Fi.
6. Desktop imports uploaded entries into staging, office users review/edit net weights, then post permanent entries individually or with Post all confirmation.
7. Desktop syncs finalized data to the hosted Node.js + MySQL backend.
8. Directors view month-wise green leaf books in the web app/backend layer.

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
- The sidebar is ordered as Dashboard, Tea Lines, Suppliers, Advances, Fertilizer, Made Tea Packets, Monthly Settings, Green Leaf Book, Pair Tablet, Line Users, Staging Review, Collection Records, and Office Users. Profile opens from the user button in the header.
- Monthly Settings controls tea price per kg, month deduction percentage, transport add per kg, and transport deduction per kg for the selected Green Leaf Book month.
- Supplier editing can set a supplier-specific green leaf price for a month, and Tea Line editing can apply one special price to all active suppliers in that line for a month.
- Advances records supplier, effective month, given date, and amount; it also suggests an advance amount from month kg and effective supplier price minus pending arrears and advances already given for that month.
- Fertilizer records supplier, date given, kg given, total rupee value, one-month or two-month repayment split, and the effective month or months for Green Leaf Book deductions.
- Made Tea Packets records supplier, date given, number of packets, per-packet price, total amount, and the effective month for Green Leaf Book deductions.
- Office users can open Pair Tablet to show a QR code that stores the current desktop sync URL on a tablet.
- Collection Records is a read-only audit table for posted mobile records, office gross/net changes, print status, tablet saved/printed times, and the office user who posted each record.
- Green Leaf Book uses posted collection entries for the selected month, supports supplier-name filtering, highlights calculated Poya day columns, splits advance date, advance amount, and total advance into separate columns, labels kg and rupee columns with units, formats table values with thousand separators and two decimal places when decimals are present, shows total additions before total deductions, includes final kg times price in total additions, colors addition values green and deduction values red, shows balance values in bold, subtracts advances from balance, and shows only the selected month's fertilizer and made tea packet rupee deductions before transport deductions.
- The desktop sidebar has its own scroll area on desktop-sized windows, while section content keeps the standard page layout.
- Desktop form inputs, including login and edit-modal fields, trim leading and trailing spaces before values are used or submitted.
- Saved listing tables are paginated at 10 records per page and show the latest saved records first.
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
