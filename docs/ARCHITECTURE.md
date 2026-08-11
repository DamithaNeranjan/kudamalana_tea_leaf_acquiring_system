# Architecture

This repository is a monorepo for the tea leaf intake and payment system.

## Applications

- `apps/mobile-android`: Native Android tablet application for field collection rounds.
- `apps/desktop`: Electron desktop application and local Wi-Fi sync service for the factory office. It contains local office authentication, profile management, master-data management, monthly rate settings, staging review, collection-record audit, pairing, and green leaf book views.
- `apps/backend`: Node.js API scaffold for cloud sync, hosted MySQL-backed web access, and director balance-transfer signals.
- `apps/web`: React/Vite web interface for directors, super admins, and office users.
- `packages/shared`: Shared ID helpers and Green Leaf Book calculation logic, including automatic arrears carry-forward and advance suggestion calculations.

## Source Of Truth

The desktop app is the operational source of truth while the factory is offline. It stores local data in SQLite and exposes a local sync API on the office network.

The hosted backend is used for cloud backup/reporting and for the director web app.

The backend stores web users, director accounts, office-user accounts, sessions, synced supplier data, collection entries, monthly settings, Green Leaf Book source data, and web-only balance/advance signals in MySQL.

The local desktop server and hosted web backend are intentionally separate sources. The desktop server lives in `apps/desktop/src/server.mjs`, runs beside the Electron app, uses SQLite, and includes local office, tablet sync, audit, printing, and desktop-only workflows. The hosted backend lives in `apps/backend/src/server.mjs`, uses MySQL, and should expose the lighter online API needed by the web app and desktop cloud sync. Production should not host the desktop local server as the web API.

## Data Flow

1. Office users log in locally and register line users, tea lines, suppliers, and monthly Green Leaf Book rate settings in the desktop app.
2. Office users open Pair Tablet and let tablets scan the desktop-generated QR code to save the current local sync URL.
3. Tablets authenticate once online as active line users, cache the line-user login locally for offline use, and download active tea lines and active suppliers from the desktop over local Wi-Fi before collection rounds.
4. Tablets record collections offline, preview receipts, print or reprint saved receipts through paired Bluetooth ESC/POS printers, and keep editable unsynced records locally.
5. Tablets upload unsynced collections back to the desktop.
6. Desktop imports records into staging.
7. Office users review/edit net weights and post permanent entries individually or through a confirmed Post all action.
8. After balance payments are complete, office users can close a Green Leaf Book month in the desktop app; admin users can reopen it for corrections.
9. Desktop syncs the Green Leaf Book source data and closed-month state to the hosted backend and receives backend office-user accounts in the same exchange.
10. Directors, admins, and office users view monthly green leaf books, balance-transfer signals, and advance signals in the web app. Only directors/admins can create web signals.

## Sync Principles

