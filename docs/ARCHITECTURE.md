# Architecture

This repository is a monorepo for the tea leaf intake and payment system.

## Applications

- `apps/mobile-android`: Native Android tablet application for field collection rounds.
- `apps/desktop`: Electron desktop application and local Wi-Fi sync service for the factory office. It contains local office authentication, profile management, master-data management, staging review, and green leaf book views.
- `apps/backend`: Node.js API scaffold for cloud sync and hosted MySQL-backed web access.
- `apps/web`: React/Vite director and super-admin web interface.
- `packages/shared`: Shared ID helpers and green leaf book calculation logic.

## Source Of Truth

The desktop app is the operational source of truth while the factory is offline. It stores local data in SQLite and exposes a local sync API on the office network.

The hosted backend is used for cloud backup/reporting and for the director web app.

The backend stores web users, director accounts, office-user accounts, sessions, synced supplier data, collection entries, monthly settings, and green leaf book source data in MySQL.

## Data Flow

1. Office users log in locally and register line users, tea lines, suppliers, and monthly settings in the desktop app.
2. Tablets download master data from the desktop over local Wi-Fi before collection rounds.
3. Tablets record collections offline and print English receipts.
4. Tablets upload unsynced collections back to the desktop.
5. Desktop imports records into staging.
6. Office users review/edit net weights and post permanent entries.
7. Desktop syncs finalized data to the hosted backend.
8. Directors view monthly green leaf books and managed user lists in the web app.

## Sync Principles

- Tablet uploads must be idempotent by mobile record ID.
- Desktop staging preserves original synced gross weight separately from edited values.
- Monthly calculations are calendar-month based.
- Supplier-facing identity uses supplier code plus supplier name.
- Suppliers must reference an active registered tea line before they can be saved.

## Desktop UI Structure

- Header: Kudamalana Tea Factory branding, current office session, and logout action.
- Sidebar: Dashboard, Tea Lines, Line Users, Suppliers, Staging Review, Green Leaf Book, and Profile.
- Master data screens: each has create forms, filterable registered-data tables, modal editing, active/inactive actions, and toast feedback.
- Supplier screens use registered tea lines as the allowed tea-line source.

## Web UI Structure

- Header: Kudamalana Tea Factory branding, current web session, and logout action.
- Sidebar: Green Leaf Book, plus Directors and Office Users for super admins and directors. Profile is opened from the header user icon.
- Login: desktop-aligned two-column portal login with branded copy and credential form.
- Content: monthly green leaf book viewing, managed web-user administration, and profile details. Managed user create/edit/activate/deactivate actions are limited to super admins; directors have view-only access.
