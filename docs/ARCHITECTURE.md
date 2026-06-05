# Architecture

This repository is a monorepo for the tea leaf intake and payment system.

## Applications

- `apps/mobile-android`: Native Android tablet application for field collection rounds.
- `apps/desktop`: Electron desktop application and local Wi-Fi sync service for the factory office.
- `apps/backend`: Node.js API scaffold for cloud sync and hosted MySQL-backed web access.
- `apps/web`: Static director/super-admin web interface.
- `packages/shared`: Shared ID helpers and green leaf book calculation logic.

## Source Of Truth

The desktop app is the operational source of truth while the factory is offline. It stores local data in SQLite and exposes a local sync API on the office network.

The hosted backend is used for cloud backup/reporting and for the director web app.

## Data Flow

1. Office users register line users, tea lines, suppliers, and monthly settings in the desktop app.
2. Tablets download master data from the desktop over local Wi-Fi before collection rounds.
3. Tablets record collections offline and print English receipts.
4. Tablets upload unsynced collections back to the desktop.
5. Desktop imports records into staging.
6. Office users review/edit net weights and post permanent entries.
7. Desktop syncs finalized data to the hosted backend.
8. Directors view monthly green leaf books in the web app.

## Sync Principles

- Tablet uploads must be idempotent by mobile record ID.
- Desktop staging preserves original synced gross weight separately from edited values.
- Monthly calculations are calendar-month based.
- Supplier-facing identity uses supplier code plus supplier name.

