# Development Guide

## Requirements

- Node.js 24 or newer for the desktop SQLite sync service.
- npm.
- Android Studio and a JDK for the Android app.
- DB Browser for SQLite or another SQLite viewer for desktop local data inspection.
- MySQL Workbench for hosted backend database inspection.

On this Windows machine, use `npm.cmd` instead of `npm` because PowerShell blocks the `npm.ps1` shim.

## Install

```powershell
cd "C:\Users\Damitha\Documents\Tea Leaf Acquiring System"
npm.cmd install
```

## Run Tests

```powershell
npm.cmd test
```

## Run Desktop App

```powershell
cd "C:\Users\Damitha\Documents\Tea Leaf Acquiring System\apps\desktop"
npm.cmd start
```

The Electron window starts the local sync server on:

```text
http://127.0.0.1:7070
```

Health check:

```powershell
Invoke-RestMethod -Uri http://127.0.0.1:7070/health
```

Default desktop office login:

```text
username: office
password: office123
```

Default admin login for the desktop app, tablet app, and web/backend:

```text
username: admin
password: admin123
```

The desktop app starts at the login screen. After login, the sidebar is grouped as Home, Monthly Work, Sync & Records, and Reports, and the dashboard mirrors those groups with shortcut cards. Profile opens from the user button in the header.
On desktop-sized windows, the sidebar has its own scroll area, section title bands stay visually distinct from active menu items, and the opened menu section keeps the normal content layout.
Desktop form inputs, including login and edit-modal fields, trim leading and trailing spaces before validation and API submission.
Only desktop admin users can create, edit, activate, and deactivate office users. Office users can open the Office Users menu as a read-only listing.
The Pair Tablet section is available to the logged-in office user and shows a QR code for tablet sync pairing.
The Sync to Web App section is available below Green Leaf Book. It uses `BACKEND_URL` and `CLOUD_SYNC_TOKEN` from `.env`, so office users can sync with one button without typing web credentials. Keep Sync Green Leaf Book data only checked for normal daily syncs; uncheck it when office-user accounts also need to sync in both directions. Normal syncs send changed posted collection entries and resend calculation adjustment/reference rows such as supplier special prices, advances, fertilizer installments, made tea packets, supplier payments, arrears, and month closures.
Use Monthly Settings for default month rates. Use supplier editing for one supplier's special monthly price, or edit a registered tea line to apply the same monthly price to every active supplier in that line.
Use supplier editing to choose Cash or Bank transfer as the supplier payment mode and to mark factory-owned suppliers when their leaf details should remain visible but payable balance should not be calculated.
Use Fertilizer to record supplier fertilizer issues and split the rupee deduction across one or two effective Green Leaf Book months.
Use Made Tea Packets to record packets borrowed by suppliers for deduction in a selected effective Green Leaf Book month.
The desktop Green Leaf Book table labels kg and rupee columns with units and formats numeric values with thousand separators, using two decimal places only when decimal values are present. It supports supplier and line filters, optional exclusion of factory-owned suppliers from the total row, separate positive and negative balance footer totals, a color legend, paid-row highlighting, grey factory-owned rows, and Poya day cells that override other row backgrounds.
Use Supplier Bills for month-end supplier/line summary generation. Summaries can be generated for all suppliers, a selected supplier, or a selected line after choosing the option and pressing Generate bill preview. Supplier bill printing uses a Sinhala half-A4 bill format with two bills per A4 sheet, a collapsed print-preview section by default, print-all and selected-supplier print actions, fixed two-decimal rupee values, supplier payment-mode text, and daily kg zeros for days without leaf.
Use Balance Payment for supplier-wise or line-wise payment recording. Payment amounts are automatically suggested when the supplier or line is selected, but the amount field remains editable. Supplier payment selection is searchable, debt suppliers are shown as inactive options, and completed payments are listed with filters, pagination, and latest payments first.
Negative Green Leaf Book balances continue into the next month as arrears, even when no payment is recorded for that supplier. Desktop and web should use the shared automatic arrears logic; the backend must load previous-month calculation inputs for the selected month.
After all positive supplier balances are paid, office users can close a Green Leaf Book month from the desktop book view. Closing requires an in-app confirmation, writes negative balances into next-month arrears, and makes that month read-only until a desktop admin reopens it. The closed-month note is shown in both desktop and web.
Use Audit Reports in the Reports sidebar group to review mutation history. The audit trail logs create/update/post/payment actions, supplier bill print completion, and checkbox/status submissions, but does not log viewing-only operations, print-preview viewing, or sensitive password/token values.

