# Testing

## Current Automated Tests

Run all available tests:

```powershell
npm.cmd test
```

The current suite covers:

- monthly green leaf book calculations
- supplier-month price and transport overrides
- advance payment suggestion
- backend login, logout, managed web-user creation/update, inactive-login blocking, desktop sync, and green leaf book viewing
- desktop login/session protection, profile password update, logout invalidation, tablet import, duplicate suppression, staging edit/post, and monthly book impact

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
- Filter Tea Lines, Line Users, and Suppliers from their tables.
- Edit each master-data record from its modal and toggle active/inactive.
- Confirm toast messages appear at the bottom-right after save/update/status actions.

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