- Tablet uploads must be idempotent by mobile record ID.
- Desktop staging preserves original synced gross weight separately from edited values.
- Posted collection entries preserve tablet saved time, tablet print time, print status, and the office user who posted the record. Tablet saved/printed timestamps are stored as ISO instants and displayed in the viewing device's local/system timezone; collection date/time remain local collection values.
- Supplier advances preserve supplier, effective month, given date, and amount. Advance suggestions use unpaid positive Green Leaf Book balances from the selected effective month through the current month, excluding months already paid or closed, and therefore include the same special prices, deductions, additions, advances, fertilizer, made tea packets, and arrears as the Green Leaf Book.
- Fertilizer inventory is tracked on desktop through registered fertilizer bag types, received stock lots, stock-backed supplier issues, and current stock balances. Fertilizer issues preserve supplier, given date, selected stock lot/type where available, bags issued, calculated kg and rupee value, repayment split count, and effective month or months. Saving an issue generates monthly fertilizer installments, and the Green Leaf Book deducts only installments for the selected month.
- Made tea packet records preserve supplier, given date, packet count, per-packet price, total rupee value, and effective month. The Green Leaf Book deducts only made tea packet records for the selected month.
- Desktop-to-web cloud sync sends the data needed to calculate and display the hosted Green Leaf Book plus office-user account records when that option is enabled. This includes tea-line whole-bank-transfer flags, supplier payment modes, supplier special prices, monthly settings, advances, fertilizer installments, made tea packets, supplier payment state, arrears, month closures, and factory-owned balance-exclusion flags, so the web Green Leaf Book and Balances views match desktop source data. Office users sync bidirectionally with password hashes so desktop-created office users can log in on the web app and web-created office users can log in on the desktop app.
- The desktop app exposes a Sync to Web App menu item below Green Leaf Book. Normal daily syncs use a last-successful-sync cursor for posted collection entries, while Green Leaf Book adjustment/reference rows such as tea lines, suppliers, monthly settings, supplier overrides, advances, fertilizer installments, made tea packets, supplier payment state, arrears, and month closures are resent idempotently each daily sync. A full sync option is available for first-time setup or recovery.
- In production, mobile tablets communicate only with the local desktop sync server. The desktop app communicates with the hosted backend only during Sync to Web App, using configured `BACKEND_URL` and `CLOUD_SYNC_TOKEN`. The web app communicates with the hosted backend API and MySQL database; it does not run against the desktop SQLite database.
- Supplier payment records preserve month, supplier, line, scope, paid amount, calculated balance at payment time, paid timestamp, office user, and note. Recording a supplier or line payment marks the month as paid without rewriting the calculated Green Leaf Book balance.
- Audit log records preserve the acting office user, action type, entity type, entity id/label, timestamp, summary, and sanitized before/after JSON for logins, logouts, creations, updates, checkbox/status changes, staging posts, price override batches, supplier bill print completion, and payment recording. Viewing-only operations and supplier bill print-preview viewing are not logged.
- Negative Green Leaf Book balances continue into the next month as arrears for the same supplier, including suppliers without a recorded payment. Closing a month writes those negative balances to the arrears ledger immediately. Desktop and backend also use the shared automatic arrears calculation as a fallback when rendering a selected month.
- A closed Green Leaf Book month is view-only in desktop and web. Desktop blocks month-specific edits such as posted entries, settings, overrides, advances, fertilizer, made tea packets, and balance payments until a desktop admin reopens the month. Closing and reopening are audited.
- Monthly calculations are calendar-month based. Date-only values are kept as calendar dates, and default month selections use local/business month values rather than UTC ISO slicing.
- Monthly Settings supplies the selected month's green leaf price, deduction percentage, transport add per kg, and transport deduction per kg.
- Supplier-month overrides can replace the selected month's default green leaf price for one supplier or all active suppliers in a selected line.
- Green Leaf Book rows can be created from posted entries even when the supplier master row is unavailable, so staged mobile records remain visible after posting. The desktop book supports supplier-name and line-name filtering, highlights calculated Poya day columns over any row background, centers column headers, shows a color legend, shows advance date, advance amount, and total advance as separate columns, labels kg and rupee columns with units, formats table values with thousand separators and two decimal places when decimals are present, shows total additions before total deductions, includes final kg times price in total additions, colors addition values green and deduction values red, shows balance values in bold, splits footer balance totals into positive and negative totals, shows paid rows in light blue, shows factory-owned rows in light grey, shows the selected month's fertilizer and made tea packet deductions before transport deductions, and subtracts advances from balance.
- Factory-owned suppliers can be marked on the supplier record. Their monthly details remain visible in the Green Leaf Book, but payable balance is not calculated, and the total row can exclude those supplier rows.
- Supplier records include a payment mode of Cash or Bank transfer for supplier bill printing. Tea-line records can also carry a `Whole Tea Line Bank Transfer` flag used only by the web Balances view; it does not override supplier bill payment labels.
- Month-end summaries produce supplier bill details and line-wise totals from posted entries, monthly rates, advances, fertilizer installments, made tea packets, arrears, payment mode, and payment records.
- Supplier-facing identity uses supplier code plus supplier name.
- Suppliers must reference an active registered tea line before they can be saved.
- Tablet collection starts from tea line selection; supplier choices are filtered to active suppliers belonging to the selected active line.

