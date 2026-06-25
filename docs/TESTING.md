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
- desktop login/session protection, profile password update, logout invalidation, tablet import, duplicate suppression, staging edit/post, posted-by audit tracking, and monthly book impact

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
- Create a tea line, then create a supplier using that registered tea line.
- Confirm supplier save rejects unregistered tea-line names.
- Open Monthly Settings, save the selected month's tea price, deduction percentage, transport add, and transport deduction, then load Green Leaf Book for that month.
- Edit a supplier and set a month-specific special price; edit a registered tea line and apply a line-level special price, then confirm the selected month's Green Leaf Book uses the override.
- Open Advances, select a supplier/month, request a suggestion, save an advance with date and amount, and confirm Green Leaf Book shows the advance and subtracts it from balance. Confirm later suggestions deduct advances already given for the same month.
- Open Fertilizer, select a supplier, enter date given, kg, total value, split count, and effective month or months. Confirm the Green Leaf Book deducts only the fertilizer rupee amount assigned to the selected month.
- Open Made Tea Packets, select a supplier, enter date, packet count, per-packet price, total amount, and effective month. Confirm the Green Leaf Book deducts only the made tea packet rupee amount assigned to the selected month.
- Filter Tea Lines, Line Users, and Suppliers from their tables.
- Confirm saved listing tables show 10 records per page, the latest saved records appear first, and Previous/Next controls page through older records.
- Edit each master-data record from its modal and toggle active/inactive.
- Confirm toast messages appear at the bottom-right after save/update/status actions.
- Upload tablet records, refresh Staging Review, post one record, and confirm it appears in Collection Records with print status, tablet saved/printed times, posted-by user, and local posted time.
- Confirm Post all opens a confirmation modal before posting all staged records.

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
- Confirm the session name and role appear in the top-right header beside Logout.
- Refresh the page and confirm the web session is restored from the HttpOnly cookie.
- Confirm Logout returns to the login screen and hides protected panels.
- As super admin, confirm Directors and Office Users allow create, edit, activate, and deactivate actions.
- As a director, confirm Directors and Office Users are visible as read-only listing pages.
- Confirm inactive users cannot log in.
- Load the Green Leaf Book and confirm the table scrolls inside the content panel without creating a full-page scrollbar.
- Confirm the Green Leaf Book splits advances into Advance Date, Advance Amount, and Total Advance columns.
- Confirm the Green Leaf Book shows the selected month's Fertilizer and Made Tea Packets deductions before Transport Deduct.
- Confirm posted mobile records visible in Collection Records are also represented in the Green Leaf Book for their collection month.
