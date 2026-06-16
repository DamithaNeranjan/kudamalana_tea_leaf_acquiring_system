# Tea Leaf Acquiring System

Offline-first tea leaf intake and payment system for a tea factory.

## Applications

- `apps/mobile-android`: Native Android tablet app skeleton for field collection, offline storage, local login, Bluetooth receipt printing, and local Wi-Fi sync.
- `apps/desktop`: Electron desktop app scaffold and local Wi-Fi sync service. The desktop app is the offline operational source of truth, stores local data in SQLite, and includes office login, profile management, supplier/line/user maintenance, staging review, and green leaf book views.
- `apps/backend`: Node.js API scaffold for hosted MySQL sync and web green leaf book access.
- `apps/web`: Static director/super-admin web interface.
- `packages/shared`: Shared calculation and identity helpers used by desktop/backend tests.

## Current runnable commands

```powershell
npm.cmd install
npm.cmd test
npm.cmd run backend
npm.cmd run desktop:sync
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
2. Android tablets sync master data from the desktop over local Wi-Fi before collection rounds.
3. Tablets record collection entries offline and print English receipts.
4. Tablets upload unsynced entries back to the desktop over local Wi-Fi.
5. Desktop imports uploaded entries into staging, office users review/edit net weights, then post permanent entries.
6. Desktop syncs finalized data to the hosted Node.js + MySQL backend.
7. Directors view month-wise green leaf books in the web app/backend layer.

## Web Login Notes

- The web app uses the local backend URL `http://localhost:8080` by default.
- Successful login returns a bearer token stored only in browser memory.
- Logout revokes the current backend session and returns the browser to the login screen.

## Desktop Local Database

The desktop app stores offline data in:

```text
apps/desktop/desktop-data/tea-local-db.sqlite
```

Open this file with a SQLite viewer such as DB Browser for SQLite. MySQL Workbench is for the hosted backend MySQL database, not the desktop offline database.

## Desktop UI Notes

- The app opens to an office login screen.
- The sidebar has separate sections for Tea Lines, Line Users, Suppliers, Staging Review, Green Leaf Book, and Profile.
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
