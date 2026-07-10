# Testing

## Current Automated Tests

Run all available tests:

```powershell
npm.cmd test
```

The current suite covers:

- monthly green leaf book calculations
- supplier-month price and transport overrides
- selected-month Green Leaf Book rate settings
- green leaf book fallback rows for posted entries whose supplier master row is unavailable
- advance recording and advance payment suggestion
- fertilizer issue recording and generated monthly fertilizer deductions
- made tea packet recording and selected-month Green Leaf Book deductions
- backend login, logout, managed web-user creation/update, inactive-login blocking, desktop sync, and green leaf book viewing
- desktop login/session protection, profile password update, logout invalidation, tablet import, duplicate suppression, staging edit/post, posted-by tracking, audit-log mutation tracking, and monthly book impact

## Manual Checks

Desktop sync server:

```powershell
cd "C:\Users\Damitha\Documents\Tea Leaf Acquiring System\apps\desktop"
node src/server.mjs
```

Then open:

```text
http://127.0.0.1:7070/health
```

Desktop app:

```powershell
cd "C:\Users\Damitha\Documents\Tea Leaf Acquiring System\apps\desktop"
npm.cmd start
```

Manual desktop UI checks:

- Login with `office` / `office123`.
- Login with `admin` / `admin123` and confirm the Office Users menu allows creating, editing, activating, and deactivating regular office users.
- Login with a regular office user and confirm Office Users is visible as a read-only listing, with the Register Office User form and row actions hidden.
- Confirm the desktop sidebar is grouped as Home, Monthly Work, Sync & Records, and Reports; Office Users appears under Monthly Work in both the sidebar and dashboard; the section title bands are visually distinct from active menu items; the sidebar scroll reaches Audit Reports; the dashboard mirrors the same group order; and the header user button opens Profile Management.
- In Profile Management, confirm username, display name, and optional password can be updated, the password show/hide button works, and the layout stays inside the panel in compact windows.
- Create a tea line, then create a supplier using that registered tea line. Confirm supplier payment mode defaults to Cash and can be changed to Bank transfer.
- Confirm supplier save rejects unregistered tea-line names.
- Open Monthly Settings, save the selected month's green leaf price, deduction percentage, transport add, and transport deduction, then load Green Leaf Book for that month.
- Edit a supplier and set a month-specific special price; edit a registered tea line and apply a line-level special price, then confirm the selected month's Green Leaf Book uses the override.
- After setting a supplier-specific special price, run Sync to Web App and confirm the web Green Leaf Book uses the override for that supplier. The sync status should show `supplierMonthOverrides` when override rows exist.
- Open Advances, select a supplier/month, request a suggestion, save an advance with date and amount, and confirm Green Leaf Book shows the advance and subtracts it from balance. Confirm later suggestions deduct advances already given for the same month.
- Open Fertilizer, select a supplier, enter date given, kg, total value, split count, and effective month or months. Confirm the Green Leaf Book deducts only the fertilizer rupee amount assigned to the selected month.
- Open Made Tea Packets, select a supplier, enter date, packet count, per-packet price, total amount, and effective month. Confirm the Green Leaf Book deducts only the made tea packet rupee amount assigned to the selected month.
- Open Supplier Bills, generate bill preview for all suppliers, confirm the print-preview area is collapsed by default, expand it, select a subset of suppliers, and confirm print actions use the Sinhala half-A4 layout with two bills per A4 sheet, fixed two-decimal rupee values, payment-mode text, daily zero kg values, and selected-supplier printing.
- Filter Tea Lines, Line Users, and Suppliers from their tables.
- Confirm saved listing tables show 10 records per page, the latest saved records appear first, and Previous/Next controls page through older records.
- Edit each master-data record from its modal and toggle active/inactive.
- Confirm toast messages appear at the bottom-right after save/update/status actions.
- Upload tablet records, refresh Staging Review, post one record, and confirm it appears in Collection Records with print status, tablet saved/printed times, posted-by user, and local posted time.
- Confirm Post all opens a confirmation modal before posting all staged records.
- Open Audit Reports and confirm create/update/status-checkbox submissions, staging posts, price override batches, successful supplier bill print records, and balance payment records appear latest-first with user/action/entity/date filters. Confirm opening or expanding supplier bill print previews does not create an audit record, and password values are not shown in change details.

Backend:

```powershell
cd "C:\Users\Damitha\Documents\Tea Leaf Acquiring System"
npm.cmd run backend
```

Then open:

```text
http://127.0.0.1:8080/health
```

Web app:

```powershell
cd "C:\Users\Damitha\Documents\Tea Leaf Acquiring System"
npm.cmd run web:dev
```

Then open:

```text
http://127.0.0.1:5173/
```

Manual web UI checks:

- Login with `superadmin` / `admin123`.
- Login with `admin` / `admin123` and confirm it has the same super-admin access.
- Confirm the session name and role appear in the top-right header beside Logout.
- Refresh the page and confirm the web session is restored from the HttpOnly cookie.
- Confirm Logout returns to the login screen and hides protected panels.
- As super admin, confirm Directors and Office Users allow create, edit, activate, and deactivate actions.
- As a director, confirm Directors and Office Users are visible as read-only listing pages.
- As an office user, confirm Office Users is visible as a read-only listing page and Directors is not visible.
- Confirm inactive users cannot log in.
- Load the Green Leaf Book and confirm the table scrolls inside the content panel without creating a full-page scrollbar.
- Confirm the Green Leaf Book splits advances into Advance Date, Advance Amount, and Total Advance columns.
- Confirm the Green Leaf Book supplier filter narrows rows by supplier name, headers are centered, the color legend is visible, Poya day columns are lightly highlighted and override other row background colors, Total Additions appears before Total Deductions, additions are green, deductions are red, balance values are bold, paid rows are light blue, factory-owned rows are light grey, and the balance footer shows separate positive and negative totals.
- Confirm the Green Leaf Book shows the selected month's Fertilizer and Made Tea Packets deductions before Transport Deduct.
- Confirm posted mobile records visible in Collection Records are also represented in the Green Leaf Book for their collection month.
- Confirm first-of-month posted entries, such as `2026-07-01`, appear in the same month on the web Green Leaf Book after cloud sync.
- Confirm web Balances shows whole-line bank transfer lines, supplier bank transfer rows, and factory officer cash-supplier totals for the selected month. Office users should be view-only; directors/admins should be able to add paid signals without creating desktop payment records.
- Confirm web Advances lets directors/admins select supplier or line scope, choose a filterable supplier/line, see suggested amounts, save an advance signal, and view it latest-first. Office users should be view-only, and saving a web advance signal must not change real desktop/web Green Leaf Book advance totals.