## Desktop UI Structure

- Header: Kudamalana Tea Factory branding, current office session, profile user button, and logout action.
- Sidebar: grouped as Home; Monthly Work; Sync & Records; and Reports. The dashboard mirrors those groups in the same order with shortcut cards, and Profile opens from the header user button. On desktop-sized windows, the sidebar scrolls independently while section content keeps the standard page flow.
- Master data screens: each has create forms, filterable registered-data tables, modal editing, active/inactive actions, and toast feedback.
- Form inputs trim leading and trailing spaces before validation and API submission, including login, profile, regular create forms, and edit modal forms.
- Saved listing tables show 10 records per page and order records by latest saved first.
- Monthly Settings has a saved-settings table and edit action for month-specific calculation rates.
- Supplier screens use registered tea lines as the allowed tea-line source and support one supplier's month-specific green leaf price override and payment mode.
- Tea Line editing can apply one month-specific special green leaf price to all active suppliers belonging to that line.
- Staging Review supports manual import refresh, per-record posting, confirmed Post all, filters for supplier/line/date, and pagination.
- Collection Records is a read-only, paginated audit view with filters for supplier, tea line, date range, posted-by office user, and collector.
- Supplier Bills generates month-end supplier bills and line-wise summaries for all suppliers, a selected supplier, or a selected line. The desktop bill print path shows a collapsed Sinhala print preview by default, prints two half-A4 supplier bills per A4 sheet, supports selected-supplier printing, and records a print audit only after the print dialog completes.
- Balance Payment records supplier-wise or line-wise payments against the calculated Green Leaf Book month, provides searchable supplier selection with debt suppliers shown as inactive options, resets the entry form after successful submission, and lists completed month-end payments with filters, pagination, and latest payments first.
- Sync to Web App shows a paginated, filterable sync-run history. Old sync-run rows are pruned after 180 days while preserving at least the latest 500 runs.
- Audit Reports is in the Reports menu group and provides latest-first session/mutation history with user, action, entity, and date filters.
- Office Users appears under Monthly Work and is managed by desktop admin users; regular office users can view the listing but cannot create, edit, activate, or deactivate office-user accounts.

## Mobile UI Structure

- Login: branded line-user login with Pair / Change Server QR scan action.
- Tablet menu: Tea Collection, Recorded Data, Sync Data, and Master Data.
- Tea Collection: selects active tea line, filters active supplier names to that line, enters bags/gross weight, then opens receipt preview.
- Recorded Data: shows locally saved unsynced records and allows print-only reprints or editing before upload.
- Sync Data: downloads master data and uploads unsynced collections with visible success/failure feedback.
- Master Data: separates synced tea lines and active suppliers into separate sections.

## Web UI Structure

- Header: Kudamalana Tea Factory branding, current web session, and logout action.
- Sidebar: Green Leaf Book, Balances, Advances, plus Directors for super admins and directors, and Office Users for super admins, directors, and office users.
- Login: desktop-aligned two-column portal login with branded copy and credential form.
- Content: monthly green leaf book viewing, balance-transfer signal viewing/marking, advance signal viewing/marking, managed web-user administration, and profile details. Managed user create/edit/activate/deactivate actions are limited to super admins; directors have view-only access to directors and office users, and office users have view-only access to office users. Directors/admins create balance and advance signals, while office users/admins can mark those signals as read. Signal listings include read rows by default, can hide read rows with a checkbox, sort latest-first, and support filters and pagination. Balance signal groups are collapsible and start collapsed.
