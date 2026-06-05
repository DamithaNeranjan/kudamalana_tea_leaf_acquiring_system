# Tea Leaf Acquiring System

Offline-first tea leaf intake and payment system for a tea factory.

## Applications

- `apps/mobile-android`: Native Android tablet app skeleton for field collection, offline storage, local login, Bluetooth receipt printing, and local Wi-Fi sync.
- `apps/desktop`: Electron desktop app scaffold and local Wi-Fi sync service. The desktop app is the offline operational source of truth and stores local data in SQLite.
- `apps/backend`: Node.js API scaffold for hosted MySQL sync and web green leaf book access.
- `packages/shared`: Shared calculation and identity helpers used by desktop/backend tests.

## Current runnable commands

```powershell
npm.cmd install
npm.cmd test
npm.cmd run backend
npm.cmd run desktop:sync
```

PowerShell script execution blocks `npm`, so use `npm.cmd` on this machine.

## Default Accounts

The backend seeds a default super admin for development:

- Username: `superadmin`
- Password: `admin123`

Change this before production deployment.

## Data Flow

1. Desktop registers line users, tea lines, suppliers, and monthly settings.
2. Android tablets sync master data from the desktop over local Wi-Fi before collection rounds.
3. Tablets record collection entries offline and print English receipts.
4. Tablets upload unsynced entries back to the desktop over local Wi-Fi.
5. Desktop imports uploaded entries into staging, office users review/edit net weights, then post permanent entries.
6. Desktop syncs finalized data to the hosted Node.js + MySQL backend.
7. Directors view month-wise green leaf books in the web app/backend layer.

## Desktop Local Database

The desktop app stores offline data in:

```text
apps/desktop/desktop-data/tea-local-db.sqlite
```

Open this file with a SQLite viewer such as DB Browser for SQLite. MySQL Workbench is for the hosted backend MySQL database, not the desktop offline database.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Development Guide](docs/DEVELOPMENT.md)
- [Databases](docs/DATABASES.md)
- [API Reference](docs/API.md)
- [Testing](docs/TESTING.md)
- [Roadmap](docs/ROADMAP.md)