The visible logo and Electron window icon use:

```text
apps/logo/KudamalanaLogo1.png
```

## Run Desktop Sync Server Only

```powershell
cd "C:\Users\Damitha\Documents\Tea Leaf Acquiring System\apps\desktop"
node src/server.mjs
```

## Local Production-Style Run

Before going live, run the desktop/local side and web/hosted side as separate services on your machine:

1. Start MySQL.
2. Start the hosted-style backend API from the repository root:

```powershell
npm.cmd run backend
```

3. In another terminal, start the web frontend:

```powershell
npm.cmd run web:dev
```

4. In another terminal, start the desktop frontend. This also starts the desktop local backend server on port `7070`:

```powershell
npm.cmd run desktop
```

5. Log in to the desktop app and use Sync to Web App.
6. Open the web app, log in through the backend API on `http://127.0.0.1:8080`, and confirm the Green Leaf Book data appears.

When debugging a synced row that exists in MySQL but does not appear in the web Green Leaf Book, first check the selected month and the row's `collection_date`. MySQL `DATE` values must remain calendar-date strings in backend calculation input; UTC conversion can shift first-of-month rows into the previous month.

Timestamp-style fields such as signal marked/read time, sync timestamps, posted times, and tablet saved/printed times should be treated as UTC/ISO instants and rendered in the local/system timezone. Do not use `toISOString().slice(0, 7)` for current month defaults; use local year/month values so Sri Lanka month selection does not drift around midnight.

For normal desktop UI testing, start either `npm.cmd run desktop` or `npm.cmd run desktop:sync`, not both. The Electron desktop app starts its own local server on port `7070`. Running `desktop:sync` separately is useful for API/tablet testing without opening Electron.

For this local production-style run, `.env` must include:

```text
BACKEND_URL=http://localhost:8080
CLOUD_SYNC_TOKEN=<same secret used by backend and desktop>
```

The backend and desktop sync server must use the same `CLOUD_SYNC_TOKEN`. In production, `BACKEND_URL` should point to the hosted API domain, for example `https://api.example.com`.

This local run is deliberately split the same way production should be split. `npm.cmd run desktop` starts the Electron desktop frontend from `apps/desktop/src/main.js` and `apps/desktop/renderer/index.html`, and Electron automatically starts the local desktop server source from `apps/desktop/src/server.mjs`. That desktop side uses the development SQLite data folder `apps/desktop/desktop-data` and is the heavier offline office/tablet server that should run at the factory only. `npm.cmd run desktop:sync` starts only that local desktop server and is useful for API/tablet testing without opening Electron. `npm.cmd run backend` starts the hosted web backend source from `apps/backend/src/server.mjs`; it is the lighter online API and is the one to deploy with MySQL for the web app.

## Run Android Tablet App

Open this folder in Android Studio:

```text
C:\Users\Damitha\Documents\Tea Leaf Acquiring System\apps\mobile-android
```

Use a compatible Android Studio/Gradle setup and JDK 17. The tablet app expects the desktop app or desktop sync server to be running on the same Wi-Fi or hotspot network.

Daily tablet setup:

1. Log in to the desktop app as the office user.
2. Open Pair Tablet and show the QR code.
3. On the tablet, tap Pair / Change Server on the login screen and scan the QR code.
4. Log in with an active line-user account created in the desktop app. The first successful online login stores that account locally so the tablet can later log in offline.
5. Download master data from Sync Data before collection.
6. Upload completed records from Sync Data when the tablet is back on the local office network. The desktop receives them in Staging Review; posted records appear in Collection Records.

For Android 12 and newer, allow Nearby Devices/Bluetooth permission when checking printer status or printing. The tablet prints by opening a Bluetooth socket to a paired ESC/POS receipt printer; Android may show a printer as paired even when it is only connected during the actual print attempt.

## Run Backend API

Configure MySQL values in `.env` first. The backend reads `.env`, creates the configured database and missing tables when the MySQL user has permission, seeds the default `admin` super admin plus the older development `superadmin` account, and stores web/director data in MySQL.

```powershell
cd "C:\Users\Damitha\Documents\Tea Leaf Acquiring System"
npm.cmd run backend
```

Backend health check:

```text
http://127.0.0.1:8080/health
```

Development super admin:

```text
username: superadmin
password: admin123
```

The backend also seeds `admin` / `admin123` as a super admin so the same default admin login works in the web app.

Change this before production use.
