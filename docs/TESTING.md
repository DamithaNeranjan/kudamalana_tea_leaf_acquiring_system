# Testing

## Current Automated Tests

Run all available tests:

```powershell
npm.cmd test
```

Run Android JVM tests and debug build from the repository root:

```powershell
npm.cmd run mobile:verify
```

Or from the Android app directory:

```powershell
cd "C:\Users\Damitha\Documents\Tea Leaf Acquiring System\apps\mobile-android"
.\gradlew.bat testDebugUnitTest assembleDebug
```

The current suite covers:

- monthly green leaf book calculations
- supplier-month price and transport overrides
- selected-month Green Leaf Book rate settings
- green leaf book fallback rows for posted entries whose supplier master row is unavailable
- advance recording and advance payment suggestion
- unpaid-month advance suggestion, paid/closed month exclusion, and closed Green Leaf Book edit blocking
- fertilizer type registration, received fertilizer stock, stock-backed issue recording, stock balance summaries, and generated monthly fertilizer deductions
- made tea packet type registration/editing, type-backed issue recording, price snapshots, and selected-month Green Leaf Book deductions
- backend login, logout, managed web-user creation/update, inactive-login blocking, desktop sync, and green leaf book viewing
- desktop login/session protection, profile password update, logout invalidation, tablet import, duplicate suppression, staging edit/post, posted-by tracking, audit-log mutation tracking, and monthly book impact
- web Green Leaf Book totals, signal filtering, pagination, target labels, and desktop renderer helper behavior

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
- From a paired tablet or `/sync/login`, log in with `lineuser` / `lineuser123` and confirm the default line-user account is active.
- Login with a regular office user and confirm Office Users is visible as a read-only listing, with the Register Office User form and row actions hidden.
- Confirm the desktop sidebar is grouped as Home, Monthly Work, Sync & Records, and Reports; Office Users appears under Monthly Work in both the sidebar and dashboard; the section title bands are visually distinct from active menu items; the sidebar scroll reaches Audit Reports; the dashboard mirrors the same group order; and the header user button opens Profile Management.
- In Profile Management, confirm username, display name, and optional password can be updated, the password show/hide button works, and the layout wraps without clipping buttons or fields as the window narrows.
- Create a tea line, then create a supplier using that registered tea line. Confirm supplier payment mode defaults to Cash and can be changed to Bank transfer.
- Confirm supplier save rejects unregistered tea-line names.
- Open Monthly Settings, save the selected month's green leaf price, deduction percentage, transport add, and transport deduction, then load Green Leaf Book for that month.
- Edit a supplier and set a month-specific special price; edit a registered tea line and apply a line-level special price, then confirm the selected month's Green Leaf Book uses the override.
- After setting a supplier-specific special price, run Sync to Web App and confirm the web Green Leaf Book uses the override for that supplier. The sync status should show `supplierMonthOverrides` when override rows exist.
- Open Advances, type into the supplier field and choose a supplier suggestion, select a month, request a suggestion, save an advance with date and amount, and confirm Green Leaf Book shows the advance and subtracts it from balance. Confirm later suggestions deduct advances already given for the same month.
- Open Fertilizer, register a fertilizer type with name/type/bag weight, record a received stock lot by typing into the fertilizer bag type field and choosing a suggestion, issue bags by typing into the supplier and fertilizer stock fields and choosing suggestions, and confirm kg/value auto-fill from the selected stock. Confirm the issue listing, stock balance summary, and Green Leaf Book deduction for only the fertilizer rupee amount assigned to the selected month.
- Open Made Tea Packets, register a made tea packet type with name/weight/price, issue that packet type by typing into the supplier and packet type fields and choosing suggestions, and confirm total price auto-fills from packet count. Edit the registered packet price afterward and confirm older issued packet rows keep their original price/total while future issues use the new price.
- Open Supplier Bills, generate bill preview for all suppliers, confirm the print-preview area is collapsed by default, expand it, select a subset of suppliers, and confirm print actions use the Sinhala half-A4 layout with two bills per A4 sheet, fixed two-decimal rupee values, payment-mode text, daily zero kg values, and selected-supplier printing.
- Filter Tea Lines, Line Users, and Suppliers from their tables.
- Confirm saved listing tables show 10 records per page, the latest saved records appear first, and Previous/Next controls page through older records.
- Edit each master-data record from its modal and toggle active/inactive.
- Confirm toast messages appear at the bottom-right after save/update/status actions.
- Upload tablet records, refresh Staging Review, post one record, and confirm it appears in Collection Records with print status, tablet saved/printed times, posted-by user, and local posted time.
- Confirm Post all opens a confirmation modal before posting all staged records.
- After all positive balances for a month are paid, close the Green Leaf Book month, confirm the in-app warning/confirmation appears, confirm the closed note appears and month-specific edits are blocked, then log in as `admin` and reopen the month for corrections. Confirm close/reopen audit entries appear.
- Open Sync to Web App and confirm sync run history can be filtered by status/mode and paged through with Previous/Next.
- Open Audit Reports and confirm login/logout, create/update/status-checkbox submissions, staging posts, price override batches, successful supplier bill print records, and balance payment records appear latest-first with user/action/entity/date filters. Confirm opening or expanding supplier bill print previews does not create an audit record, and password values are not shown in change details.
- In the web app, log in as two different directors and confirm each director can edit/delete only their own Balance and Advance signal records, while `admin` can edit/delete any signal. Confirm Balance signal and factory officer payment entries save/display payment done date and reset add-form inputs to defaults after saving. Confirm loading spinners appear during authentication restore, page loading, refresh, save, edit, and mark-read actions. Confirm the Audit Trail menu is visible only to admin and shows web login/logout, signal create/update/delete, and mark-read actions without password/token values, with snapshot details shown as readable field-level before/after rows. Confirm Latest Signals action buttons in Advances use consistent sizing and distinct colors.

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
- Login with `director` / `director123` and confirm Directors and Office Users are visible as read-only listing pages.
- Login with `office` / `office123` and confirm Office Users is visible as a read-only listing page and Directors is not visible.
- Confirm the session name and role appear in the top-right header beside Logout.
- Refresh the page and confirm the web session is restored from the HttpOnly cookie.
- Confirm Logout returns to the login screen and hides protected panels.
- As super admin, confirm Directors and Office Users allow create, edit, activate, and deactivate actions.
- As another manually created director, confirm Directors and Office Users are visible as read-only listing pages.
- As another manually created office user, confirm Office Users is visible as a read-only listing page and Directors is not visible.
- Confirm inactive users cannot log in.
- Load the Green Leaf Book and confirm the table scrolls inside the content panel without creating a full-page scrollbar.
- Confirm the Green Leaf Book splits advances into Advance Date, Advance Amount, and Total Advance columns.
- Confirm the Green Leaf Book supplier filter narrows rows by supplier name, headers are centered, the color legend is visible, Poya day columns are lightly highlighted and override other row background colors, Total Additions appears before Total Deductions, additions are green, deductions are red, balance values are bold, paid rows are light blue, factory-owned rows are light grey, and the balance footer shows separate positive and negative totals.
- Confirm the Green Leaf Book shows the selected month's Fertilizer and Made Tea Packets deductions before Transport Deduct.
- Confirm synced closed months show a compact closed-book note in the web Green Leaf Book without pushing the table far down the page.
- Confirm posted mobile records visible in Collection Records are also represented in the Green Leaf Book for their collection month.
- Confirm first-of-month posted entries, such as `2026-07-01`, appear in the same month on the web Green Leaf Book after cloud sync.
- Confirm tablet saved/printed timestamps, posted timestamps, and web signal marked/read timestamps render in local/system time, while collection dates and default month selectors remain on the expected local business month.
- Confirm web Balances shows whole-line bank transfer lines, supplier bank transfer rows, and factory officer cash-supplier totals for the selected month inside collapsed-by-default sections. Office users should be view-only for payment signalling, directors/admins should be able to add paid signals without creating desktop payment records, and office users/admins should be able to mark unread signals as read. Confirm read and unread signals show latest-first by default, the checkbox can hide read signals, blank comments display as `-`, comment/read-status columns are separate, and filters/pagination work.
- Confirm web Advances lets directors/admins select supplier or line scope, choose a filterable supplier/line, see suggested amounts, save an advance signal, and view it latest-first. Office users should be view-only for advance signalling, office users/admins should be able to mark unread signals as read, read and unread signals should show by default, the checkbox should hide read signals, blank comments should display as `-`, filters/pagination should work, and saving a web advance signal must not change real desktop/web Green Leaf Book advance totals.
