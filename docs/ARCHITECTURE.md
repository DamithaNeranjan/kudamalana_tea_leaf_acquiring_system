# Architecture

This repository is a monorepo for the tea leaf intake and payment system.

## Applications

- `apps/mobile-android`: Native Android tablet application for field collection rounds.
- `apps/desktop`: Electron desktop application and local Wi-Fi sync service for the factory office. It contains local office authentication, profile management, master-data management, monthly rate settings, staging review, collection-record audit, pairing, and green leaf book views.
- `apps/backend`: Node.js API scaffold for cloud sync and hosted MySQL-backed web access.
- `apps/web`: React/Vite director and super-admin web interface.
- `packages/shared`: Shared ID helpers and green leaf book calculation logic.

## Source Of Truth

The desktop app is the operational source of truth while the factory is offline. It stores local data in SQLite and exposes a local sync API on the office network.

The hosted backend is used for cloud backup/reporting and for the director web app.

The backend stores web users, director accounts, office-user accounts, sessions, synced supplier data, collection entries, monthly settings, and green leaf book source data in MySQL.

## Data Flow

1. Office users log in locally and register line users, tea lines, suppliers, and monthly Green Leaf Book rate settings in the desktop app.
2. Office users open Pair Tablet and let tablets scan the desktop-generated QR code to save the current local sync URL.
3. Tablets authenticate once online as active line users, cache the line-user login locally for offline use, and download active tea lines and active suppliers from the desktop over local Wi-Fi before collection rounds.
4. Tablets record collections offline, preview receipts, print or reprint saved receipts through paired Bluetooth ESC/POS printers, and keep editable unsynced records locally.
5. Tablets upload unsynced collections back to the desktop.
6. Desktop imports records into staging.
7. Office users review/edit net weights and post permanent entries individually or through a confirmed Post all action.
8. Desktop syncs finalized data to the hosted backend.
9. Directors view monthly green leaf books and managed user lists in the web app.

## Sync Principles

- Tablet uploads must be idempotent by mobile record ID.
- Desktop staging preserves original synced gross weight separately from edited values.
- Posted collection entries preserve tablet saved time, tablet print time, print status, and the office user who posted the record.
- Supplier advances preserve supplier, effective month, given date, and amount. Advance suggestions use month kg times the effective supplier price minus pending arrears and advances already given for that effective month.
- Monthly calculations are calendar-month based.
- Monthly Settings supplies the selected month's tea price, deduction percentage, transport add per kg, and transport deduction per kg.
- Supplier-month overrides can replace the selected month's default tea price for one supplier or all active suppliers in a selected line.
- Green Leaf Book rows can be created from posted entries even when the supplier master row is unavailable, so staged mobile records remain visible after posting. The desktop book shows advance date, advance amount, and total advance as separate columns, shows made tea packet deductions between fertilizer and transport deductions, and subtracts advances from balance.
- Supplier-facing identity uses supplier code plus supplier name.
- Suppliers must reference an active registered tea line before they can be saved.
- Tablet collection starts from tea line selection; supplier choices are filtered to active suppliers belonging to the selected active line.

## Desktop UI Structure

- Header: Kudamalana Tea Factory branding, current office session, and logout action.
- Sidebar: Dashboard, Tea Lines, Line Users, Suppliers, Monthly Settings, Advances, Staging Review, Collection Records, Green Leaf Book, Pair Tablet, and Profile.
- Master data screens: each has create forms, filterable registered-data tables, modal editing, active/inactive actions, and toast feedback.
- Monthly Settings has a saved-settings table and edit action for month-specific calculation rates.
- Supplier screens use registered tea lines as the allowed tea-line source and support one supplier's month-specific green leaf price override.
- Tea Line editing can apply one month-specific special green leaf price to all active suppliers belonging to that line.
- Staging Review supports manual import refresh, per-record posting, and confirmed Post all.
- Collection Records is a read-only, paginated audit view with filters for supplier, tea line, date range, posted-by office user, and collector.

## Mobile UI Structure

- Login: branded line-user login with Pair / Change Server QR scan action.
- Tablet menu: Tea Collection, Recorded Data, Sync Data, and Master Data.
- Tea Collection: selects active tea line, filters active supplier names to that line, enters bags/gross weight, then opens receipt preview.
- Recorded Data: shows locally saved unsynced records and allows print-only reprints or editing before upload.
- Sync Data: downloads master data and uploads unsynced collections with visible success/failure feedback.
- Master Data: separates synced tea lines and active suppliers into separate sections.

## Web UI Structure

- Header: Kudamalana Tea Factory branding, current web session, and logout action.
- Sidebar: Green Leaf Book, plus Directors and Office Users for super admins and directors. Profile is opened from the header user icon.
- Login: desktop-aligned two-column portal login with branded copy and credential form.
- Content: monthly green leaf book viewing, managed web-user administration, and profile details. Managed user create/edit/activate/deactivate actions are limited to super admins; directors have view-only access.
