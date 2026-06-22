# Tea Leaf Acquiring System

Offline-first tea leaf intake and payment system for a tea factory.

## Applications

- `apps/mobile-android`: Native Android tablet app for field collection, offline saved records, offline-capable line-user login, QR pairing to the desktop sync server, master-data download, local Wi-Fi upload, and ESC/POS Bluetooth receipt printing.
- `apps/desktop`: Electron desktop app scaffold and local Wi-Fi sync service. The desktop app is the offline operational source of truth, stores local data in SQLite, and includes office login, profile management, supplier/line/user maintenance, staging review, collection-record audit, pairing, and green leaf book views.
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

The backend seeds a default super admin for development:

- Username: `superadmin`
- Password: `admin123`

Change this before production deployment.

The desktop app seeds a default office user for local development:

- Username: `office`
- Password: `office123`

Desktop passwords are stored as salted `scrypt` hashes. Existing legacy plain-text desktop passwords are upgraded after successful login.

## Data Flow

1. Desktop office users log in locally and register line users, tea lines, suppliers, and monthly settings.
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
- The sidebar has separate sections for Tea Lines, Line Users, Suppliers, Staging Review, Collection Records, Green Leaf Book, Pair Tablet, and Profile.
- Office users can open Pair Tablet to show a QR code that stores the current desktop sync URL on a tablet.
- Collection Records is a read-only audit table for posted mobile records, office gross/net changes, print status, tablet saved/printed times, and the office user who posted each record.
- Green Leaf Book uses posted collection entries for the selected month, including entries whose supplier master row is no longer available.
- Tea Lines, Line Users, and Suppliers can be created, filtered, edited in a modal, and marked active/inactive.
- Suppliers must be assigned to an already registered active tea line.
- The desktop window uses `apps/logo/KudamalanaLogo1.png` for visible branding and the Electron window icon.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Development Guide](docs/DEVELOPMENT.md)
- [Databases](docs/DATABASES.md)
- [API Reference](docs/API.md)
- [Testing](docs/TESTING.md)
- [Roadmap](docs/ROADMAP.md)
