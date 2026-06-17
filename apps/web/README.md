# Tea Factory Web App

React director/super-admin web UI for the hosted Node.js backend.

## Run

Start the React dev server from the repository root:

```powershell
npm.cmd run web:dev
```

The web app uses backend port `8080` on the same host used to open the web page:

```text
http://<current-web-host>:8080
```

Build for production:

```powershell
npm.cmd run web:build
```

## Structure

```text
src/
  api/          Backend request helper
  components/   Shared layout and UI components
  utils/        Formatting and asset helpers
  views/        Route-like portal views
```

Features:

- Login as director, office user, or super admin.
- Logout revokes the current backend session and clears the browser session.
- View month-wise green leaf book.
- Super admin can use the Directors and Office Users sections to create, edit, activate, deactivate, and review managed accounts.
- Directors can view the Directors and Office Users sections without create, edit, activate, or deactivate controls.
- Inactive users cannot log in.
- The Green Leaf Book table scrolls inside its content panel for long monthly views.
- The web favicon and visible branding use the shared Kudamalana logo asset.

Security notes:

- The web app uses an HttpOnly `SameSite=Lax` cookie for the session token.
- JavaScript cannot read the cookie value directly.
- Refreshing the page restores the logged-in user through `/auth/me`.
- Logout revokes the backend session and clears the cookie.
- Inactive users are rejected at login and protected endpoint checks.
